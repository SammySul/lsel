import { expect, test } from "bun:test";
import { type PrefsStorage, readPrefs, writePrefs } from "./prefs.ts";

function memory(): PrefsStorage {
  const items = new Map<string, string>();
  return { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v) };
}

test("nothing stored means every font, at 16px", () => {
  expect(readPrefs(memory())).toEqual({ hidden: [], size: 16 });
  expect(readPrefs(undefined)).toEqual({ hidden: [], size: 16 });
});

test("choices survive a reload", () => {
  const s = memory();
  writePrefs(s, { hidden: ["Inter"], size: 40 });
  expect(readPrefs(s)).toEqual({ hidden: ["Inter"], size: 40 });
});

test("a size out of range is pulled into 8 to 96", () => {
  const s = memory();
  writePrefs(s, { hidden: [], size: 400 });
  expect(readPrefs(s).size).toBe(96);
  writePrefs(s, { hidden: [], size: 0 });
  expect(readPrefs(s).size).toBe(8);
});

test("unreadable values fall back field by field", () => {
  const s = memory();
  s.setItem("typ:prefs:v1", JSON.stringify({ hidden: ["Inter", 3], size: "big" }));
  expect(readPrefs(s)).toEqual({ hidden: ["Inter"], size: 16 });
  s.setItem("typ:prefs:v1", "{not json");
  expect(readPrefs(s)).toEqual({ hidden: [], size: 16 });
});

test("a storage that throws on write is ignored", () => {
  const full: PrefsStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  expect(() => writePrefs(full, { hidden: [], size: 16 })).not.toThrow();
});
