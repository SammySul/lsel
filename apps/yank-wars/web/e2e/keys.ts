import type { VimKey } from "@yank-wars/engine";

// US layout: the physical key (KeyboardEvent.code) and whether Shift is held, per printable character.
const US: Readonly<Record<string, readonly [string, boolean]>> = (() => {
  const t: Record<string, readonly [string, boolean]> = {};
  for (const c of "abcdefghijklmnopqrstuvwxyz") {
    t[c] = [`Key${c.toUpperCase()}`, false];
    t[c.toUpperCase()] = [`Key${c.toUpperCase()}`, true];
  }
  const digits = ")!@#$%^&*(";
  for (let d = 0; d <= 9; d++) {
    t[String(d)] = [`Digit${d}`, false];
    t[digits[d] as string] = [`Digit${d}`, true];
  }
  const pairs: [string, string, string][] = [
    ["-", "_", "Minus"],
    ["=", "+", "Equal"],
    ["[", "{", "BracketLeft"],
    ["]", "}", "BracketRight"],
    ["\\", "|", "Backslash"],
    [";", ":", "Semicolon"],
    ["'", '"', "Quote"],
    [",", "<", "Comma"],
    [".", ">", "Period"],
    ["/", "?", "Slash"],
    ["`", "~", "Backquote"],
  ];
  for (const [plain, shifted, code] of pairs) {
    t[plain] = [code, false];
    t[shifted] = [code, true];
  }
  return t;
})();

const NAMED: Readonly<Record<string, string>> = {
  Esc: "Escape",
  CR: "Enter",
  BS: "Backspace",
  Del: "Delete",
  Tab: "Tab",
  Space: "Space",
  Ins: "Insert",
  Left: "ArrowLeft",
  Right: "ArrowRight",
  Up: "ArrowUp",
  Down: "ArrowDown",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
};

/** A Playwright `keyboard.press` string that a US keyboard produces for this key. */
export function playwrightKey(key: VimKey): string {
  if (key === "<lt>") return "Shift+Comma";
  if ([...key].length === 1) {
    const us = US[key];
    if (us === undefined) throw new Error(`no US-layout key for ${JSON.stringify(key)}`);
    return us[1] ? `Shift+${us[0]}` : us[0];
  }
  const m = /^<(C-)?(A-)?(S-)?(.+)>$/.exec(key);
  const base = m?.[4];
  if (m === null || base === undefined) throw new Error(`not a vim key: ${key}`);
  const mods = [m[1] && "Control", m[2] && "Alt", m[3] && "Shift"].filter(Boolean) as string[];
  const named = NAMED[base];
  let code: string;
  if (named !== undefined) code = named;
  else {
    const us = US[base];
    if (us === undefined) throw new Error(`no US-layout key for ${key}`);
    code = us[0];
    if (us[1] && !mods.includes("Shift")) mods.push("Shift");
  }
  return [...mods, code].join("+");
}
