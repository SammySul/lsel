import { expect, test } from "bun:test";
import * as v from "valibot";
import { Prefs } from "./prefs.ts";

test("a stored size out of range is pulled into 8 to 96", () => {
  expect(v.parse(Prefs, { hidden: [], size: 400 }).size).toBe(96);
  expect(v.parse(Prefs, { hidden: [], size: 0 }).size).toBe(8);
});

test("unreadable fields fall back one by one", () => {
  expect(v.parse(Prefs, { hidden: ["Inter"], size: "big" })).toEqual({
    hidden: ["Inter"],
    size: 16,
  });
  expect(v.parse(Prefs, { hidden: "Inter", size: 20 })).toEqual({ hidden: [], size: 20 });
});
