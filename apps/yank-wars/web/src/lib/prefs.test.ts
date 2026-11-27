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

test("unreadable stored values fall back field by field, and bests the account would refuse are dropped", () => {
  expect(
    v.parse(Stored, {
      relativeNumbers: "no",
      name: "x".repeat(25),
      best: {
        a: { keys: 3, ms: 10 },
        b: { keys: -1, ms: 10 },
        c: { keys: 1.5, ms: 1 },
        d: "x",
        e: { keys: 0, ms: 10 },
      },
      daily: [1, "2"],
      filter: { difficulty: "expert", unsolved: true },
    }),
  ).toEqual({
    relativeNumbers: true,
    name: "",
    best: { a: { keys: 3, ms: 10 } },
    daily: [],
    filter: { difficulty: null, unsolved: true },
  });
  expect(v.parse(Stored, { relativeNumbers: false, name: "ada" })).toEqual({
    relativeNumbers: false,
    name: "ada",
    best: {},
    daily: [],
    filter: { difficulty: null, unsolved: false },
  });
});

test("an account's side joins this device's: the better best of each puzzle, every day, its name", () => {
  const storage = memoryStorage();
  const prefs = new Prefs(storage);
  prefs.recordBest("a", { keys: 5, ms: 9_000 });
  prefs.recordBest("b", { keys: 4, ms: 1_000 });
  prefs.solvedDaily(2);
  prefs.name = "laptop";
  prefs.adopt({
    name: "ada",
    login: "ada",
    best: { a: { keys: 4, ms: 9_500 }, b: { keys: 6, ms: 1 }, c: { keys: 3, ms: 2_000 } },
    daily: [1, 3],
  });
  const reloaded = new Prefs(storage);
  expect([reloaded.best, reloaded.daily, reloaded.name]).toEqual([
    { a: { keys: 4, ms: 9_500 }, b: { keys: 4, ms: 1_000 }, c: { keys: 3, ms: 2_000 } },
    [1, 2, 3],
    "ada",
  ]);
});

test("a guest account with no name yet leaves this device's name alone", () => {
  const prefs = new Prefs(memoryStorage());
  prefs.name = "laptop";
  prefs.adopt({ name: "", login: null, best: {}, daily: [] });
  expect(prefs.name).toBe("laptop");
});

test("the account hears changes made here, once each, and none of what it brought in", () => {
  const prefs = new Prefs(memoryStorage());
  const heard: string[] = [];
  prefs.listen((change) => heard.push(change));
  prefs.recordBest("a", { keys: 5, ms: 9_000 });
  prefs.recordBest("a", { keys: 6, ms: 1 });
  prefs.solvedDaily(4);
  prefs.solvedDaily(4);
  prefs.name = "ada";
  prefs.name = "ada";
  prefs.adopt({ name: "bo", login: null, best: { z: { keys: 3, ms: 1 } }, daily: [9] });
  expect(heard).toEqual(["best", "daily", "name"]);
});

test("solved dailies from two tabs add up, in order, once each", () => {
  const storage = memoryStorage();
  const tabA = new Prefs(storage);
  const tabB = new Prefs(storage);
  tabA.solvedDaily(3);
  tabB.solvedDaily(1);
  tabB.solvedDaily(3);
  expect(new Prefs(storage).daily).toEqual([1, 3]);
});
