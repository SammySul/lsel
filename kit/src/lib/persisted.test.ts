import { expect, test } from "bun:test";
import { flushSync } from "svelte";
import * as v from "valibot";
import { persisted, type Store } from "./persisted.svelte.ts";

const Prefs = v.object({
  view: v.fallback(v.picklist(["table", "chart"]), "table"),
  size: v.fallback(v.number(), 16),
});
const FALLBACK = { view: "table", size: 16 } as const;

function memory(initial: Record<string, string> = {}): Store & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, val) => {
      data[k] = val;
    },
  };
}

test("reads what was stored and saves what is assigned", () => {
  const store = memory({ "app:prefs:v1": '{"view":"chart","size":20}' });
  const prefs = persisted("app:prefs:v1", Prefs, FALLBACK, store);
  expect(prefs.value).toEqual({ view: "chart", size: 20 });
  prefs.value = { view: "table", size: 12 };
  flushSync();
  expect(store.data["app:prefs:v1"]).toBe('{"view":"table","size":12}');
});

test("a change inside the value is saved too, so a field can be bound directly", () => {
  const store = memory();
  const prefs = persisted("app:prefs:v1", Prefs, FALLBACK, store);
  prefs.value.size = 30;
  flushSync();
  expect(store.data["app:prefs:v1"]).toBe('{"view":"table","size":30}');
});

test("keeps the readable fields of a stale save", () => {
  const store = memory({ "app:prefs:v1": '{"view":"pie","size":20}' });
  expect(persisted("app:prefs:v1", Prefs, FALLBACK, store).value).toEqual({
    view: "table",
    size: 20,
  });
});

test("falls back on nothing stored, broken JSON, or no storage at all", () => {
  expect(persisted("k", Prefs, FALLBACK, memory()).value).toEqual({ view: "table", size: 16 });
  expect(persisted("k", Prefs, FALLBACK, memory({ k: "{not json" })).value).toEqual({
    view: "table",
    size: 16,
  });
  const none = persisted("k", Prefs, FALLBACK, undefined);
  none.value = { view: "chart", size: 9 };
  expect(() => flushSync()).not.toThrow();
});

test("a storage that throws on write doesn't break the page", () => {
  const full: Store = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  const prefs = persisted("k", Prefs, FALLBACK, full);
  prefs.value = { view: "chart", size: 30 };
  expect(() => flushSync()).not.toThrow();
});
