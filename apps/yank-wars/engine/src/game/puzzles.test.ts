import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parsePuzzle, replay, verifyRun } from "../index.ts";

const DIR = join(import.meta.dir, "../../../puzzles/handmade");

// Par is derived from the solution; listing it here makes every change to a solution deliberate.
const PAR: Record<string, number> = {
  "add-await": 9,
  "alphabet-soup": 19,
  "always-true": 7,
  "api-url": 7,
  "apply-the-patch": 15,
  "arrow-function": 17,
  backticks: 18,
  batman: 6,
  "bigger-font": 3,
  bookends: 4,
  "box-it": 23,
  "broken-link": 3,
  "build-row": 25,
  "bump-minor": 4,
  "bundle-flags": 7,
  "camel-case": 18,
  "capital-names": 8,
  "caps-lock": 3,
  "check-all": 7,
  checkerboard: 15,
  "cheer-up": 3,
  "class-case": 6,
  "class-name": 7,
  "clear-placeholder": 3,
  "close-gap": 3,
  "close-items": 11,
  "close-paren": 3,
  "close-the-box": 4,
  "comma-separated": 8,
  "commas-to-tabs": 11,
  "comment-block": 10,
  "comment-the-logs": 17,
  "count-to-eight": 11,
  countdown: 20,
  "css-comment": 8,
  "cut-to-the-chase": 7,
  "dead-code": 4,
  "declare-it": 5,
  dedupe: 7,
  "dev-deps": 15,
  "dict-access": 18,
  "dict-to-kwargs": 34,
  "done-and-done": 9,
  "dont-delete-everyone": 3,
  "double-equals": 5,
  "double-recipe": 7,
  "double-spaces": 7,
  "drop-debug": 4,
  "drop-mut": 5,
  "drop-the-else": 5,
  "drop-todo": 5,
  "echo-echo": 5,
  elif: 6,
  "em-not-i": 9,
  "empty-body": 4,
  "empty-not-null": 8,
  "enough-milk": 4,
  "errors-only": 7,
  "es-modules": 22,
  "every-other": 7,
  "export-all": 12,
  "extra-word": 4,
  "f-strings": 16,
  "failures-last": 11,
  "fence-it": 9,
  "fewer-parens": 7,
  "fewer-zeros": 3,
  "fill-in-the-name": 7,
  "first-dash-only": 9,
  "first-names-first": 16,
  "five-seconds": 8,
  "fix-typo": 4,
  fizzbuzz: 34,
  "flip-map": 34,
  "forgot-self": 10,
  "forward-slashes": 10,
  "from-csv": 47,
  "full-width": 6,
  funtion: 4,
  getters: 34,
  "go-export": 5,
  "go-semicolons": 6,
  "goes-to-eleven": 4,
  "group-vars": 17,
  hangman: 6,
  "hide-number": 7,
  "hover-state": 22,
  "html-comment": 12,
  "html-list": 36,
  "in-list": 14,
  "indent-body": 4,
  "inline-it": 13,
  "inside-out": 8,
  "its-a-macro": 5,
  jeopardy: 8,
  "join-lines": 6,
  "json-lines": 12,
  "json-tags": 34,
  "json-to-yaml": 23,
  "just-headline": 3,
  "kebab-class": 6,
  "keep-ours": 5,
  "keep-todos": 10,
  "knock-knock": 3,
  "last-arg": 6,
  leaderboard: 8,
  "less-bold": 6,
  "let-it-infer": 4,
  "level-up": 5,
  liftoff: 8,
  "like-totally": 12,
  "lorem-gone": 5,
  "loud-levels": 6,
  "make-async": 8,
  "make-it-a-link": 12,
  "make-it-constant": 9,
  "make-it-public": 9,
  "make-list": 7,
  "makefile-tabs": 9,
  "markdown-headings": 9,
  "matching-tag": 5,
  "missing-colons": 5,
  "missing-commas": 8,
  "more-spacing": 7,
  "move-port": 7,
  "mut-count": 7,
  "mutable-default": 8,
  "name-the-color": 8,
  "name-the-page": 7,
  "names-only": 8,
  "nest-the-keys": 6,
  "no-comments": 7,
  "no-default-import": 3,
  "no-escape-hatch": 5,
  "no-front-matter": 3,
  "no-gaps": 8,
  "no-green": 6,
  "no-important": 7,
  "no-more-any": 9,
  "no-more-var": 11,
  "norway-problem": 6,
  "not-now": 7,
  "number-lines": 13,
  "number-steps": 5,
  "off-by-one": 4,
  "one-clause-per-line": 11,
  "one-import": 13,
  "one-line-address": 4,
  "one-liner": 7,
  "one-more-server": 5,
  "one-per-line": 11,
  "optional-name": 6,
  outdent: 4,
  "pair-up": 11,
  "phone-book": 21,
  "pin-versions": 7,
  "plain-print": 6,
  plural: 3,
  "pointless-filter": 5,
  "positional-args": 8,
  "pretty-json": 22,
  "py3-prints": 14,
  "python-three": 6,
  "quiet-logs": 9,
  "quote-keys": 15,
  "quote-name": 8,
  "quote-style": 9,
  "quote-words": 13,
  "range-from-zero": 5,
  "real-boolean": 6,
  "redundant-ternary": 6,
  "rename-handler": 8,
  "rename-res": 15,
  "rename-var": 23,
  "reorder-rule": 7,
  "reset-counters": 11,
  "return-err": 8,
  "room-to-breathe": 6,
  "rot13-spoiler": 4,
  "same-file-twice": 7,
  "same-line-braces": 5,
  "same-margin": 12,
  "say-it-twice": 8,
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
  "skip-the-test": 7,
  "skip-two": 4,
  "snake-case": 17,
  "sort-by-surname": 13,
  "sort-imports": 8,
  "spell-it-like-css": 4,
  "split-statements": 5,
  "sql-values": 36,
  "squash-fixups": 7,
  staircase: 12,
  "start-empty": 4,
  "stdlib-first": 4,
  "stop-shouting": 4,
  "strict-inequality": 7,
  "string-enum": 27,
  "strip-numbers": 4,
  "strip-tags": 14,
  "strip-tracking": 3,
  "stuck-key": 20,
  "sudoku-row": 7,
  "swap-args": 35,
  "swap-imports": 3,
  "swap-sections": 12,
  "swap-the-ends": 9,
  "swap-values": 8,
  "table-it": 23,
  "takes-a-name": 7,
  "task-list": 9,
  "teh-typo": 10,
  "template-literal": 23,
  thousands: 9,
  "times-table": 15,
  "title-case": 14,
  tldr: 5,
  "too-many-as": 3,
  "trailing-comma": 4,
  "trailing-spaces": 8,
  "truthy-enough": 6,
  "typed-params": 18,
  uncomment: 6,
  underline: 6,
  unescape: 11,
  "units-please": 8,
  unwrap: 7,
  "unwrap-paragraphs": 5,
  "useless-cat": 12,
  "very-important": 5,
  "win-in-one": 4,
  "wrap-in-call": 19,
  "wrap-in-main": 14,
  "wrong-expectation": 4,
  "wrong-way": 4,
  "yoda-condition": 8,
  "zero-unit": 5,
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
