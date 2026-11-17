import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  formatKeys,
  isVimKey,
  KeyNotationError,
  keyToDomKey,
  NAMED_KEYS,
  parseKeys,
  RESET,
  toCoreKey,
  type VimKey,
} from "./index.ts";

const SPIKE_CASES = [
  ":%s/foo/X/g<CR>",
  "qaA,<Esc>jq2@a",
  "qqcwb<Esc>jq@q@@",
  "fxdiwiZ<Esc>",
  "ddp.u",
  "ihello <Esc>u",
  "ihello <Esc>..u",
  ":sort<CR>",
  ":g/x/d<CR>",
  "<C-v>jIZ<Esc>",
  "qqf=i<Space><Esc>jq@q",
  "jjkk$jx",
  "jqqddjq3@q",
  "3ox<Esc>",
  "wcwB<Esc>w.",
  "ciwbye<Esc>",
  "/foo<CR>x",
  "qwA!<Esc>jq:2,3norm @w<CR>",
  "qaqqaA,<Esc>j@aq@a",
];

const PUZZLE_DIR = join(import.meta.dir, "../../../puzzles/handmade");
const PUZZLE_SOLUTIONS: [string, string][] = await Promise.all(
  [...new Bun.Glob("*.json").scanSync({ cwd: PUZZLE_DIR })].sort().map(async (f) => {
    const json: { solution: string } = await Bun.file(join(PUZZLE_DIR, f)).json();
    return [f, json.solution] as [string, string];
  }),
);

const k = (s: string) => s as VimKey;

describe("parseKeys", () => {
  test("splits characters and named keys", () => {
    expect(parseKeys("ihello<Esc>")).toEqual<string[]>(["i", "h", "e", "l", "l", "o", "<Esc>"]);
  });

  test("<lt> stays a key and a space becomes <Space>", () => {
    expect(parseKeys("a<lt>b c")).toEqual<string[]>(["a", "<lt>", "b", "<Space>", "c"]);
  });

  test("normalises the case of names and modifiers, keeps the character verbatim", () => {
    expect(parseKeys("<cr><esc><c-v><space><LT><c-s-a><s-left><pageup>")).toEqual<string[]>([
      "<CR>",
      "<Esc>",
      "<C-v>",
      "<Space>",
      "<lt>",
      "<C-S-a>",
      "<S-Left>",
      "<PageUp>",
    ]);
  });

  test("a bare > is a key (>> and V> are vim commands)", () => {
    expect(parseKeys("V>>")).toEqual<string[]>(["V", ">", ">"]);
  });

  test("astral characters are one key", () => {
    expect(parseKeys("i😀<Esc>")).toEqual<string[]>(["i", "😀", "<Esc>"]);
  });

  test("empty notation is an empty log", () => {
    expect(parseKeys("")).toEqual<string[]>([]);
  });

  test.each([
    ["a<b"],
    ["<Foo>"],
    ["<Reset>"],
    ["<M-x>"],
    ["<S-a>"],
    ["<C-lt>"],
    ["<a>"],
    ["<>"],
    ["<Esc"],
    ["<C->"],
    ["a\tb"],
    ["a\nb"],
  ])("rejects %j", (notation) => {
    expect(() => parseKeys(notation)).toThrow(KeyNotationError);
  });

  test("the error carries the offset of the bad token", () => {
    try {
      parseKeys("ab<Foo>");
      throw new Error("did not throw");
    } catch (e) {
      expect(e).toBeInstanceOf(KeyNotationError);
      expect((e as KeyNotationError).index).toBe(2);
    }
  });

  test("a bare < asks for <lt>", () => {
    expect(() => parseKeys("a<b")).toThrow("write <lt>");
  });

  test("every parsed key satisfies isVimKey", () => {
    const keys = parseKeys("<c-s-left><a-x>x> <lt><bs>ü");
    expect(keys).toEqual<string[]>([
      "<C-S-Left>",
      "<A-x>",
      "x",
      ">",
      "<Space>",
      "<lt>",
      "<BS>",
      "ü",
    ]);
    expect(keys.every((key) => isVimKey(key))).toBe(true);
  });
});

