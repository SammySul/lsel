import { describe, expect, test } from "bun:test";
import { Board } from "./board.ts";

const run = (player: string, day: number, score: number, ms: number, name = player) => ({
  day,
  puzzle: "p",
  player,
  name,
  score,
  ms,
  at: day,
});
const rows = (board: Board, day: number) =>
  board.board(day, "p", null).top.map((e) => `${e.name} ${e.score}/${e.ms}`);

describe("Board", () => {
  test("lower wins: ranked by score, then time; a worse run doesn't replace a player's best", () => {
    const board = new Board(":memory:", { better: "lower" });
    board.record(run("ann", 1, 9, 9_000));
    board.record(run("bo", 1, 7, 20_000));
    board.record(run("cy", 1, 7, 12_000));
    board.record(run("ann", 1, 7, 15_000));
    board.record(run("ann", 1, 9, 1_000, "Ann B"));
    expect(rows(board, 1)).toEqual(["cy 7/12000", "Ann B 7/15000", "bo 7/20000"]);
  });

  test("higher wins: the most points first, time breaks ties", () => {
    const board = new Board(":memory:", { better: "higher" });
    board.record(run("ann", 1, 300, 9_000));
    board.record(run("bo", 1, 450, 20_000));
    board.record(run("cy", 1, 450, 12_000));
    board.record(run("ann", 1, 200, 1_000));
    expect(rows(board, 1)).toEqual(["cy 450/12000", "bo 450/20000", "ann 300/9000"]);
  });

  test("past the top, the asker still sees their own rank, counted the board's way", () => {
    const board = new Board(":memory:", { better: "higher", size: 2 });
    for (const [i, points] of [500, 400, 300].entries()) {
      board.record(run(`p${i}`, 1, points, 1_000));
    }
    const { players, top, you } = board.board(1, "p", "p2");
    expect([players, top.length, you]).toEqual([
      3,
      2,
      { rank: 3, name: "p2", score: 300, ms: 1_000, you: true },
    ]);
  });

  test("a run on a puzzle the day no longer has is replaced, even by a worse one", () => {
    const board = new Board(":memory:", { better: "lower" });
    board.record({ ...run("ann", 1, 5, 1_000), puzzle: "old" });
    board.record(run("ann", 1, 9, 9_000));
    expect([rows(board, 1), board.board(1, "old", null).players]).toEqual([["ann 9/9000"], 0]);
  });

  test("a guest's runs join the account, keeping the better run of a day both played", () => {
    const board = new Board(":memory:", { better: "lower" });
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
    const board = new Board(":memory:", { better: "lower" });
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
