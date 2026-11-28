// The daily board's routes against a real replay: runs verified, ranked, kept per player and day.
import { Database } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DAILY, dailyPuzzle, type KeyLog, parseKeys } from "@yank-wars/engine";
import { dailyRoutes, openBoard } from "./daily.ts";
import { PUZZLES } from "./puzzles.ts";
import { Replayer } from "./replay.ts";

const replayer = new Replayer();
afterAll(() => replayer.close());

const DAY = 5;
const noon = DAILY.epoch + (DAY - 1) * DAILY.dayMs + DAILY.dayMs / 2;
const scheduled = (day: number) => {
  const p = dailyPuzzle(PUZZLES.values(), day);
  if (p === undefined) throw new Error(`no daily on day ${day}`);
  return p;
};
const puzzle = scheduled(DAY);
const player = (n: number) => n.toString(16).padStart(32, "0");

// who sent a request is the session's business (accounts.test.ts); here a header stands in for it
const as = (who: number, name = "") => ({ "x-player": player(who), "x-name": name });

function setup() {
  let clock = noon;
  let address = "1.2.3.4";
  const board = openBoard(":memory:");
  const solved: [string, number][] = [];
  const routes = dailyRoutes({
    board,
    puzzles: PUZZLES,
    verify: (p, log) => replayer.verify(p, log),
    player: async (req) => {
      const id = req.headers.get("x-player");
      return id === null ? null : { id, login: null, name: req.headers.get("x-name") ?? "" };
    },
    solved: (id, day) => solved.push([id, day]),
    now: () => clock,
  });
  const call = async (method: string, body?: unknown, who: Record<string, string> = {}) => {
    const url = new URL("http://x/api/daily");
    const req = new Request(url, {
      method,
      headers: { "cf-connecting-ip": address, ...who },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const res = await routes(req, url);
    return { status: res?.status, body: await res?.json() };
  };
  const claim = (who: number, name: string, log: KeyLog, ms: number) =>
    call("POST", { day: DAY, log, ms }, as(who, name));
  return {
    board,
    call,
    claim,
    solved,
    later: (ms: number) => {
      clock += ms;
    },
    from: (a: string) => {
      address = a;
    },
  };
}

describe("/api/daily", () => {
  test("ranks verified runs by keys, then time; each player keeps their best", async () => {
    const { claim, call } = setup();
    const par = puzzle.solution;
    const longer: KeyLog = [...parseKeys("<Esc>"), ...par];
    expect((await claim(1, "ann", longer, 9_000)).status).toBe(200);
    expect((await claim(2, "bo", par, 20_000)).status).toBe(200);
    expect((await claim(3, "cy", par, 12_000)).status).toBe(200);
    // ann improves; a worse run afterwards doesn't undo it, but her new name sticks
    await claim(1, "ann", par, 15_000);
    await claim(1, "Ann B", longer, 1_000);
    const { body } = await call("GET", undefined, as(2));
    expect(body).toEqual({
      day: DAY,
      puzzle: puzzle.id,
      players: 3,
      top: [
        { rank: 1, name: "cy", score: par.length, ms: 12_000, you: false },
        { rank: 2, name: "Ann B", score: par.length, ms: 15_000, you: false },
        { rank: 3, name: "bo", score: par.length, ms: 20_000, you: true },
      ],
      you: null,
    });
  });

  test("a run that doesn't reach the target, or yesterday's, isn't recorded", async () => {
    const { claim, call } = setup();
    expect(await claim(1, "ann", parseKeys("x"), 1_000)).toEqual({
      status: 422,
      body: { error: "the run doesn't match" },
    });
    expect((await call("POST", { day: DAY - 1, log: parseKeys("x"), ms: 1 }, as(1))).status).toBe(
      409,
    );
    expect((await call("POST", { day: DAY, player: "me" }, as(1))).status).toBe(400);
    expect((await call("GET")).body.players).toBe(0);
  });

  test("past the top ten, the asker still sees their own rank", async () => {
    const { claim, call } = setup();
    for (let i = 1; i <= 11; i++) await claim(i, `p${i}`, puzzle.solution, i * 1_000);
    const { body } = await call("GET", undefined, as(11));
    expect([body.top.length, body.you]).toEqual([
      10,
      { rank: 11, name: "p11", score: puzzle.solution.length, ms: 11_000, you: true },
    ]);
  });

  test("at midnight UTC the board starts over on the next day's puzzle", async () => {
    const { claim, call, later } = setup();
    await claim(1, "ann", puzzle.solution, 5_000);
    later(DAILY.dayMs / 2);
    const { body } = await call("GET");
    expect([body.day, body.puzzle, body.players]).toEqual([DAY + 1, scheduled(DAY + 1).id, 0]);
  });

  test("a run needs a signed-in player, and only a verified one counts toward the streak", async () => {
    const { call, claim, solved } = setup();
    expect(await call("POST", { day: DAY, log: puzzle.solution, ms: 1 })).toEqual({
      status: 401,
      body: { error: "not signed in" },
    });
    await claim(1, "", parseKeys("x"), 1_000);
    expect(solved).toEqual([]);
    await claim(1, "", puzzle.solution, 1_000);
    expect(solved).toEqual([[player(1), DAY]]);
    const { body } = await call("GET");
    expect(body.top).toEqual([
      { rank: 1, name: "anonymous", score: puzzle.solution.length, ms: 1_000, you: false },
    ]);
  });

  test("an address gets 30 runs a minute", async () => {
    const { claim, from } = setup();
    const statuses = [];
    for (let i = 0; i < 31; i++) statuses.push((await claim(1, "ann", parseKeys("x"), 1)).status);
    expect([statuses[29], statuses[30]]).toEqual([422, 429]);
    from("5.6.7.8");
    expect((await claim(1, "ann", parseKeys("x"), 1)).status).toBe(422);
  });
});

describe("openBoard", () => {
  test("a board from before lsel's keeps its runs, keys read as the score", () => {
    const path = join(mkdtempSync(join(tmpdir(), "board-")), "daily.sqlite");
    const old = new Database(path, { create: true, strict: true });
    old.run(`CREATE TABLE runs (day INTEGER NOT NULL, player TEXT NOT NULL, puzzle TEXT NOT NULL,
      name TEXT NOT NULL, keys INTEGER NOT NULL, ms INTEGER NOT NULL, at INTEGER NOT NULL,
      PRIMARY KEY (day, player))`);
    old.run("INSERT INTO runs VALUES (5, 'p1', 'swap', 'ann', 12, 9000, 1)");
    old.close();
    expect(openBoard(path).board(5, "swap", null).top).toEqual([
      { rank: 1, name: "ann", score: 12, ms: 9_000, you: false },
    ]);
    expect(openBoard(path).board(5, "swap", null).players).toBe(1);
  });
});
