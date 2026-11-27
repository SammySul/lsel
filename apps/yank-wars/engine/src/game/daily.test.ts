// The daily's day count, its puzzle order and the claim it accepts.
import { describe, expect, test } from "bun:test";
import * as v from "valibot";
import { parseKeys } from "../input/keys.ts";
import { DailyClaim, dailyPuzzle, dayOf, msUntilNextDay } from "./daily.ts";

const at = (iso: string) => Date.parse(iso);

describe("dayOf", () => {
  test("day 1 is 2026-11-27 UTC, and a day turns at midnight UTC", () => {
    expect(dayOf(at("2026-11-27T00:00:00Z"))).toBe(1);
    expect(dayOf(at("2026-11-27T23:59:59.999Z"))).toBe(1);
    expect(dayOf(at("2026-11-28T00:00:00Z"))).toBe(2);
    expect(dayOf(at("2026-11-26T23:59:59Z"))).toBe(0);
    expect(dayOf(at("2027-11-27T12:00:00Z"))).toBe(366);
  });

  test("msUntilNextDay counts down to the next midnight UTC", () => {
    expect(msUntilNextDay(at("2026-11-27T23:00:00Z"))).toBe(3_600_000);
    expect(msUntilNextDay(at("2026-11-28T00:00:00Z"))).toBe(86_400_000);
  });
});

describe("dailyPuzzle", () => {
  const pool = ["e", "a", "d", "b", "f", "c"].map((id) => ({ id, difficulty: "easy" }));

  test("walks every puzzle once before any repeats, whatever order the pool comes in", () => {
    const days = [1, 2, 3, 4, 5, 6, 7].map((d) => dailyPuzzle(pool, d).id);
    expect(days).toEqual(["f", "e", "d", "c", "b", "a", "f"]);
    expect(dailyPuzzle([...pool].reverse(), 3).id).toBe(dailyPuzzle(pool, 3).id);
  });

  test("never a hard puzzle; a pool of one is always that puzzle; none left throws", () => {
    const hard = { id: "aa", difficulty: "hard" };
    expect([1, 2, 3, 4, 5, 6].map((d) => dailyPuzzle([...pool, hard], d).id)).toEqual([
      "f",
      "e",
      "d",
      "c",
      "b",
      "a",
    ]);
    expect(dailyPuzzle([{ id: "x", difficulty: "medium" }], 42).id).toBe("x");
    expect(() => dailyPuzzle([hard], 1)).toThrow("no puzzles");
  });
});

describe("DailyClaim", () => {
  const claim: DailyClaim = {
    day: 3,
    player: "0123456789abcdef0123456789abcdef",
    name: "  sammy ",
    log: parseKeys("dd"),
    ms: 4_200,
  };

  test("accepts a run and trims the name", () => {
    expect(v.parse(DailyClaim, claim)).toEqual({ ...claim, name: "sammy" });
  });

  test("refuses a bad player id, an empty log, a non-key and a time past the cap", () => {
    for (const bad of [
      { player: "nope" },
      { log: [] },
      { log: ["notakey"] },
      { ms: 240_001 },
      { day: 0 },
      { extra: 1 },
    ]) {
      expect(v.is(DailyClaim, { ...claim, ...bad })).toBe(false);
    }
  });
});
