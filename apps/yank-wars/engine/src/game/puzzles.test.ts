import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parsePuzzle, replay, verifyRun } from "../index.ts";

const DIR = join(import.meta.dir, "../../../puzzles/handmade");

// Par is derived from the solution; listing it here makes every change to a solution deliberate.
const PAR: Record<string, number> = {
  "add-await": 9,
  "api-url": 7,
  "arrow-function": 17,
  backticks: 18,
  "bigger-font": 3,
  "broken-link": 3,
  "build-row": 25,
  "bump-minor": 4,
  "camel-case": 18,
  "capital-names": 8,
  "caps-lock": 3,
  "class-case": 6,
  "class-name": 7,
  "clear-placeholder": 3,
  "close-gap": 3,
  "close-items": 11,
  "close-paren": 3,
  "comma-separated": 8,
  "comment-block": 10,
  "count-to-eight": 11,
  "css-comment": 8,
  "dead-code": 4,
  "declare-it": 5,
  dedupe: 7,
  "dict-access": 18,
  "done-and-done": 9,
  "double-equals": 5,
  "double-spaces": 7,
  "drop-debug": 4,
  "drop-mut": 5,
  "drop-todo": 5,
  "echo-echo": 5,
  "empty-body": 4,
  "enough-milk": 4,
  "errors-only": 7,
  "every-other": 7,
  "export-all": 12,
  "extra-word": 4,
  "fewer-parens": 7,
  "fewer-zeros": 3,
  "first-names-first": 16,
  "five-seconds": 8,
  "fix-typo": 4,
  "flip-map": 34,
  "forgot-self": 10,
  "from-csv": 47,
  "full-width": 6,
  funtion: 4,
  "go-semicolons": 6,
  "hide-number": 7,
  "hover-state": 22,
  "indent-body": 4,
  "inline-it": 13,
  "its-a-macro": 5,
  "join-lines": 6,
  "just-headline": 3,
  "kebab-class": 6,
  "last-arg": 6,
  leaderboard: 8,
  "level-up": 5,
  liftoff: 8,
  "lorem-gone": 5,
  "make-async": 8,
  "make-it-constant": 9,
  "make-list": 7,
  "markdown-headings": 9,
  "matching-tag": 5,
  "missing-colons": 5,
  "missing-commas": 8,
  "more-spacing": 7,
  "move-port": 7,
  "mut-count": 7,
  "name-the-color": 8,
  "name-the-page": 7,
  "no-comments": 7,
  "no-default-import": 3,
  "no-front-matter": 3,
  "no-gaps": 8,
  "no-green": 6,
  "no-important": 7,
  "no-more-var": 11,
  "not-now": 7,
  "number-lines": 13,
  "number-steps": 5,
  "off-by-one": 4,
  "one-import": 13,
  "one-line-address": 4,
  "one-liner": 7,
  "one-more-server": 5,
  "one-per-line": 11,
  "optional-name": 6,
  outdent: 4,
  "pair-up": 11,
  "plain-print": 6,
  plural: 3,
  "pretty-json": 22,
  "py3-prints": 14,
  "python-three": 6,
  "quiet-logs": 9,
  "quote-keys": 15,
  "quote-name": 8,
  "quote-style": 9,
  "quote-words": 13,
  "rename-handler": 8,
  "rename-res": 15,
  "rename-var": 23,
  "reorder-rule": 7,
  "reset-counters": 11,
  "return-err": 8,
  "same-margin": 12,
  "secure-url": 4,
  "self-close": 8,
  semicolons: 7,
  "semicolons-everywhere": 8,
  "shebang-first": 5,
  "ship-it": 8,
  "shorter-label": 8,
  "shout-constant": 4,
  "shout-env": 5,
  "shout-sql": 10,
  "shouty-hex": 8,
  "show-result": 11,
  "skip-two": 4,
  "sort-imports": 8,
  "start-empty": 4,
  "stdlib-first": 4,
  "stop-shouting": 4,
  "string-enum": 27,
  "strip-numbers": 4,
  "strip-tags": 14,
  "swap-args": 35,
  "swap-imports": 3,
  "table-it": 23,
  "takes-a-name": 7,
  "teh-typo": 10,
  "template-literal": 23,
  tldr: 5,
  "too-many-as": 3,
  "trailing-comma": 4,
  "trailing-spaces": 8,
  "typed-params": 18,
  uncomment: 6,
  underline: 6,
  "units-please": 8,
  unwrap: 7,
  "very-important": 5,
  "wrap-in-call": 19,
  "wrong-expectation": 4,
  "wrong-way": 4,
};

// vim's own answers for each reference solution, written by `bun run oracle puzzles`.
const VIM = (await Bun.file(
  join(import.meta.dir, "../../oracle/cases/puzzles.vim.json"),
).json()) as {
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
  expect(files.map((f) => f.slice(0, -".json".length)).sort()).toEqual(Object.keys(PAR).sort());
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