describe("formatKeys", () => {
  test.each(SPIKE_CASES)("round-trips spike case %j", (notation) => {
    expect(formatKeys(parseKeys(notation))).toBe(notation.replaceAll(" ", "<Space>"));
  });

  // the exact set is pinned by PAR in puzzles.test.ts; this only proves the glob finds them
  test("finds the handmade puzzles", () => {
    expect(PUZZLE_SOLUTIONS.length).toBeGreaterThan(0);
  });

  test.each(PUZZLE_SOLUTIONS)("round-trips the solution of %s", (_id, notation) => {
    expect(formatKeys(parseKeys(notation))).toBe(notation.replaceAll(" ", "<Space>"));
  });

  test("concatenates reset markers verbatim", () => {
    expect(formatKeys([k("x"), RESET, k("<CR>")])).toBe("x<Reset><CR>");
  });
});

describe("isVimKey", () => {
  test.each([
    "a",
    "A",
    ">",
    "😀",
    "<lt>",
    "<Esc>",
    "<C-v>",
    "<C-S-A>",
    "<A-x>",
    "<C-A-S-Left>",
    "<S-Left>",
    "<S-Space>",
  ])("accepts %j", (s) => {
    expect(isVimKey(s)).toBe(true);
  });

  test.each([
    "",
    "<",
    "ab",
    " ",
    "\n",
    "<a>",
    "<cr>",
    "<c-v>",
    "<S-a>",
    "<M-x>",
    "<C-lt>",
    "<Foo>",
    RESET,
    "<C-<>",
    "<C->>",
    "<A-S-C-x>",
  ])("rejects %j", (s) => {
    expect(isVimKey(s)).toBe(false);
  });

  test("covers every named key", () => {
    expect([...NAMED_KEYS].every((name) => isVimKey(`<${name}>`))).toBe(true);
    expect(NAMED_KEYS.size).toBe(16);
  });
});

describe("toCoreKey", () => {
  test("maps <lt> to < and leaves everything else alone", () => {
    expect(toCoreKey(k("<lt>"))).toBe("<");
    expect(toCoreKey(k("<CR>"))).toBe("<CR>");
    expect(toCoreKey(k("<C-v>"))).toBe("<C-v>");
    expect(toCoreKey(k(">"))).toBe(">");
  });
});

describe("keyToDomKey", () => {
  test("<CR> is Enter/13", () => {
    expect(keyToDomKey(k("<CR>"))).toEqual({
      key: "Enter",
      keyCode: 13,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      shiftKey: false,
    });
  });

  test("<C-S-Left> is ArrowLeft/37 with ctrl and shift", () => {
    expect(keyToDomKey(k("<C-S-Left>"))).toEqual({
      key: "ArrowLeft",
      keyCode: 37,
      ctrlKey: true,
      altKey: false,
      metaKey: false,
      shiftKey: true,
    });
  });

  test.each([
    ["<Esc>", "Escape", 27],
    ["<BS>", "Backspace", 8],
    ["<Del>", "Delete", 46],
    ["<Tab>", "Tab", 9],
    ["<Space>", " ", 32],
    ["<Ins>", "Insert", 45],
    ["<Left>", "ArrowLeft", 37],
    ["<Up>", "ArrowUp", 38],
    ["<Right>", "ArrowRight", 39],
    ["<Down>", "ArrowDown", 40],
    ["<Home>", "Home", 36],
    ["<End>", "End", 35],
    ["<PageUp>", "PageUp", 33],
    ["<PageDown>", "PageDown", 34],
    ["<lt>", "<", 0],
    ["x", "x", 0],
    [">", ">", 0],
  ])("%s is %j/%d", (vimKey, key, keyCode) => {
    expect(keyToDomKey(k(vimKey))).toEqual({
      key,
      keyCode,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      shiftKey: false,
    });
  });

  test("<A-x> sets altKey on the plain character", () => {
    expect(keyToDomKey(k("<A-x>"))).toEqual({
      key: "x",
      keyCode: 0,
      ctrlKey: false,
      altKey: true,
      metaKey: false,
      shiftKey: false,
    });
  });
});
