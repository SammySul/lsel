import { describe, expect, test } from "bun:test";
import { hasUppercase, vimRegExp } from "./vimRegex.ts";

// Expected matches follow :help pattern (magic, ignorecase+smartcase unless stated).
const first = (pattern: string, text: string, ic = true, sc = true) =>
  vimRegExp(pattern, "", ic, sc).exec(text)?.[0];

describe("vim regex dialect", () => {
  test.each([
    ["a\\+", "baaa", "aaa"],
    ["\\<foo\\>", "foobar foo", "foo"],
    ["a.\\{-}b", "aXbYb", "aXb"],
    ["x\\{2,}", "xxxx", "xxxx"],
    ["[[:digit:]]\\+", "ab12c", "12"],
    ["[]]", "a]b", "]"],
    ["\\%(ab\\)\\+", "ababc", "abab"],
    ["foo\\zsbar", "foobar", "bar"],
    ["foo\\zebar", "foobar foobaz", "foo"],
    ["\\v(a|b)+", "xabba", "abba"],
    ["a*", "aab", "aa"],
    ["^*", "*a", "*"],
    ["a^b", "a^b", "a^b"],
    ["a$b", "a$b", "a$b"],
    ["\\'", "it's", "'"],
    ["\\,", "a,b", ","],
    ["\\V.*", "a.*b", ".*"],
    ["\\d\\{3}", "ab1234", "123"],
    ["\\(a\\)\\1", "xaa", "aa"],
    ["\\u\\l", "abCde", "Cd"],
  ])("/%s/ on %j", (pattern, text, want) => {
    expect(first(pattern, text)).toBe(want);
  });

  test("\\u and [:upper:] stay case-sensitive under ignorecase", () => {
    expect(first("\\u", "aB1c")).toBe("B");
    expect(first("[[:upper:]]", "aBc")).toBe("B");
  });

  test("smartcase: an upper-case letter matches case; \\S \\W and \\c/\\C do not count", () => {
    expect(first("data", "Data")).toBe("Data");
    expect(first("Data", "data Data")).toBe("Data");
    expect(first("\\Sb", "aB")).toBe("aB");
    expect(first("\\Ca", "A a")).toBe("a");
    expect(first("\\cA", "a")).toBe("a");
    expect(hasUppercase("\\S\\W\\_X")).toBe(false);
    expect(hasUppercase("aB")).toBe(true);
  });

  test("a negated collection and . do not cross a line break; \\_s does", () => {
    expect(first("a[^x]b", "a\nb")).toBeUndefined();
    expect(first("a.b", "a\nb")).toBeUndefined();
    expect(first("a\\_sb", "a\nb")).toBe("a\nb");
  });
});
