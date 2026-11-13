import { describe, expect, test } from "bun:test";
import {
  type LanguageId,
  type Puzzle,
  parseKeys,
  RESET,
  type ReplayOptions,
  replay,
  verifyRun,
} from "./index.ts";

const UNREACHABLE = "\u0000unreachable";

function puzzle(start: string, target = UNREACHABLE, over: Partial<Puzzle> = {}): Puzzle {
  return {
    id: "test",
    title: "test",
    language: "text",
    tabSize: 4,
    indentUnit: "  ",
    start,
    target,
    solution: [],
    par: 0,
    source: { kind: "original", author: "test" },
    ...over,
  };
}

function run(start: string, notation: string, target?: string, opts?: ReplayOptions) {
  return replay(puzzle(start, target), parseKeys(notation), opts);
}

function runIn(language: LanguageId, indentUnit: string, start: string, notation: string) {
  return replay(puzzle(start, UNREACHABLE, { language, indentUnit }), parseKeys(notation));
}

describe("spike cases", () => {
  const cases: [string, string, string][] = [
    ["foo bar\nfoo baz\nqux foo", ":%s/foo/X/g<CR>", "X bar\nX baz\nqux X"],
    ["a\nb\nc", "qaA,<Esc>jq2@a", "a,\nb,\nc,"],
    ["a1\na2\na3", "qqcwb<Esc>jq@q@@", "b\nb\nb"],
    ["f(x, y)", "fxdiwiZ<Esc>", "f(Z, y)"],
    ["one\ntwo\nthree", "ddp.u", "two\none\nthree"],
    ["one", "ihello <Esc>u", "one"],
    ["one", "ihello <Esc>..u", "hellohello  one"],
    ["c\na\nb", ":sort<CR>", "a\nb\nc"],
    ["x1\ny\nx2", ":g/x/d<CR>", "y"],
    ["ab\ncd", "<C-v>jIZ<Esc>", "Zab\nZcd"],
    ["let a = 1\nlet bb = 2", "qqf=i<Space><Esc>jq@q", "let a  = 1\nlet bb  = 2"],
    ["  a\n    bb\nc", "jjkk$jx", "  a\n    b\nc"],
    ["x", "3ox<Esc>", "x\nx\nx\nx"],
    ["a b c", "wcwB<Esc>w.", "a B B"],
    ["hello", "ciwbye<Esc>", "bye"],
    ["a foo b\nfoo", "/foo<CR>x", "a oo b\nfoo"],
    ["x\nx\nx", "qwA!<Esc>jq:2,3norm @w<CR>", "x!\nx!\nx!"],
  ];
  for (const [start, keys, want] of cases) {
    test(keys, () => {
      const r = run(start, keys);
      expect(r.doc).toBe(want);
      expect(r.errors).toEqual([]);
    });
  }

  // vim ends a macro run at the first failing command (macro.ts).
  test("jqqddjq3@q stops at the failing j", () => {
    expect(run("1\n2\n3\n4\n5", "jqqddjq3@q").doc).toBe("1\n3\n5");
  });
  test("a recursive macro terminates at the failing j", () => {
    const r = run("a\nb\nc", "qaqqaA,<Esc>j@aq@a");
    expect(r.errors).toEqual([]);
    expect(r.doc).toBe("a,\nb,\nc,");
  });
});

