// The daily board's routes against a real replay: runs verified, ranked, kept per player and day.
import { afterAll, describe, expect, test } from "bun:test";
import { DAILY, dailyPuzzle, type KeyLog, parseKeys } from "@yank-wars/engine";
import { Board, dailyRoutes } from "./daily.ts";
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
  const board = new Board(":memory:");
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
        { rank: 1, name: "cy", keys: par.length, ms: 12_000, you: false },
        { rank: 2, name: "Ann B", keys: par.length, ms: 15_000, you: false },
        { rank: 3, name: "bo", keys: par.length, ms: 20_000, you: true },
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
      { rank: 11, name: "p11", keys: puzzle.solution.length, ms: 11_000, you: true },
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
      { rank: 1, name: "anonymous", keys: puzzle.solution.length, ms: 1_000, you: false },
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

describe("Board", () => {
  const run = (player: string, day: number, keys: number, ms: number, name = player) => ({
    day,
    puzzle: "p",
    player,
    name,
    keys,
    ms,
    at: day,
  });
  const rows = (board: Board, day: number) =>
    board.board(day, "p", null).top.map((e) => `${e.name} ${e.keys}/${e.ms}`);

  test("a guest's runs join the account, keeping the better run of a day both played", () => {
    const board = new Board(":memory:");
    board.record(run("acct", 1, 9, 5_000));
    board.record(run("guest", 1, 7, 8_000));
    board.record(run("acct", 2, 6, 1_000));
    board.record(run("guest", 2, 6, 2_000));
    board.record(run("guest", 3, 4, 3_000));
    board.record(run("bob", 3, 5, 1_000));
    board.reassign("guest", "acct", "ada");
    expect([rows(board, 1), rows(board, 2), rows(board, 3)]).toEqual([
      ["ada 7/8000"],
      ["ada 6/1000"],
      ["ada 4/3000", "bob 5/1000"],
    ]);
  });

  test("a rename shows on every run of the player's, and nobody else's", () => {
    const board = new Board(":memory:");
    board.record(run("acct", 1, 9, 5_000));
    board.record(run("acct", 2, 9, 5_000));
    board.record(run("bob", 2, 8, 5_000));
    board.rename("acct", "ada");
    expect([rows(board, 1), rows(board, 2)]).toEqual([
      ["ada 9/5000"],
      ["bob 8/5000", "ada 9/5000"],
    ]);
  });
});
