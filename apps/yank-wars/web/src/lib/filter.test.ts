import { expect, test } from "bun:test";
import { comparePuzzles, type PuzzleJson } from "@yank-wars/engine";
import { playablePuzzle } from "@yank-wars/engine/oracle/engine";
import { filterPuzzles, NO_FILTER, nextAfter, quickPick } from "./filter.ts";

const make = (id: string, over: Partial<PuzzleJson>) =>
  playablePuzzle("a", "b", "rbx<Esc>", { ...over, id });

const list = [
  make("one-line", { title: "One line", language: "rust", tags: ["join"] }),
  make("double-quotes", {
    title: "Double quotes",
    difficulty: "medium",
    language: "javascript",
    description: "The linter wants double quotes.",
    tags: ["substitute"],
  }),
  make("stringify", { title: "Stringify", difficulty: "hard", tags: ["macro"] }),
  make("indent", { title: "Indent the body", language: "go" }),
].sort(comparePuzzles);

const ids = (ps: readonly { id: string }[]) => ps.map((p) => p.id);
const none = () => false;

test("no filter shows everything in list order", () => {
  expect(ids(filterPuzzles(list, NO_FILTER, none))).toEqual([
    "indent",
    "one-line",
    "double-quotes",
    "stringify",
  ]);
});

test("difficulty", () => {
  expect(ids(filterPuzzles(list, { ...NO_FILTER, difficulty: "easy" }, none))).toEqual([
    "indent",
    "one-line",
  ]);
  expect(ids(filterPuzzles(list, { ...NO_FILTER, difficulty: "hard" }, none))).toEqual([
    "stringify",
  ]);
});

test("unsolved hides puzzles with a best", () => {
  const solved = (id: string) => id === "indent" || id === "stringify";
  expect(ids(filterPuzzles(list, { ...NO_FILTER, unsolved: true }, solved))).toEqual([
    "one-line",
    "double-quotes",
  ]);
});

test("the query matches title, language, description and tags, case-insensitively", () => {
  const q = (query: string) => ids(filterPuzzles(list, { ...NO_FILTER, query }, none));
  expect(q("INDENT")).toEqual(["indent"]);
  expect(q("rust")).toEqual(["one-line"]);
  expect(q("linter")).toEqual(["double-quotes"]);
  expect(q("macro")).toEqual(["stringify"]);
  expect(q("  ")).toEqual(["indent", "one-line", "double-quotes", "stringify"]);
});

test("every word of the query must match, and filters combine", () => {
  const f = { difficulty: "medium" as const, unsolved: false, query: "quotes javascript" };
  expect(ids(filterPuzzles(list, f, none))).toEqual(["double-quotes"]);
  expect(ids(filterPuzzles(list, { ...f, query: "quotes rust" }, none))).toEqual([]);
});

test("next walks the visible puzzles in list order and wraps", () => {
  const easy = filterPuzzles(list, { ...NO_FILTER, difficulty: "easy" }, none);
  expect(nextAfter(list, easy, "indent")?.id).toBe("one-line");
  expect(nextAfter(list, easy, "one-line")?.id).toBe("indent");
});

test("next from a puzzle the filter hides goes to the next visible one", () => {
  const hard = filterPuzzles(list, { ...NO_FILTER, difficulty: "hard" }, none);
  expect(nextAfter(list, hard, "one-line")?.id).toBe("stringify");
});

test("when the filter shows nothing else, next walks the whole list", () => {
  const onlyThis = filterPuzzles(list, { ...NO_FILTER, query: "stringify" }, none);
  expect(nextAfter(list, onlyThis, "stringify")?.id).toBe("indent");
  expect(nextAfter(list, [], "indent")?.id).toBe("one-line");
});

test("quick play picks among the unsolved shown, and among all shown once every one is solved", () => {
  const solved = (id: string) => id !== "double-quotes" && id !== "stringify";
  expect([0, 0.99].map((r) => quickPick(list, solved, () => r)?.id)).toEqual([
    "double-quotes",
    "stringify",
  ]);
  expect(
    quickPick(
      list,
      () => true,
      () => 0,
    )?.id,
  ).toBe("indent");
  expect(quickPick([], none, () => 0)).toBeUndefined();
});