describe("insert mode", () => {
  test("<BS> is recorded for .", () => {
    const r = run("\n", "ihelo<BS>lo<Esc>j.", "hello\nhello");
    expect(r.doc).toBe("hello\nhello");
    expect(r.solvedAt).toBe(10);
  });

  test("<BS> is recorded for macros", () => {
    const r = run("\n", "qqihelo<BS>lo<Esc>jq@q", "hello\nhello");
    expect(r.doc).toBe("hello\nhello");
    expect(r.solvedAt).toBe(14);
  });

  test("<Del> deletes forward", () => {
    const r = run("xy", "iab<Del>c<Esc>", "abcy");
    expect(r.doc).toBe("abcy");
    expect(r.solvedAt).toBe(4);
  });

  test("replace mode overwrites and <BS> moves left", () => {
    const r = run("abcd", "Rxy<BS>z<Esc>", "xzcd");
    expect(r.doc).toBe("xzcd");
    expect(r.solvedAt).toBe(4);
  });

  // vim :help Replace: "If a <NL> is typed, a line break is inserted and no character is deleted."
  test("replace mode <CR> breaks the line without deleting, then keeps replacing", () => {
    const r = run("ab", "R<CR>", "\nab");
    expect(r.doc).toBe("\nab");
    expect(r.solvedAt).toBe(1);
    expect(run("ab", "R<CR>x<Esc>").doc).toBe("\nxb");
  });

  test(". and @q repeat the whole replacement", () => {
    expect(run("abcd\nabcd", "Rxy<Esc>j0.").doc).toBe("xycd\nxycd");
    expect(run("abcd\nabcd", "qqRxy<Esc>jq0@q").doc).toBe("xycd\nxycd");
    expect(run("abcd\nabcd", "Rxy<Esc>j02.").doc).toBe("xycd\nxyxy");
    expect(run("abcd\nabcd", "Rxyz<Esc>u").doc).toBe("abcd\nabcd");
  });

  test("literal table: <Space>, <lt>, <Tab> ('expandtab': spaces to the next tabstop)", () => {
    const r = run("", "ia<Space>b<lt><Tab>c<Esc>", "a b<    c");
    expect(r.doc).toBe("a b<    c");
    expect(r.solvedAt).toBe(6);
  });

  for (const noop of ["<C-v>", "<PageUp>", "<S-Left>"]) {
    test(`${noop} in insert mode is a counted no-op`, () => {
      const r = run("", `i${noop}x<Esc>`, "x", { stopAtSolve: false });
      expect(r.doc).toBe("x");
      expect(r.solvedAt).toBe(2);
      expect(r.applied).toBe(4);
    });
  }

  test("<C-r>a inserts a register", () => {
    const r = run("foo", '"ayiwo<C-r>a<Esc>', "foo\nfoo");
    expect(r.doc).toBe("foo\nfoo");
    expect(r.solvedAt).toBe(7);
  });

  test("<C-w> deletes the word before the cursor", () => {
    const r = run("", "ihello<C-w>x<Esc>", "x");
    expect(r.doc).toBe("x");
    expect(r.solvedAt).toBe(7);
  });

  test("<Ins> toggles replace", () => {
    const r = run("abc", "i<Ins>xy<Esc>", "xyc");
    expect(r.doc).toBe("xyc");
    expect(r.solvedAt).toBe(3);
  });

  test("visual block I and A reach the other lines only at <Esc>, as in vim", () => {
    const i = run("ab\ncd", "<C-v>jIZ<Esc>", "Zab\nZcd");
    expect(i.doc).toBe("Zab\nZcd");
    expect(i.solvedAt).toBe(4);
    const a = run("ab\ncd", "<C-v>jAZ<Esc>", "aZb\ncZd");
    expect(a.doc).toBe("aZb\ncZd");
    expect(a.solvedAt).toBe(4);
    const typing = run("ab\ncd", "<C-v>jIZ", "Zab\nZcd");
    expect(typing.doc).toBe("Zab\ncd");
    expect(typing.solved).toBe(false);
  });

  test("a run ending in insert mode with a matching buffer locks in", () => {
    const r = run("", "ihi", "hi");
    expect(r.solved).toBe(true);
    expect(r.solvedAt).toBe(2);
    expect(r.hud.mode).toBe("insert");
  });
});

