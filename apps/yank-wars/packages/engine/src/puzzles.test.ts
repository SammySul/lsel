import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parsePuzzle, replay, verifyRun } from "./index.ts";

const DIR = join(import.meta.dir, "../../../puzzles/handmade");

// Par is derived from the solution; listing it here makes every change to a solution deliberate.
const PAR: Record<string, number> = {
  "quote-style": 9,
  "rename-var": 23,
  "swap-args": 35,
  "sort-imports": 8,
  "join-lines": 6,
  "comment-block": 9,
  "quote-keys": 15,
  "wrap-in-call": 19,
  "css-comment": 8,
  "indent-body": 4,
};

const files = [...new Bun.Glob("*.json").scanSync({ cwd: DIR })].sort();
const loaded = await Promise.all(
  files.map(async (f) => ({
    file: f,
    id: f.slice(0, -".json".length),
    json: await Bun.file(join(DIR, f)).json(),
  })),
);

test("the handmade set is exactly the listed puzzles", () => {
  expect(files.map((f) => f.slice(0, -".json".length))).toEqual(Object.keys(PAR).sort());
});

test("ids are unique and equal their file names", () => {
  const ids = loaded.map(({ json, id }) => parsePuzzle(json, id).id);
  expect(new Set(ids).size).toBe(ids.length);
});

describe.each(loaded)("$file", ({ id, json }) => {
  const puzzle = parsePuzzle(json, id);

  test("par is the listed reference length, between 3 and 60", () => {
    expect(puzzle.par).toBe(PAR[id] as number);
    expect(puzzle.par).toBeGreaterThanOrEqual(3);
    expect(puzzle.par).toBeLessThanOrEqual(60);
  });

  test("the reference solution reaches the target on its last key", () => {
    const { ok, score, result } = verifyRun(puzzle, puzzle.solution);
    expect(result.errors).toEqual([]);
    expect(result.doc).toBe(puzzle.target);
    expect(result.solvedAt).toBe(puzzle.solution.length - 1);
    expect(score).toBe(puzzle.par);
    expect(ok).toBe(true);
  });

  test("the start is not already solved", () => {
    const r = replay(puzzle, []);
    expect(r.solved).toBe(false);
    expect(r.doc).toBe(puzzle.start);
  });
});
