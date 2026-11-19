import { expect, test } from "bun:test";
import * as v from "valibot";
import * as lsel from "./index.ts";

// a project's own tests import the package root, components and all
test("the package root loads in bun test, and its rune modules run", () => {
  expect(typeof lsel.Page).toBe("function");
  const prefs = lsel.persisted("k", v.object({ n: v.number() }), { n: 1 }, undefined);
  prefs.value = { n: 2 };
  expect(prefs.value).toEqual({ n: 2 });
});
