import { expect, test } from "bun:test";
import { pack } from "./toggles.ts";

const room = { width: 300, gap: 10, pager: 90, lines: 1 };

test("toggles that fit one line are one page, with no room kept for a pager", () => {
  expect(pack([100, 100, 80], room)).toEqual([[0]]);
});

test("toggles that don't fit page, each page's line leaving the pager its room", () => {
  // 300 less the pager and its gap leaves 200 a line: 100 + 10 + 90, then 100 + 10 + 80
  expect(pack([100, 90, 100, 80, 120], room)).toEqual([[0], [2], [4]]);
});

test("on two lines a page fills its first line whole and keeps the pager's room on its last", () => {
  // the second line holds 200: 140 alone, where 140 + 10 + 100 would have fit without the pager
  expect(pack([140, 140, 140, 100, 100, 140], { ...room, lines: 2 })).toEqual([
    [0, 2],
    [3, 5],
  ]);
});

test("a toggle wider than the row gets a line alone, and no toggles is one empty page", () => {
  expect(pack([400, 50], room)).toEqual([[0], [1]]);
  expect(pack([], room)).toEqual([[0]]);
});
