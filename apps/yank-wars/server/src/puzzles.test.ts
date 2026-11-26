import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { PUZZLES, picker } from "./puzzles.ts";

test("the server carries every handmade puzzle", () => {
  const files = readdirSync(join(import.meta.dir, "../../puzzles/handmade"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
  expect([...PUZZLES.keys()].sort()).toEqual(files);
});

test("a pick fits the difficulty, skips what was played, and repeats only once all were", () => {
  const hard = [...PUZZLES.values()].filter((p) => p.difficulty === "hard").map((p) => p.id);
  const first = picker(PUZZLES, () => 0);
  expect(hard).toContain(first("hard", []));
  expect(first("hard", hard.slice(0, -1))).toBe(hard.at(-1) as string);
  expect(hard).toContain(first("hard", hard));
  expect(PUZZLES.get(picker(PUZZLES, () => 0.999)(null, []))).toBeDefined();
});