describe("motions", () => {
  test("dd on the last line", () => {
    const r = run("a\nb", "jdd", "a");
    expect(r.doc).toBe("a");
    expect(r.solvedAt).toBe(2);
  });

  test("5j on 3 lines lands on the last", () => {
    const r = run("a\nb\nc", "5jx", "a\nb\n");
    expect(r.doc).toBe("a\nb\n");
    expect(r.solvedAt).toBe(2);
  });

  test("gjgjx equals jjx", () => {
    expect(run("a\nb\nc", "gjgjx").doc).toBe("a\nb\n");
    expect(run("a\nb\nc", "jjx").doc).toBe("a\nb\n");
  });

  // Line i of the 25-line doc is `L<i>`; x removes the `L` on the line the motion reached.
  const lines = Array.from({ length: 25 }, (_, i) => `L${i}`);
  const window: [string, number][] = [
    ["Hx", 0],
    ["Mx", 12],
    ["Lx", 24],
    ["3Hx", 2],
    ["<C-d>x", 15],
    ["<C-u>x", 0],
    ["<C-f>x", 24],
    ["<C-b>x", 0],
    ["<C-e>x", 0],
    ["<C-y>x", 0],
    ["zzx", 0],
  ];
  for (const [keys, line] of window) {
    test(`${keys} on a 25-line doc deletes on line ${line}`, () => {
      const want = lines.map((l, i) => (i === line ? l.slice(1) : l)).join("\n");
      expect(run(lines.join("\n"), keys).doc).toBe(want);
    });
  }
});

describe("language is engine config", () => {
  test("o after { inserts an unindented line", () => {
    const r = runIn("javascript", "  ", "function f() {\n}", "oreturn<Esc>");
    expect(r.doc).toBe("function f() {\nreturn\n}");
  });

  test("A<CR> after { inserts an unindented line", () => {
    const r = runIn("javascript", "  ", "function f() {\n}", "A<CR>x<Esc>");
    expect(r.doc).toBe("function f() {\nx\n}");
  });

  test("V> uses the puzzle's indentUnit", () => {
    expect(runIn("go", "\t", "x := 1", "V>").doc).toBe("\tx := 1");
    expect(runIn("python", "    ", "x = 1", "V>").doc).toBe("    x = 1");
  });

  test("== re-indents a javascript body", () => {
    const r = runIn("javascript", "  ", "function f() {\nreturn 1;\n}", "j==");
    expect(r.doc).toBe("function f() {\n  return 1;\n}");
  });
});

// Expected docs below are real vim's (vim -u NONE, backspace=indent,eol,start) for the same keys.
describe("macros replay the keys that were typed", () => {
  test("an ex command inside a macro is replayed and leaves no prompt open", () => {
    const r = run("a\na\na", "qq:s/a/b/<CR>jq@qx");
    expect(r.doc).toBe("b\nb\n");
    expect(r.hud.prompt).toBeNull();
    expect(run("a\na", "qq:norm Ax<CR>jq@q").doc).toBe("ax\nax");
    expect(run("x1\nx2\ny", "qqA;<Esc>q:g/x/norm @q<CR>").doc).toBe("x1;;\nx2;\ny");
  });

  test("insert-mode cursor keys and <C-o> are replayed", () => {
    expect(run("\n", "qqiab<Left>c<Esc>jq@q").doc).toBe("acb\nacb");
    expect(run("abc\nabc", "qqA<C-o>0X<Esc>jq@q").doc).toBe("Xabc\nXabc");
    expect(run("ab\nab", "qqiX<C-o>lY<Esc>j0q@q").doc).toBe("XaYb\nXaYb");
  });

  test("a counted insert, a search and . inside a macro", () => {
    expect(run("a\nb", "qq3ix<Esc>jq@q").doc).toBe("xxxa\nxxxb");
    expect(run("a.b.c", "qq/\\.<CR>r-q@q").doc).toBe("a-b-c");
    expect(run("one\none", "qqA!<Esc>q:2<CR>.").doc).toBe("one!\none!");
  });

  test("qQ appends to q, and q with a count still stops recording", () => {
    expect(run("x", "qqAa<Esc>qqQAb<Esc>q@q").doc).toBe("xabab");
    expect(run("x", "qqAa<Esc>3qx@q").doc).toBe("xa");
  });

  test("a recursive macro stops at the same key on every run", () => {
    // vim: the j on the last line fails and ends every level of the recursion.
    for (let i = 0; i < 2; i++) {
      const r = run("a\nb\nc", "qaqqaA,<Esc>j@aq@aggx");
      expect(r.doc).toBe(",\nb,\nc,");
      expect(r.errors).toEqual([]);
    }
  });
});

