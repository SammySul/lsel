import { expect, test } from "bun:test";
import { needsKeyboardNotice } from "./device.ts";

test("a desktop with a mouse or trackpad plays", () => {
  expect(needsKeyboardNotice(true, 1280)).toBe(false);
  expect(needsKeyboardNotice(true, 720)).toBe(false);
});

test("touch-only devices get the notice, however wide", () => {
  expect(needsKeyboardNotice(false, 1280)).toBe(true);
});

test("windows narrower than two panes get the notice", () => {
  expect(needsKeyboardNotice(true, 719)).toBe(true);
  expect(needsKeyboardNotice(true, 390)).toBe(true);
});
