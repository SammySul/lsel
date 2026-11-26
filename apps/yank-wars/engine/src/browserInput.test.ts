// Headless KeyboardEvents only: native text insertion, IME and the inputHandler/beforeinput blocking are untested.
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { testPuzzle as puzzle } from "../oracle/engine.ts";
import {
  type BlockedReason,
  type BrowserInputOptions,
  browserInput,
  createSession,
  destroySession,
  type EditorSession,
  parseKeys,
  replay,
  sessionSnapshot,
  type VimKey,
} from "./index.ts";

interface Rig {
  session: EditorSession;
  logged: VimKey[];
  intercepted: VimKey[];
  blocked: BlockedReason[];
  press(key: string, mods?: Partial<KeyboardEventInit>): KeyboardEvent;
  doc(): string;
}

let live: EditorSession | null = null;
afterEach(() => {
  if (live) destroySession(live);
  live = null;
});

function rig(start: string, opts: Partial<BrowserInputOptions> = {}): Rig {
  const logged: VimKey[] = [];
  const intercepted: VimKey[] = [];
  const blocked: BlockedReason[] = [];
  let session!: EditorSession;
  session = createSession(puzzle(start), {
    parent: document.body,
    extraExtensions: [
      browserInput(() => session, {
        platform: "other",
        onKey: (k) => logged.push(k),
        onBlocked: (r) => blocked.push(r),
        ...opts,
        intercept: (k, e) => {
          intercepted.push(k);
          return opts.intercept?.(k, e) ?? false;
        },
      }),
    ],
  });
  live = session;
  return {
    session,
    logged,
    intercepted,
    blocked,
    press(key, mods = {}) {
      const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods });
      session.view.contentDOM.dispatchEvent(e);
      return e;
    },
    doc: () => session.view.state.doc.toString(),
  };
}

describe("key capture", () => {
  test("keys are logged, fed like replay(), and prevented", () => {
    const r = rig("hello");
    const events = [
      r.press("x"),
      r.press("a"),
      r.press("Z", { shiftKey: true }),
      r.press("Escape"),
    ];
    expect(r.logged).toEqual(parseKeys("xaZ<Esc>"));
    expect(r.doc()).toBe("eZllo");
    expect(r.doc()).toBe(replay(puzzle("hello"), parseKeys("xaZ<Esc>")).doc);
    expect(events.map((e) => e.defaultPrevented)).toEqual([true, true, true, true]);
  });

  test("Meta combos, modifiers alone, dead keys, IME and F-keys are dropped and prevented", () => {
    const r = rig("hello");
    const events = [
      r.press("a", { metaKey: true }),
      r.press("Shift", { shiftKey: true }),
      r.press("Dead"),
      r.press("Process"),
      r.press("F5"),
    ];
    expect(r.logged).toEqual([]);
    expect(r.doc()).toBe("hello");
    expect(events.map((e) => e.defaultPrevented)).toEqual([true, true, true, true, true]);
    expect(r.blocked).toEqual(["meta", "dead", "ime", "fkey"]);
  });

  test("accept() false swallows keys, intercept still sees them", () => {
    const r = rig("hello", { accept: () => false, intercept: (k) => k === "<Space>" });
    const x = r.press("x");
    const space = r.press(" ");
    expect(r.doc()).toBe("hello");
    expect(r.logged).toEqual([]);
    expect(r.intercepted).toEqual(parseKeys("x<Space>"));
    expect([x.defaultPrevented, space.defaultPrevented]).toEqual([true, true]);
  });

  test("<C-CR> reaches intercept and never onKey", () => {
    const r = rig("hello", { intercept: (k) => k === "<C-CR>" });
    const e = r.press("Enter", { ctrlKey: true });
    expect(r.intercepted).toEqual(parseKeys("<C-CR>"));
    expect(r.logged).toEqual([]);
    expect(e.defaultPrevented).toBe(true);
  });

  test("Ctrl+v in insert mode is logged and changes nothing", () => {
    const r = rig("hello");
    r.press("i");
    r.press("v", { ctrlKey: true });
    expect(r.logged).toEqual(parseKeys("i<C-v>"));
    expect(r.doc()).toBe("hello");
  });
});

// Bun's global Event is not happy-dom's; test/dom.ts installs only KeyboardEvent.
describe("blocked DOM events", () => {
  test("paste is prevented and does not enter insert mode", () => {
    const r = rig("hello");
    const e = new window.Event("paste", { bubbles: true, cancelable: true });
    r.session.view.contentDOM.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(sessionSnapshot(r.session).mode).toBe("normal");
    expect(r.doc()).toBe("hello");
  });

  for (const type of ["drop", "cut", "copy", "dragstart", "contextmenu"]) {
    test(`${type} is prevented`, () => {
      const r = rig("hello");
      const e = new window.Event(type, { bubbles: true, cancelable: true });
      r.session.view.contentDOM.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
    });
  }
});

describe("devGuard", () => {
  test("a change from outside feedKey is dropped (Firefox's stray DOM selections), logged keys go through", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const r = rig("hello", { devGuard: true });
      r.press("x");
      expect(r.session.view.state.doc.toString()).toBe("ello");
      r.session.view.dispatch({ changes: { from: 0, insert: "q" }, selection: { anchor: 3 } });
      r.session.view.dispatch({ selection: { anchor: 2 }, userEvent: "select" });
      expect(r.session.view.state.doc.toString()).toBe("ello");
      expect(r.session.view.state.selection.main.from).toBe(0);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