describe(":normal", () => {
  test("types <...> literally", () => {
    expect(run("a\nb", ":%norm A<lt>CR><CR>").doc).toBe("a<CR>\nb<CR>");
    expect(run("a", ":norm Ax<lt>Esc>y<CR>").doc).toBe("ax<Esc>y");
  });

  test("aborts an unfinished command", () => {
    expect(run("ab", ":norm d<CR>x").doc).toBe("b");
    expect(run("ab", ":norm Ax<CR>x").doc).toBe("ab");
    expect(run("ab", ":norm :s/a/b/<CR>x").doc).toBe("b");
  });

  test("a count and . work inside it", () => {
    expect(run("a\nb", ":%norm 2Ax<CR>").doc).toBe("axx\nbxx");
    expect(run("ab\nab", "xj:norm .<CR>").doc).toBe("b\nb");
  });
});

describe("motions that fail at the edge of the buffer", () => {
  const cases: [string, string, string][] = [
    ["abc", "jx", "bc"],
    ["abc", "$kx", "ab"],
    ["a\nb", "jdj", "a\nb"],
    ["a\nb", "dk", "a\nb"],
    ["abc\nd", "jd+", "abc\nd"],
    ["abc\nd", "$<C-p>x", "ab\nd"],
    ["a\nb\nc", "3jx", "a\nb\n"],
    ["abc", "5rx", "abc"],
    ["ab", "l3rx", "ab"],
    ["abc", "3rx", "xxx"],
    ["abc", "2rx.", "xxx"],
  ];
  for (const [start, keys, want] of cases) {
    test(`${keys} on ${JSON.stringify(start)}`, () => expect(run(start, keys).doc).toBe(want));
  }
});

describe("replace mode", () => {
  test("cursor keys move", () => {
    expect(run("xyz", "Rab<Left>c<Esc>").doc).toBe("acz");
    expect(run("xyzw", "Ra<Right>c<Esc>").doc).toBe("aycw");
  });
});

describe("g0 and g^ without wrapping", () => {
  test("g0 is 0 and g^ is ^", () => {
    expect(run("    abc", "$g0x").doc).toBe("   abc");
    expect(run("    abc", "$dg0").doc).toBe("c");
    expect(run("    abc", "wg^x").doc).toBe("    bc");
  });
});

describe("noautoindent", () => {
  test("cc, S and linewise c drop the indent", () => {
    expect(run("  a", "ccb<Esc>").doc).toBe("b");
    expect(run("  a\nb", "jkSx<Esc>").doc).toBe("x\nb");
    expect(run("  a\n  b", "3ccx<Esc>").doc).toBe("x");
    expect(run("  a\nb", "ccx<Esc>j.").doc).toBe("x\nx");
    expect(run("    ", "ccx<Esc>").doc).toBe("x");
  });

  test("the register still holds the whole line", () => {
    expect(run("  a\n  b", "yyjcc<Esc>p").doc).toBe("  a\n\n  b");
  });
});

describe("insert-mode <C-w> and <C-u> stop once at the insert start", () => {
  const cases: [string, string, string][] = [
    ["abc", "Adef<C-u>X<Esc>", "abcX"],
    ["abc", "Adef<C-u><C-u>X<Esc>", "X"],
    ["ab cd", "Aef<C-w>Y<Esc>", "ab cdY"],
    ["ab cd", "A ef<C-w><C-w>Y<Esc>", "ab cdY"],
    ["ab cd", "Aef<C-w><C-w><C-w>Y<Esc>", "Y"],
    ["ab..cd", "A<C-w><C-w>Y<Esc>", "abY"],
    ["ab", "A<CR>cd<C-w><C-w>Y<Esc>", "abY"],
    ["ab\ncd", "jI<C-u>Y<Esc>", "abYcd"],
    ["abc", "Ade<Left><Left>X<C-u>Y<Esc>", "abcYde"],
    ["abc", "Ade<Left><Right>f<C-u>Y<Esc>", "abcY"],
    ["abc", "i<Right>f<C-u>Y<Esc>", "aYbc"],
    ["abc\nxyz", "Ade<Down>f<C-u>Y<Esc>", "abcde\nxyzY"],
    ["", "ihello<C-w>x<Esc>", "x"],
  ];
  for (const [start, keys, want] of cases) {
    test(`${keys} on ${JSON.stringify(start)}`, () => expect(run(start, keys).doc).toBe(want));
  }
});

