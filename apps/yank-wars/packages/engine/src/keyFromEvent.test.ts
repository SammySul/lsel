import { describe, expect, test } from "bun:test";
import { Vim } from "@replit/codemirror-vim";
import { detectPlatform, type KeyEventLike, keyFromEvent, type Platform } from "./index.ts";

type Mods = Partial<Omit<KeyEventLike, "key">> & { repeat?: boolean };

function ev(key: string, mods: Mods = {}): KeyEventLike {
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

const from = (key: string, mods: Mods = {}, platform: Platform = "other"): string | undefined =>
  keyFromEvent(ev(key, mods), platform);

describe("keyFromEvent", () => {
  test.each<[string, string, Mods, string]>([
    ["a", "a", {}, "a"],
    ["Shift+a", "A", { shiftKey: true }, "A"],
    ["Ctrl+a", "a", { ctrlKey: true }, "<C-a>"],
    ["Ctrl+Shift+a", "A", { ctrlKey: true, shiftKey: true }, "<C-S-A>"],
    ["space", " ", {}, "<Space>"],
    ["Shift+Space", " ", { shiftKey: true }, "<Space>"],
    ["Shift+Enter", "Enter", { shiftKey: true }, "<CR>"],
    ["Shift+Tab", "Tab", { shiftKey: true }, "<Tab>"],
    ["Shift+Backspace", "Backspace", { shiftKey: true }, "<BS>"],
    ["Shift+Delete", "Delete", { shiftKey: true }, "<Del>"],
    ["Shift+Escape", "Escape", { shiftKey: true }, "<Esc>"],
    ["Shift+Insert", "Insert", { shiftKey: true }, "<Ins>"],
    ["Shift+ArrowLeft", "ArrowLeft", { shiftKey: true }, "<S-Left>"],
    ["Ctrl+Shift+Enter", "Enter", { ctrlKey: true, shiftKey: true }, "<C-S-CR>"],
    ["Ctrl+Enter", "Enter", { ctrlKey: true }, "<C-CR>"],
    ["Ctrl+Alt+ArrowLeft", "ArrowLeft", { ctrlKey: true, altKey: true }, "<C-A-Left>"],
    ["Enter", "Enter", {}, "<CR>"],
    ["Backspace", "Backspace", {}, "<BS>"],
    ["Delete", "Delete", {}, "<Del>"],
    ["Escape", "Escape", {}, "<Esc>"],
    ["Insert", "Insert", {}, "<Ins>"],
    ["Tab", "Tab", {}, "<Tab>"],
    ["ArrowLeft", "ArrowLeft", {}, "<Left>"],
    ["ArrowRight", "ArrowRight", {}, "<Right>"],
    ["ArrowUp", "ArrowUp", {}, "<Up>"],
    ["ArrowDown", "ArrowDown", {}, "<Down>"],
    ["Home", "Home", {}, "<Home>"],
    ["End", "End", {}, "<End>"],
    ["PageUp", "PageUp", {}, "<PageUp>"],
    ["PageDown", "PageDown", {}, "<PageDown>"],
    ["<", "<", {}, "<lt>"],
    ["Shift+< (US)", "<", { shiftKey: true }, "<lt>"],
    [">", ">", { shiftKey: true }, ">"],
    ["AltGr { (DE)", "{", { ctrlKey: true, altKey: true }, "{"],
    ["AltGr @ with Shift", "@", { ctrlKey: true, altKey: true, shiftKey: true }, "@"],
    ["Alt+s (other)", "s", { altKey: true }, "<A-s>"],
    ["Alt+Shift+s (other)", "S", { altKey: true, shiftKey: true }, "<A-S-S>"],
    ["Ctrl+v", "v", { ctrlKey: true }, "<C-v>"],
    ["Ctrl+Shift+l", "L", { ctrlKey: true, shiftKey: true }, "<C-S-L>"],
    ["u umlaut", "ü", {}, "ü"],
    ["emoji", "😀", {}, "😀"],
    ["Ctrl+[", "[", { ctrlKey: true }, "<C-[>"],
  ])("%s", (_name, key, mods, expected) => {
    expect(from(key, mods)).toBe(expected);
  });

  test("mac Option+s produces the character, not <A-s>", () => {
    expect(from("ß", { altKey: true }, "mac")).toBe("ß");
    expect(from("s", { altKey: true }, "mac")).toBe("s");
  });

  test("mac Option on a named key keeps A-", () => {
    expect(from("ArrowLeft", { altKey: true }, "mac")).toBe("<A-Left>");
  });

  test("mac Ctrl+Option on a character is treated as AltGr", () => {
    expect(from("x", { ctrlKey: true, altKey: true }, "mac")).toBe("x");
  });

  test("emoji is two UTF-16 units but one key", () => {
    expect("😀".length).toBe(2);
    expect(from("😀")).toBe("😀");
  });

  test.each([
    ["Meta+c", "c", { metaKey: true }],
    ["Meta+Enter", "Enter", { metaKey: true }],
    ["Meta+Shift+a", "A", { metaKey: true, shiftKey: true }],
    ["composing", "a", { isComposing: true }],
    ["Ctrl+<", "<", { ctrlKey: true }],
    ["Ctrl+Shift+> (US)", ">", { ctrlKey: true, shiftKey: true }],
    ["Alt+< (other)", "<", { altKey: true }],
    ["multi-char key name", "MediaPlayPause", {}],
    ["Ctrl+multi-char key name", "BrowserBack", { ctrlKey: true }],
    ["control character", "\u0007", {}],
  ] as const)("%s -> undefined", (_name, key, mods) => {
    expect(from(key, mods)).toBeUndefined();
  });

  test.each([
    "Shift",
    "Control",
    "Alt",
    "Meta",
    "OS",
    "CapsLock",
    "NumLock",
    "ScrollLock",
    "ContextMenu",
    "Dead",
    "Process",
    "Unidentified",
    "AltGraph",
    "Fn",
    "FnLock",
    "Hyper",
    "Super",
    "Symbol",
    "SymbolLock",
  ])("%s alone -> undefined", (key) => {
    expect(from(key)).toBeUndefined();
    expect(from(key, { shiftKey: true, ctrlKey: true })).toBeUndefined();
  });

  test.each(Array.from({ length: 24 }, (_, i) => `F${i + 1}`))("%s -> undefined", (key) => {
    expect(from(key)).toBeUndefined();
    expect(from(key, { shiftKey: true })).toBeUndefined();
  });

  test("repeat is ignored: every keydown is one key", () => {
    expect(from("j", { repeat: true })).toBe("j");
    expect(from("Backspace", { repeat: true })).toBe("<BS>");
  });
});

describe("agreement with Vim.vimKeyFromEvent", () => {
  const NAMED_DOM_KEYS = [
    "Enter",
    "Backspace",
    "Delete",
    "Escape",
    "Insert",
    "Tab",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Home",
    "End",
    "PageUp",
    "PageDown",
    " ",
  ];
  // Space is printable ASCII too, but it is a named DOM key here so it is listed once.
  const PRINTABLE = Array.from({ length: 0x7f - 0x21 }, (_, i) => String.fromCharCode(0x21 + i));
  const MODS = {
    none: {},
    shift: { shiftKey: true },
    ctrl: { ctrlKey: true },
    "ctrl+shift": { ctrlKey: true, shiftKey: true },
  } as const satisfies Record<string, Mods>;

  // [key, mods] -> [what the core says, what we say]; every other combination must agree exactly.
  const NORMALISED: Record<string, readonly [string, string | undefined]> = {
    "< none": ["<", "<lt>"],
    "< ctrl": ["<C-<>", undefined],
    "< ctrl+shift": ["<C-S-<>", undefined],
    "> ctrl": ["<C->>", undefined],
    "> ctrl+shift": ["<C-S->>", undefined],
    "  shift": ["<S-Space>", "<Space>"],
    "Enter shift": ["<S-CR>", "<CR>"],
    "Backspace shift": ["<S-BS>", "<BS>"],
    "Tab shift": ["<S-Tab>", "<Tab>"],
    "Delete shift": ["<S-Del>", "<Del>"],
    "Escape shift": ["<S-Esc>", "<Esc>"],
    "Insert shift": ["<S-Ins>", "<Ins>"],
  };

  const cases: [string, string, Mods][] = [
    ...PRINTABLE.flatMap((c) =>
      (["none", "ctrl", "ctrl+shift"] as const).map((m): [string, string, Mods] => [
        `${c} ${m}`,
        c,
        MODS[m],
      ]),
    ),
    ...NAMED_DOM_KEYS.flatMap((c) =>
      (["none", "shift", "ctrl"] as const).map((m): [string, string, Mods] => [
        `${c} ${m}`,
        c,
        MODS[m],
      ]),
    ),
  ];

  test("covers every combination once", () => {
    expect(cases.length).toBe(94 * 3 + 15 * 3);
    expect(new Set(cases.map(([id]) => id)).size).toBe(cases.length);
  });

  test.each(cases)("%j", (id, key, mods) => {
    const e = ev(key, mods);
    const core = Vim.vimKeyFromEvent(e as unknown as KeyboardEvent);
    const ours: string | undefined = keyFromEvent(e, "other");
    const normalised = NORMALISED[id];
    if (normalised === undefined) {
      expect(ours).toBe(core);
    } else {
      expect(core).toBe(normalised[0]);
      expect(ours).toBe(normalised[1]);
    }
  });

  test("every normalisation is exercised", () => {
    const ids = new Set(cases.map(([id]) => id));
    expect(Object.keys(NORMALISED).filter((id) => !ids.has(id))).toEqual([]);
  });
});

describe("detectPlatform", () => {
  test.each([
    ["MacIntel", "mac"],
    ["iPhone", "mac"],
    ["iPad", "mac"],
    ["Win32", "other"],
    ["Linux x86_64", "other"],
    ["", "other"],
  ] as const)("%j -> %s", (platform, expected) => {
    expect(detectPlatform({ platform })).toBe(expected);
  });

  test("no navigator -> other", () => {
    expect(detectPlatform(undefined)).toBe("other");
  });
});
