import { describe, expect, test } from "bun:test";
import { ddmin } from "./minimize.ts";

const ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe("ddmin", () => {
  test("keeps exactly the two items a failure needs, in order", async () => {
    const out = await ddmin(ten, async (xs) => xs.includes(3) && xs.includes(7));
    expect(out).toEqual([3, 7]);
  });

  test("keeps an order-dependent pair", async () => {
    const out = await ddmin(["a", "x", "b", "y", "c"], async (xs) => {
      const i = xs.indexOf("x");
      return i >= 0 && xs.indexOf("y") > i;
    });
    expect(out).toEqual(["x", "y"]);
  });

  test("reduces to a single item when one is enough", async () => {
    expect(await ddmin(ten, async (xs) => xs.includes(10))).toEqual([10]);
  });

  test("leaves the input alone when every item is needed", async () => {
    expect(await ddmin([1, 2, 3], async (xs) => xs.length === 3)).toEqual([1, 2, 3]);
  });

  test("finds a 1-minimal result for a threshold failure", async () => {
    // any subset summing to 15 or more fails; 10+5 or 9+6 etc. are minimal, a single item is not
    const out = await ddmin(ten, async (xs) => xs.reduce((a, b) => a + b, 0) >= 15);
    expect(out.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(15);
    for (let i = 0; i < out.length; i++) {
      const without = out.filter((_, j) => j !== i);
      expect(without.reduce((a, b) => a + b, 0)).toBeLessThan(15);
    }
  });

  test("never tries an empty list", async () => {
    const seen: number[] = [];
    await ddmin(ten, async (xs) => {
      seen.push(xs.length);
      return true;
    });
    expect(seen.includes(0)).toBe(false);
  });
});
