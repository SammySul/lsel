import { describe, expect, test } from "bun:test";
import { evalExpr } from "./expr.ts";

const ctx = { submatch: (n: number) => ["a12", "12"][n] ?? "", line: () => 3, col: () => 1 };

// Values follow vimscript's rules (:help expression-syntax): integer division, string-to-number, . concatenates.
describe("\\= expressions", () => {
  test.each([
    ["submatch(0)", "a12"],
    ["submatch(1)+1", "13"],
    ["submatch(1)*2", "24"],
    ["line('.').'. '", "3. "],
    ["7/2", "3"],
    ["-7/2", "-3"],
    ["7%3", "1"],
    ["'a'.'b'", "ab"],
    ['"x\\ty"', "x\ty"],
    ["'it''s'", "it's"],
    ["printf('%03d', 7)", "007"],
    ["toupper('ab')", "AB"],
    ["repeat('-', 3)", "---"],
    ["'10'+1", "11"],
    ["'0x10'+0", "16"],
    ["1 ? 'y' : 'n'", "y"],
    ["2 > 1", "1"],
  ])("%s", (text, want) => {
    expect(evalExpr(text, ctx)).toBe(want);
  });

  test("an unknown function is an error", () => {
    expect(() => evalExpr("nope(1)", ctx)).toThrow("E117");
  });
});
