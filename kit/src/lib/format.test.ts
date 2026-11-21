import { expect, test } from "bun:test";
import { clock, count, duration, percent, plural, when } from "./format.ts";

test("numbers read the US way", () => {
  expect(count(12480)).toBe("12,480");
  expect(count(2.6)).toBe("3");
  expect(plural(1, "match", "matches")).toBe("1 match");
  expect(plural(1200, "match", "matches")).toBe("1,200 matches");
  expect(plural(0, "match", "matches")).toBe("0 matches");
  expect(percent(0.05)).toBe("5%");
});

test("durations round down in the three shapes DESIGN.md names", () => {
  expect(duration(3_723_000, "h:mm")).toBe("1:02");
  expect(duration(59_999, "m:ss")).toBe("0:59");
  expect(duration(754_000, "m:ss")).toBe("12:34");
  expect(duration(83_490, "m:ss.t")).toBe("1:23.4");
  expect(duration(-5, "m:ss.t")).toBe("0:00.0");
});

test("times use a 12-hour clock and dates never say 'at'", () => {
  const at = Date.UTC(2026, 10, 18, 21, 16);
  expect(clock(at, "UTC")).toBe("9:16 PM");
  expect(clock(Date.UTC(2026, 0, 1, 0, 5), "UTC")).toBe("12:05 AM");
  expect(when(at, "UTC")).toBe("Nov 18, 9:16 PM");
  expect(when(new Date(at), "Europe/Berlin")).toBe("Nov 18, 10:16 PM");
});
