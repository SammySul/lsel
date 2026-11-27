// The daily's day count, its puzzle order and the claim it accepts.
import { describe, expect, test } from "bun:test";
import * as v from "valibot";
import { parseKeys } from "../input/keys.ts";
import { DailyClaim, dailyPuzzle, dayOf, msUntilNextDay, SCHEDULE } from "./daily.ts";

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
  const pool = ["a", "b", "c"].map((id) => ({ id }));

  test("day n is the schedule's nth puzzle, starting over past its end", () => {
    const days = [1, 2, 3, 4, 7].map((d) => dailyPuzzle(pool, d, ["c", "a", "b"])?.id);
    expect(days).toEqual(["c", "a", "b", "c", "c"]);
  });

  test("none when the pool lacks the day's puzzle or nothing is scheduled", () => {
    expect(dailyPuzzle(pool, 1, ["z"])).toBeUndefined();
    expect(dailyPuzzle(pool, 1, [])).toBeUndefined();
  });

  test("the schedule starts on the day 1.5.2 shipped", () => {
    expect(SCHEDULE.slice(0, 3)).toEqual(["one-import", "elif", "strip-tags"]);
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