describe("lock-in and replay options", () => {
  test("lock-in is decided after the key, not on intermediate dispatches", () => {
    const r = run("x1\ny\nx2", ":g/x/d<CR>", "y\nx2");
    expect(r.doc).toBe("y");
    expect(r.solvedAt).toBeNull();
    expect(r.solved).toBe(false);
  });

  test("stopAtSolve stops after the solving key", () => {
    const r = run("abc", "xxx", "bc");
    expect(r.solvedAt).toBe(0);
    expect(r.applied).toBe(1);
    expect(r.doc).toBe("bc");
  });

  test("stopAtSolve: false feeds every key, and the locked buffer stays put", () => {
    const r = run("abc", "xxx", "bc", { stopAtSolve: false });
    expect(r.solvedAt).toBe(0);
    expect(r.applied).toBe(3);
    expect(r.doc).toBe("bc");
  });

  test("verifyRun scores the run after the last reset and needs the last key to solve", () => {
    const p = puzzle("abc", "bc");
    const ok = verifyRun(p, [...parseKeys("dd"), RESET, ...parseKeys("x")]);
    expect(ok.ok).toBe(true);
    expect(ok.score).toBe(1);
    expect(ok.result.doc).toBe("bc");
    const trailing = verifyRun(p, parseKeys("xx"));
    expect(trailing.ok).toBe(false);
    expect(trailing.score).toBe(2);
  });

  test("verifyRun mounts its replay in the given parent and leaves it empty", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const seen = new MutationObserver(() => {});
    seen.observe(host, { childList: true });
    try {
      expect(verifyRun(puzzle("abc", "bc"), parseKeys("x"), { parent: host }).ok).toBe(true);
      const records = seen.takeRecords();
      const added = records.flatMap((r) => [...r.addedNodes]) as Element[];
      expect(added.map((n) => n.classList.contains("cm-editor"))).toEqual([true]);
      expect(host.childElementCount).toBe(0);
    } finally {
      seen.disconnect();
      host.remove();
    }
  });
});

describe("registers", () => {
  test('"+yyjp pastes the yanked line', () => {
    const r = run("a\nb", '"+yyjp', "a\nb\na");
    expect(r.doc).toBe("a\nb\na");
    expect(r.solvedAt).toBe(5);
  });

  test("<C-r>+ in insert inserts nothing", () => {
    const r = run("a", '"+yyi<C-r>+Z<Esc>', "Za");
    expect(r.doc).toBe("Za");
    expect(r.solvedAt).toBe(7);
  });
});

describe("process-global vim state", () => {
  test("a crashing replay does not poison the next one", () => {
    // No motion fails here, so only the depth limit stops it (vim itself never finishes).
    const crash = run("a\nb\nc", "qaqqaA,<Esc>@aq@a");
    expect(crash.errors).toEqual([{ index: 12, message: "macro nested deeper than 100" }]);
    const next = run("foo bar\nfoo baz\nqux foo", ":%s/foo/X/g<CR>");
    expect(next.doc).toBe("X bar\nX baz\nqux X");
    expect(next.errors).toEqual([]);
  });

  test("runaway recursion inside :normal stops at the depth limit and later prompts work", () => {
    const crash = run("x@q\nabc", '"qy$j:norm @q<CR>');
    expect(crash.errors).toEqual([{ index: 13, message: "macro nested deeper than 100" }]);
    expect(crash.doc).toBe("x@q\n");
    expect(run("abc", ":s/a/Z/<CR>").doc).toBe("Zbc");
    expect(run("abc", "/b<CR>x").doc).toBe("ac");
  });

  test("registers do not leak between replays", () => {
    expect(run("a", "qaAx<Esc>q").doc).toBe("ax");
    const second = run("a", "@a");
    expect(second.doc).toBe("a");
    expect(second.solvedAt).toBeNull();
  });
});
