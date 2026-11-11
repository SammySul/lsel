import { expect, test } from "bun:test";
import { formatClock } from "./clock.ts";

test("formatClock renders m:ss.t, truncating to tenths", () => {
  expect(formatClock(0)).toBe("0:00.0");
  expect(formatClock(99)).toBe("0:00.0");
  expect(formatClock(100)).toBe("0:00.1");
  expect(formatClock(9_999)).toBe("0:09.9");
  expect(formatClock(61_250)).toBe("1:01.2");
  expect(formatClock(240_000)).toBe("4:00.0");
  expect(formatClock(-5)).toBe("0:00.0");
});
