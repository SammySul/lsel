import { expect, test } from "bun:test";
import { currentRun, isVimKey, type LogEntry, RESET, scoreOf, type VimKey } from "../index.ts";
import { isReset } from "./log.ts";

const k = (s: string) => s as VimKey;
const a = k("a");
const b = k("b");

test("scoreOf counts the keys after the last reset", () => {
  expect(scoreOf([])).toBe(0);
  expect(scoreOf([a, b])).toBe(2);
  expect(scoreOf([a, RESET, b])).toBe(1);
  expect(scoreOf([a, RESET])).toBe(0);
});

test("currentRun is the tail after the last reset", () => {
  expect(currentRun([a, RESET, RESET, b])).toEqual<string[]>(["b"]);
  expect(currentRun([a, b])).toEqual<string[]>(["a", "b"]);
  expect(currentRun([a, RESET])).toEqual<string[]>([]);
});

test("the reset marker is not a key", () => {
  expect(isVimKey(RESET)).toBe(false);
  expect(isReset(RESET)).toBe(true);
  expect(isReset(k("<CR>") as LogEntry)).toBe(false);
});
