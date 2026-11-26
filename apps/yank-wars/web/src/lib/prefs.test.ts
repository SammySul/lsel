import { expect, test } from "bun:test";
import type { Store } from "@sammysul/lsel";
import * as v from "valibot";
import { Prefs, Stored } from "./prefs.svelte.ts";

function memoryStorage(): Store {
  const items = new Map<string, string>();
  return {
    getItem: (k) => items.get(k) ?? null,
    setItem: (k, v) => {
      items.set(k, v);
    },
  };
}

// Two tabs: each loaded the prefs once, before the other wrote.
test("a best recorded in one tab survives a best recorded in another", () => {
  const storage = memoryStorage();
  const tabA = new Prefs(storage);
  const tabB = new Prefs(storage);
  expect(tabA.recordBest("quote-style", { keys: 9, ms: 5000 })).toBe(true);
  expect(tabB.recordBest("join-lines", { keys: 6, ms: 4000 })).toBe(true);
  const both = { "quote-style": { keys: 9, ms: 5000 }, "join-lines": { keys: 6, ms: 4000 } };
  expect(tabB.best).toEqual(both);
  expect(new Prefs(storage).best).toEqual(both);
});

test("a worse run in a stale tab does not replace another tab's best", () => {
  const storage = memoryStorage();
  const tabA = new Prefs(storage);
  const tabB = new Prefs(storage);
  tabA.recordBest("join-lines", { keys: 6, ms: 4000 });
  expect(tabB.recordBest("join-lines", { keys: 8, ms: 3000 })).toBe(false);
  expect(new Prefs(storage).best).toEqual({ "join-lines": { keys: 6, ms: 4000 } });
});

test("recording a best keeps another tab's line-number choice, name and filter", () => {
  const storage = memoryStorage();
  const tabA = new Prefs(storage);
  const tabB = new Prefs(storage);
  tabA.relativeNumbers = false;
  tabA.name = "ada";
  tabA.filter = { difficulty: "hard", unsolved: false, query: "x" };
  tabB.recordBest("join-lines", { keys: 6, ms: 4000 });
  const later = new Prefs(storage);
  expect([later.relativeNumbers, later.name, later.filter]).toEqual([
    false,
    "ada",
    { difficulty: "hard", unsolved: false, query: "" },
  ]);
});

test("a throwing storage leaves the tab its own bests", () => {
  const broken = {
    getItem: (): string | null => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
  };
  const prefs = new Prefs(broken);
  expect([prefs.relativeNumbers, prefs.filter]).toEqual([
    true,
    { difficulty: null, unsolved: false, query: "" },
  ]);
  expect(prefs.recordBest("join-lines", { keys: 6, ms: 4000 })).toBe(true);
  expect(prefs.recordBest("quote-style", { keys: 9, ms: 5000 })).toBe(true);
  expect(prefs.best).toEqual({
    "join-lines": { keys: 6, ms: 4000 },
    "quote-style": { keys: 9, ms: 5000 },
  });
});

test("unreadable stored values fall back field by field, and bad bests are dropped", () => {
  expect(
    v.parse(Stored, {
      relativeNumbers: "no",
      name: "x".repeat(25),
      best: { a: { keys: 3, ms: 10 }, b: { keys: -1, ms: 10 }, c: { keys: 1.5, ms: 1 }, d: "x" },
      filter: { difficulty: "expert", unsolved: true },
    }),
  ).toEqual({
    relativeNumbers: true,
    name: "",
    best: { a: { keys: 3, ms: 10 } },
    filter: { difficulty: null, unsolved: true },
  });
  expect(v.parse(Stored, { relativeNumbers: false, name: "ada" })).toEqual({
    relativeNumbers: false,
    name: "ada",
    best: {},
    filter: { difficulty: null, unsolved: false },
  });
});
