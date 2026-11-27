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
const puzzle = dailyPuzzle(PUZZLES.values(), DAY);
const player = (n: number) => n.toString(16).padStart(32, "0");

function setup() {
  let clock = noon;
  let address = "1.2.3.4";
  const board = new Board(":memory:");
  const routes = dailyRoutes({
    board,
    puzzles: PUZZLES,
    verify: (p, log) => replayer.verify(p, log),
    now: () => clock,
  });
  const call = async (method: string, body?: unknown, query = "") => {
    const url = new URL(`http://x/api/daily${query}`);
    const req = new Request(url, {
      method,
      headers: { "cf-connecting-ip": address },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const res = await routes(req, url);
    return { status: res?.status, body: await res?.json() };
  };
  const claim = (who: number, name: string, log: KeyLog, ms: number) =>
    call("POST", { day: DAY, player: player(who), name, log, ms });
  return {
    call,
    claim,
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
    const { body } = await call("GET", undefined, `?player=${player(2)}`);
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
    expect(
      (
        await call("POST", {
          day: DAY - 1,
          player: player(1),
          name: "",
          log: parseKeys("x"),
          ms: 1,
        })
      ).status,
    ).toBe(409);
    expect((await call("POST", { day: DAY, player: "me" })).status).toBe(400);
    expect((await call("GET")).body.players).toBe(0);
  });

  test("past the top ten, the asker still sees their own rank", async () => {
    const { claim, call } = setup();
    for (let i = 1; i <= 11; i++) await claim(i, `p${i}`, puzzle.solution, i * 1_000);
    const { body } = await call("GET", undefined, `?player=${player(11)}`);
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
    expect([body.day, body.puzzle, body.players]).toEqual([
      DAY + 1,
      dailyPuzzle(PUZZLES.values(), DAY + 1).id,
      0,
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
