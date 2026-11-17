import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parsePuzzle, replay, verifyRun } from "./index.ts";

const DIR = join(import.meta.dir, "../../../puzzles/handmade");

// Par is derived from the solution; listing it here makes every change to a solution deliberate.
const PAR: Record<string, number> = {
  "api-url": 7,
  "build-row": 25,
  "class-case": 6,
  "close-gap": 3,
  "comment-block": 10,
  "count-to-eight": 11,
  "css-comment": 8,
  "drop-debug": 4,
  "drop-mut": 5,
  "drop-todo": 5,
  "empty-body": 4,
  "fewer-zeros": 3,
  "five-seconds": 8,
  "fix-typo": 4,
  "full-width": 6,
  "indent-body": 4,
  "join-lines": 6,
  "last-arg": 6,
  "make-async": 8,
  "missing-commas": 8,
  "move-port": 7,
  "no-comments": 7,
  "number-steps": 5,
  "one-per-line": 11,
  "optional-name": 6,
  outdent: 4,
  "plain-print": 6,
  "quote-keys": 15,
  "quote-name": 8,
  "quote-style": 9,
  "quote-words": 13,
  "rename-handler": 8,
  "rename-res": 15,
  "rename-var": 23,
  "reorder-rule": 7,
  "same-margin": 12,
  "self-close": 8,
  semicolons: 7,
  "shebang-first": 5,
  "shout-constant": 4,
  "shout-sql": 10,
  "show-result": 11,
  "skip-two": 4,
  "sort-imports": 8,
  "stdlib-first": 4,
  "swap-args": 35,
  "swap-imports": 3,
  uncomment: 6,
  underline: 6,
  "wrap-in-call": 19,
};

// vim's own answers for each reference solution, written by `bun run oracle puzzles`.
const VIM = (await Bun.file(join(import.meta.dir, "../oracle/cases/puzzles.vim.json")).json()) as {
  cases: Record<string, { start: string; keys: string; doc: string }>;
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

test("easy puzzles stay short: par at most 10", () => {
  const long = loaded
    .map(({ json, id }) => parsePuzzle(json, id))
    .filter((p) => p.difficulty === "easy" && p.par > 10)
    .map((p) => `${p.id} (par ${p.par})`);
  expect(long).toEqual([]);
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

  test("vim reaches the target with the reference solution", () => {
    const v = VIM.cases[`puzzle-${id}`];
    expect({ start: v?.start, keys: v?.keys }).toEqual({ start: json.start, keys: json.solution });
    expect(v?.doc).toBe(puzzle.target);
  });

  test("the start is not already solved", () => {
    const r = replay(puzzle, []);
    expect(r.solved).toBe(false);
    expect(r.doc).toBe(puzzle.start);
  });
});
