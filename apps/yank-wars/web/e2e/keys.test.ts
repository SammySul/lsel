import { describe, expect, test } from "bun:test";
import { parseKeys } from "@yank-wars/engine";
import { playwrightKey } from "./keys.ts";

describe("playwrightKey (US layout)", () => {
  const cases: [string, string][] = [
    ["a", "KeyA"],
    ["Z", "Shift+KeyZ"],
    ["7", "Digit7"],
    ["%", "Shift+Digit5"],
    ["(", "Shift+Digit9"],
    [":", "Shift+Semicolon"],
    ['"', "Shift+Quote"],
    ["\\", "Backslash"],
    ["~", "Shift+Backquote"],
    [">", "Shift+Period"],
    ["<lt>", "Shift+Comma"],
    ["<Space>", "Space"],
    ["<CR>", "Enter"],
    ["<Esc>", "Escape"],
    ["<BS>", "Backspace"],
    ["<Ins>", "Insert"],
    ["<C-v>", "Control+KeyV"],
    ["<C-r>", "Control+KeyR"],
    ["<C-]>", "Control+BracketRight"],
    ["<C-S-L>", "Control+Shift+KeyL"],
    ["<C-CR>", "Control+Enter"],
    ["<S-Left>", "Shift+ArrowLeft"],
    ["<A-x>", "Alt+KeyX"],
  ];
  for (const [notation, want] of cases) {
    test(notation, () => {
      const [key] = parseKeys(notation);
      if (key === undefined) throw new Error("no key");
      expect(playwrightKey(key)).toBe(want);
    });
  }
});
