import { describe, expect, test } from "bun:test";
import { testPuzzle as puzzle } from "../oracle/engine.ts";
import { parseKeys, RESET, replay, verifyRun } from "./index.ts";
import type { LanguageId } from "./puzzle.ts";
import type { ReplayOptions } from "./replay.ts";

function run(start: string, notation: string, target?: string, opts?: ReplayOptions) {
  return replay(puzzle(start, target === undefined ? {} : { target }), parseKeys(notation), opts);
}

function runIn(language: LanguageId, indentUnit: string, start: string, notation: string) {
  return replay(puzzle(start, { language, indentUnit }), parseKeys(notation));
}

describe("insert mode", () => {
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

  test("a visual block insert locks in only at <Esc>, when it reaches the other lines", () => {
    const i = run("ab\ncd", "<C-v>jIZ<Esc>", "Zab\nZcd");
    expect(i.solvedAt).toBe(4);
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
    const p = puzzle("abc", { target: "bc" });
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
      expect(verifyRun(puzzle("abc", { target: "bc" }), parseKeys("x"), { parent: host }).ok).toBe(
        true,
      );
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
