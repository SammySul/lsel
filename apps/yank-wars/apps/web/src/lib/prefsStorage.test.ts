import { expect, test } from "bun:test";
import { type PrefsStorage, readStored, writeBest, writeRelativeNumbers } from "./prefsStorage.ts";

function memoryStorage(): PrefsStorage {
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
  const tabA = readStored(storage);
  const tabB = readStored(storage);
  expect(writeBest(storage, tabA, "quote-style", { keys: 9, ms: 5000 }).better).toBe(true);
  const b = writeBest(storage, tabB, "join-lines", { keys: 6, ms: 4000 });
  expect(b.better).toBe(true);
  const both = { "quote-style": { keys: 9, ms: 5000 }, "join-lines": { keys: 6, ms: 4000 } };
  expect(b.stored.best).toEqual(both);
  expect(readStored(storage).best).toEqual(both);
});

test("a worse run in a stale tab does not replace another tab's best", () => {
  const storage = memoryStorage();
  const tabA = readStored(storage);
  const tabB = readStored(storage);
  writeBest(storage, tabA, "join-lines", { keys: 6, ms: 4000 });
  const b = writeBest(storage, tabB, "join-lines", { keys: 8, ms: 3000 });
  expect(b.better).toBe(false);
  expect(readStored(storage).best).toEqual({ "join-lines": { keys: 6, ms: 4000 } });
});

test("recording a best keeps another tab's line-number choice", () => {
  const storage = memoryStorage();
  const tabA = readStored(storage);
  const tabB = readStored(storage);
  writeRelativeNumbers(storage, tabA, false);
  writeBest(storage, tabB, "join-lines", { keys: 6, ms: 4000 });
  expect(readStored(storage).relativeNumbers).toBe(false);
});

test("without storage the tab still keeps its own bests", () => {
  const mine = readStored(undefined);
  const a = writeBest(undefined, mine, "join-lines", { keys: 6, ms: 4000 });
  const b = writeBest(undefined, a.stored, "quote-style", { keys: 9, ms: 5000 });
  expect(b.stored.best).toEqual({
    "join-lines": { keys: 6, ms: 4000 },
    "quote-style": { keys: 9, ms: 5000 },
  });
});

test("a throwing storage falls back to the tab's own state", () => {
  const broken: PrefsStorage = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
  };
  expect(readStored(broken)).toEqual({ relativeNumbers: true, best: {} });
  const r = writeBest(broken, readStored(broken), "join-lines", { keys: 6, ms: 4000 });
  expect(r).toEqual({
    better: true,
    stored: { relativeNumbers: true, best: { "join-lines": { keys: 6, ms: 4000 } } },
  });
});
