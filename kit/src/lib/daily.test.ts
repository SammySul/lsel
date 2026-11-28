import { describe, expect, test } from "bun:test";
import { calendar, scheduled } from "./daily.ts";

const days = calendar(Date.UTC(2026, 10, 27));

describe("calendar", () => {
  test("day 1 runs from the epoch to the next UTC midnight", () => {
    expect([
      days.dayOf(Date.UTC(2026, 10, 27)),
      days.dayOf(Date.UTC(2026, 10, 27, 23, 59, 59)),
      days.dayOf(Date.UTC(2026, 10, 28)),
      days.dayOf(Date.UTC(2026, 10, 26, 12)),
    ]).toEqual([1, 1, 2, 0]);
  });

  test("the next day is counted down to its midnight", () => {
    expect(days.msUntilNextDay(Date.UTC(2026, 10, 28, 22, 30))).toBe(90 * 60_000);
  });
});

describe("scheduled", () => {
  const pool = [{ id: "a" }, { id: "b" }, { id: "c" }];

  test("day n is the nth id, and past the end it starts over", () => {
    const order = ["c", "a"];
    expect([1, 2, 3, 0].map((d) => scheduled(pool, d, order)?.id)).toEqual(["c", "a", "c", "a"]);
  });

  test("none when the schedule is empty or names an id the pool lacks", () => {
    expect([scheduled(pool, 1, []), scheduled(pool, 1, ["z"])]).toEqual([undefined, undefined]);
  });
});
