import { describe, expect, test } from "bun:test";
import { type KeyEventLike, keyFromEvent, type Platform, type VimKey } from "@yank-wars/engine";
import { FORFEIT_KEY, NUMBERS_KEY, READY_KEYS, RESET_KEY } from "./chords.ts";

function ev(key: string, mods: Partial<KeyEventLike> = {}): KeyEventLike {
  return {
    key,
    code: "",
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    ...mods,
  };
}

const notation = (k: VimKey | undefined): string | undefined => k;

const from = (key: string, mods: Partial<KeyEventLike>, platform: Platform) =>
  notation(keyFromEvent(ev(key, mods), platform));

test("chords have the documented spellings", () => {
  expect(notation(RESET_KEY)).toBe("<C-CR>");
  expect(notation(FORFEIT_KEY)).toBe("<C-S-CR>");
  expect(notation(NUMBERS_KEY)).toBe("<C-S-L>");
  expect(READY_KEYS.map(notation)).toEqual(["<Space>", "<CR>"]);
});

describe.each<Platform>(["mac", "other"])("keyFromEvent on %s produces the chords", (platform) => {
  test("Ctrl+Enter is reset", () => {
    expect(from("Enter", { ctrlKey: true }, platform)).toBe("<C-CR>");
  });
  test("Ctrl+Shift+Enter is forfeit", () => {
    expect(from("Enter", { ctrlKey: true, shiftKey: true }, platform)).toBe("<C-S-CR>");
  });
  test("Ctrl+Shift+l (key L) is the numbers toggle", () => {
    expect(from("L", { ctrlKey: true, shiftKey: true }, platform)).toBe("<C-S-L>");
  });
  test("Space and Enter are the ready keys", () => {
    expect(from(" ", {}, platform)).toBe("<Space>");
    expect(from("Enter", {}, platform)).toBe("<CR>");
  });
});

test("AltGr characters never collide with a chord", () => {
  expect(from("L", { ctrlKey: true, altKey: true, shiftKey: true }, "other")).toBe("L");
  expect(from("{", { ctrlKey: true, altKey: true }, "other")).toBe("{");
});
