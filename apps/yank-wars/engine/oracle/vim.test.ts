import { describe, expect, test } from "bun:test";
import { parseKeys } from "../src/index.ts";
import type { OracleMode } from "./types.ts";
import { driveScript, modeOf, vimString } from "./vim.ts";

describe("vimString: our notation inside a vim double-quoted string", () => {
  const cases: [string, string][] = [
    ["dw", "dw"],
    [String.raw`:s/\'/\"/g<CR>`, String.raw`:s/\\'/\\\"/g\<CR>`],
    ["i<lt>a<Space>b<Esc>", String.raw`i<a b\<Esc>`],
    ["<C-v>jI#<Esc>", String.raw`\<C-v>jI#\<Esc>`],
    ["i<Ins>x<S-Left><BS><Del><Tab>", String.raw`i\<Insert>x\<S-Left>\<BS>\<Del>\<Tab>`],
    ['"ayy', String.raw`\"ayy`],
    ["<C-r>a<A-x>", String.raw`\<C-r>a\<A-x>`],
  ];
  for (const [notation, want] of cases) {
    test(notation, () => expect(vimString(parseKeys(notation))).toBe(want));
  }
});

describe("modeOf: vim's strtrans(mode(1))", () => {
  const cases: [string, OracleMode][] = [
    ["n", "normal"],
    ["i", "insert"],
    ["R", "replace"],
    ["v", "visual"],
    ["V", "visual line"],
    ["^V", "visual block"],
    ["niI", "insert-normal"],
    ["niR", "insert-normal"],
    ["no", "operator-pending"],
    ["nov", "operator-pending"],
    ["c", "prompt"],
  ];
  for (const [vim, want] of cases) test(vim, () => expect(modeOf(vim)).toBe(want));
  test("an unknown mode is an error, not a guess", () => {
    expect(() => modeOf("Rv")).toThrow("unexpected vim mode");
  });
});

describe("driveScript options", () => {
  const first = (settings: Parameters<typeof driveScript>[0]["settings"]) =>
    driveScript({ id: "x", start: "", keys: "x", ...(settings ? { settings } : {}) }, "/o").split(
      "\n",
    )[0];
  test("defaults: tabSize 2, indentUnit two spaces", () => {
    expect(first(undefined)).toContain("tabstop=2 shiftwidth=2 expandtab softtabstop=0");
  });
  test("tab indent: shiftwidth follows tabstop, no expandtab", () => {
    expect(first({ tabSize: 8, indentUnit: "\t" })).toContain("tabstop=8 shiftwidth=0 noexpandtab");
  });
  test("four spaces on tabSize 4", () => {
    expect(first({ tabSize: 4, indentUnit: "    " })).toContain("tabstop=4 shiftwidth=4 expandtab");
  });
  test("the window is the engine's 30 lines", () => {
    expect(first(undefined)).toContain("lines=31 ");
  });
});
