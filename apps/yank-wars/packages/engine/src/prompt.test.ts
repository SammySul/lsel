import { afterEach, describe, expect, test } from "bun:test";
import {
  createSession,
  destroySession,
  type EditorSession,
  feedKey,
  type HudState,
  type Puzzle,
  parseKeys,
  replay,
  sessionSnapshot,
} from "./index.ts";

function puzzle(start: string): Puzzle {
  return {
    id: "test",
    title: "test",
    language: "text",
    tabSize: 4,
    indentUnit: "  ",
    start,
    target: "\u0000unreachable",
    solution: [],
    par: 0,
    source: { kind: "original", author: "test" },
  };
}

const run = (start: string, notation: string) => replay(puzzle(start), parseKeys(notation));

let live: EditorSession | null = null;
afterEach(() => {
  if (live) destroySession(live);
  live = null;
});

// A live session for asserting state between keys, the way the web reads it.
function session(start: string) {
  const s = createSession(puzzle(start), { parent: document.body });
  live = s;
  return {
    feed(notation: string): HudState {
      for (const k of parseKeys(notation)) feedKey(s, k);
      return sessionSnapshot(s);
    },
    doc: () => s.view.state.doc.toString(),
  };
}

describe("ex and search prompts", () => {
  test(":s/a/b/<CR>", () => {
    expect(run("a", ":s/a/b/<CR>").doc).toBe("b");
  });

  test("<Esc> closes the prompt without running it", () => {
    const s = session("ab");
    expect(s.feed(":s/a/b/").prompt).toEqual({ prefix: ":", value: "s/a/b/" });
    expect(s.feed("<Esc>").prompt).toBeNull();
    expect(s.doc()).toBe("ab");
    s.feed("x");
    expect(s.doc()).toBe("b");
  });

  test("d:<Esc> clears the pending operator", () => {
    expect(run("ab", "d:<Esc>x").doc).toBe("b");
  });

  test("<BS> on an empty search cancels it", () => {
    const s = session("ab");
    expect(s.feed("/zz<BS><BS>").prompt).toEqual({ prefix: "/", value: "" });
    expect(s.feed("<BS>").prompt).toBeNull();
    s.feed("x");
    expect(s.doc()).toBe("b");
  });

  test("<Up> recalls search history", () => {
    const s = session("x foo foo");
    expect(s.feed("/foo<CR>/<Up>").prompt).toEqual({ prefix: "/", value: "foo" });
    // A bare /<CR> would repeat the last search (bar) instead.
    expect(run("foo bar foo bar", "/foo<CR>/bar<CR>/<Up><Up><CR>x").doc).toBe("oo bar foo bar");
  });

  test("<C-u> clears the command line", () => {
    expect(run("a", ":foo<C-u>s/a/b/<CR>").doc).toBe("b");
  });

  test("<Tab>, <Left>, <Home> are no-ops that keep the prompt open", () => {
    const s = session("a");
    expect(s.feed(":ab<Tab><Left><Home>").prompt).toEqual({ prefix: ":", value: "ab" });
  });

  test("a bad regex reports a message and the run continues", () => {
    const s = session("a[b");
    const hud = s.feed(":s/[/x<CR>");
    expect(hud.message).toBe("Invalid regex: [");
    expect(hud.error).toBeNull();
    expect(s.doc()).toBe("a[b");
    s.feed("x");
    expect(s.doc()).toBe("[b");
  });
});

describe(":s///c confirm prompt", () => {
  test("y replaces, n skips, the prompt stays open until q", () => {
    const s = session("a a a");
    const open = s.feed(":%s/a/b/gc<CR>yn");
    expect(s.doc()).toBe("b a a");
    expect(open.prompt).not.toBeNull();
    expect(s.feed("q").prompt).toBeNull();
    expect(s.doc()).toBe("b a a");
  });

  test("a replaces all", () => {
    const s = session("a a a");
    expect(s.feed(":%s/a/b/gc<CR>a").prompt).toBeNull();
    expect(s.doc()).toBe("b b b");
  });

  test("the confirm run is one undo step", () => {
    expect(run("a a a", ":%s/a/b/gc<CR>yyq").doc).toBe("b b a");
    expect(run("a a a", ":%s/a/b/gc<CR>yyqu").doc).toBe("a a a");
  });
});

describe("macros", () => {
  test("keys typed while recording still edit (the banner is not a prompt)", () => {
    const s = session("ab");
    const hud = s.feed("qax");
    expect(hud.recording).toBe("a");
    expect(hud.prompt).toBeNull();
    expect(s.doc()).toBe("b");
    expect(s.feed("q").recording).toBeNull();
  });

  test(":2,3norm @w replays the macro on each line", () => {
    expect(run("x\nx\nx", "qwA!<Esc>jq:2,3norm @w<CR>").doc).toBe("x!\nx!\nx!");
  });
});

describe("engine options survive the per-session reset", () => {
  test("vim regex groups in :s", () => {
    expect(run("foo bar", ":%s/\\(foo\\) \\(bar\\)/\\2 \\1/<CR>").doc).toBe("bar foo");
  });

  test("vim word boundaries in /", () => {
    expect(run("foobar foo", "/\\<lt>foo\\><CR>x").doc).toBe("foobar oo");
  });

  test(":s is ignorecase+smartcase like /, which vim is not by default", () => {
    expect(run("Data data", ":s/data/x/g<CR>").doc).toBe("x x");
    expect(run("Data data", ":s/Data/x/g<CR>").doc).toBe("x data");
  });

  test("& in a replacement is literal under nopcre; \\0 is the whole match", () => {
    expect(run("ab", ":s/a/[&]/<CR>").doc).toBe("[&]b");
    expect(run("ab", ":s/a/[\\0]/<CR>").doc).toBe("[a]b");
  });

  test(":set pcre is blocked", () => {
    expect(run("a", ":set pcre<CR>:s/\\(a\\)/[\\1]/<CR>").doc).toBe("[a]");
  });
});

describe("notifications", () => {
  test("<CR> after a long message is swallowed", () => {
    const s = session("ab\ncd");
    expect(s.feed(":registers<CR>").message).not.toBeNull();
    s.feed("<CR>x");
    expect(s.doc()).toBe("b\ncd");
  });

  test(":map is blocked and a still appends", () => {
    const s = session("x");
    expect(s.feed(":map a b<CR>").message).toBe("mappings and :set are disabled in Yank Wars");
    s.feed("aZ<Esc>");
    expect(s.doc()).toBe("xZ");
  });

  for (const cmd of [":nn a b", ":ino a b", ":se nopcre", ":colo default"]) {
    test(`${cmd} is blocked`, () => {
      const s = session("x");
      expect(s.feed(`${cmd}<CR>`).message).toBe("mappings and :set are disabled in Yank Wars");
      expect(s.doc()).toBe("x");
    });
  }

  test(":w is blocked", () => {
    const s = session("x");
    expect(s.feed(":w<CR>").message).toBe("lock-in is automatic");
    expect(s.doc()).toBe("x");
  });

  test("blocked mappings never take effect", () => {
    expect(run("x", ":nn a b<CR>aZ<Esc>").doc).toBe("xZ");
    expect(run("x", ":ino Z Y<CR>aZ<Esc>").doc).toBe("xZ");
  });
});
