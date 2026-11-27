// The streak count and the daily share line.
import { expect, test } from "bun:test";
import type { Puzzle } from "@yank-wars/engine";
import { dailyShareText, streakOf } from "./daily.ts";

test("a streak counts back from today, or from yesterday while today is unsolved", () => {
  expect(streakOf([1, 2, 3, 5, 6, 7], 7)).toBe(3);
  expect(streakOf([1, 2, 3, 5, 6, 7], 8)).toBe(3);
  expect(streakOf([1, 2, 3, 5, 6, 7], 9)).toBe(0);
  expect(streakOf([], 1)).toBe(0);
});

test("the share line names the day, the score against par, the time and a streak past one", () => {
  const puzzle = { title: "Swap the args", par: 6 } as Puzzle;
  expect(dailyShareText({ day: 12, puzzle }, 5, 42_100, 4, "https://yankwars.app")).toBe(
    "Yank Wars daily #12 · Swap the args\n5 keys, par 6 · 0:42.1 · 4-day streak\nhttps://yankwars.app/#/daily",
  );
  expect(dailyShareText({ day: 1, puzzle }, 6, 9_000, 1, "o")).toBe(
    "Yank Wars daily #1 · Swap the args\n6 keys, par 6 · 0:09.0\no/#/daily",
  );
});
