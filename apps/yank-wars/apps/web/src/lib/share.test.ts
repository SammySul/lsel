import { expect, test } from "bun:test";
import { parsePuzzle } from "@yank-wars/engine";
import { shareText } from "./share.ts";

test("names the puzzle, the score against par, the time and the link", () => {
  const p = parsePuzzle({
    id: "indent-body",
    title: "Indent the body",
    difficulty: "easy",
    language: "go",
    tabSize: 4,
    indentUnit: "\t",
    start: "a",
    target: "b",
    solution: "rbx<Esc>",
    source: { kind: "original", author: "yank-wars" },
  });
  expect(shareText(p, 3, 3_250, "https://yankwars.app")).toBe(
    "Yank Wars · Indent the body\n3 keys, par 4 · 0:03.2\nhttps://yankwars.app/#/p/indent-body",
  );
});
