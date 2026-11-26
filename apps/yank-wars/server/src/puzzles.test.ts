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

test("a pick skips what was played, and repeats only once all were", () => {
  const ids = [...PUZZLES.keys()];
  const first = picker(PUZZLES, () => 0);
  expect(first([])).toBe(ids[0] as string);
  expect(first(ids.slice(0, -1))).toBe(ids.at(-1) as string);
  expect(first(ids)).toBe(ids[0] as string);
  expect(picker(PUZZLES, () => 0.999)([])).toBe(ids.at(-1) as string);
});
