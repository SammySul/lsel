import { afterEach, describe, expect, test } from "bun:test";
import { CodeMirror, Vim } from "@replit/codemirror-vim";
import {
  applyEngineOptions,
  createSession,
  destroySession,
  type EditorSession,
  feedKey,
  lockEngine,
  type Puzzle,
  parseKeys,
  replay,
  sessionSnapshot,
} from "./index.ts";

function puzzle(start: string, over: Partial<Puzzle> = {}): Puzzle {
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
    ...over,
  };
}

const run = (start: string, notation: string) => replay(puzzle(start), parseKeys(notation));

let live: EditorSession | null = null;
afterEach(() => {
  if (live) destroySession(live);
  live = null;
});

function session(start: string, over: Partial<Puzzle> = {}): EditorSession {
  live = createSession(puzzle(start, over), { parent: document.body });
  return live;
}

function feed(s: EditorSession, notation: string) {
  for (const k of parseKeys(notation)) feedKey(s, k);
  return sessionSnapshot(s);
}

describe("lockEngine", () => {
  test("a second call changes nothing", () => {
    lockEngine();
    const newline = CodeMirror.commands.newlineAndIndent;
    lockEngine();
    expect(CodeMirror.commands.newlineAndIndent).toBe(newline);
    expect(run("x", ":map a b<CR>aZ<Esc>").doc).toBe("xZ");
  });

  test("newlineAndIndent inserts exactly a newline", () => {
    const s = session("function f() {", { language: "javascript", indentUnit: "  " });
    s.view.dispatch({ selection: { anchor: s.view.state.doc.length } });
    CodeMirror.commands.newlineAndIndent(s.cm);
    expect(s.view.state.doc.toString()).toBe("function f() {\n");
  });
});

describe("applyEngineOptions", () => {
  test("restores nopcre after a global reset", () => {
    lockEngine();
    Vim.resetVimGlobalState_();
    expect(Vim.getOption("pcre")).toBe(true);
    applyEngineOptions();
    expect(Vim.getOption("pcre")).toBe(false);
  });
});

describe("blocked ex commands", () => {
  const mappings = [
    "colorscheme",
    "colo",
    "map",
    "imap",
    "im",
    "nmap",
    "nm",
    "vmap",
    "vm",
    "omap",
    "om",
    "noremap",
    "no",
    "nnoremap",
    "nn",
    "vnoremap",
    "vn",
    "inoremap",
    "ino",
    "onoremap",
    "ono",
    "unmap",
    "mapclear",
    "mapc",
    "nmapclear",
    "nmapc",
    "vmapclear",
    "vmapc",
    "imapclear",
    "imapc",
    "omapclear",
    "omapc",
    "set",
    "se",
    "setlocal",
    "setl",
    "setglobal",
    "setg",
  ];
  for (const cmd of mappings) {
    test(`:${cmd}`, () => {
      const s = session("x");
      expect(feed(s, `:${cmd} a<CR>`).message).toBe("mappings and :set are disabled in Yank Wars");
      expect(s.view.state.doc.toString()).toBe("x");
    });
  }
  for (const cmd of ["write", "w"]) {
    test(`:${cmd}`, () => {
      const s = session("x");
      expect(feed(s, `:${cmd}<CR>`).message).toBe("lock-in is automatic");
      expect(s.view.state.doc.toString()).toBe("x");
    });
  }
});

describe("clipboard registers", () => {
  test('"+ never touches navigator.clipboard', () => {
    const shim = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    try {
      expect(navigator.clipboard).toBeUndefined();
      const r = run("a", '"+yy"+p');
      expect(r.doc).toBe("a\na");
      expect(r.errors).toEqual([]);
    } finally {
      if (shim) Object.defineProperty(navigator, "clipboard", shim);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  test('"+ and "* read the unnamed register', () => {
    expect(run("a\nb", 'yyj"+p').doc).toBe("a\nb\na");
    expect(run("a\nb", 'yyj"*p').doc).toBe("a\nb\na");
  });

  // The core reads the clipboard asynchronously (vim.js:3253): a paste would land after the key.
  test("no ex command reaches navigator.clipboard either", async () => {
    const calls: string[] = [];
    const shim = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText: async () => {
          calls.push("read");
          return "CLIP";
        },
        writeText: async (t: string) => {
          calls.push(`write ${t}`);
        },
      },
    });
    try {
      const s = session("abc\ndef\nghi");
      feed(s, ':y +<CR>j:pu +<CR>:pu! *<CR>:g/^d/pu +<CR>"+yyG"+pi<C-r>+<Esc>');
      await Bun.sleep(10);
      expect(calls).toEqual([]);
      // vim's result for the same keys with the unnamed register in place of "+ and "*.
      expect(s.view.state.doc.toString()).toBe("abc\ndef\nabc\nabc\nabc\nghi\nabc");
    } finally {
      if (shim) Object.defineProperty(navigator, "clipboard", shim);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });
});

describe("virtual 30-line window", () => {
  // Line i is `L<i>`; x removes the `L` on the line the motion reached.
  const lines = Array.from({ length: 40 }, (_, i) => `L${i}`);
  const at = (line: number) => lines.map((l, i) => (i === line ? l.slice(1) : l)).join("\n");
  const cases: [string, number][] = [
    ["Lx", 29],
    ["Mx", 14],
    ["<C-f>x", 28],
    ["<C-f><C-f>x", 39],
    ["2<C-f>x", 39],
    ["G<C-b>x", 11],
    ["<C-d>x", 15],
    ["<C-d><C-d>x", 30],
    ["5<C-d>x", 5],
    ["G<C-u>x", 24],
    ["Ggkx", 38],
    ["zbjzzzt<C-e><C-e><C-y>x", 1],
  ];
  for (const [keys, line] of cases) {
    test(`${keys} on a 40-line doc deletes on line ${line}`, () => {
      expect(run(lines.join("\n"), keys).doc).toBe(at(line));
    });
  }

  test("H and L land on the first non-blank", () => {
    expect(run("  a\nb\n  c", "Lx").doc).toBe("  a\nb\n  ");
    expect(run("  a\nb\n  c", "GHx").doc).toBe("  \nb\n  c");
  });
});
