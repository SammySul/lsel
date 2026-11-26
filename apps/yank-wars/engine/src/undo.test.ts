import { describe, expect, setSystemTime, test } from "bun:test";
import { Compartment } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { testPuzzle } from "../oracle/engine.ts";
import { createSession, destroySession, type EditorSession, feedKey, parseKeys } from "./index.ts";

type Clock = "real" | "advancing" | "frozen";
const CLOCKS: readonly Clock[] = ["real", "advancing", "frozen"];
const EPOCH = Date.UTC(2026, 0, 1);

// Feeds keys one by one under a given wall clock; undo grouping must not care which.
interface Harness {
  s: EditorSession;
  feed(notation: string): void;
  // Like the web's line-number toggle: an effects-only reconfigure.
  toggleNumbers(): void;
}

function withSession<T>(start: string, clock: Clock, body: (h: Harness) => T): T {
  const numbers = new Compartment();
  const s = createSession(testPuzzle(start, { language: "javascript" }), {
    parent: document.body,
    extraExtensions: [numbers.of([])],
  });
  let on = false;
  const toggleNumbers = () => {
    on = !on;
    s.view.dispatch({
      effects: numbers.reconfigure(on ? EditorView.editorAttributes.of({ class: "numbers" }) : []),
    });
  };
  let i = 0;
  const feed = (notation: string) => {
    for (const k of parseKeys(notation)) {
      if (clock === "advancing") setSystemTime(EPOCH + i * 10_000);
      i++;
      feedKey(s, k);
    }
  };
  if (clock === "frozen") setSystemTime(EPOCH);
  try {
    return body({ s, feed, toggleNumbers });
  } finally {
    setSystemTime();
    destroySession(s);
  }
}

function undoRun(start: string, notation: string, clock: Clock): string {
  return withSession(start, clock, ({ s, feed }) => {
    feed(notation);
    return s.view.state.doc.toString();
  });
}

describe("undo steps are a function of the key log", () => {
  const cases: [string, string, string][] = [
    ["one", "ihello<Esc>u", "one"],
    ["one", "xihello<Esc>u", "ne"],
    ["bar baz", "cwfoo<Esc>u", "bar baz"],
    ["one", "ohey<Esc>u", "one"],
    ["one", "ihi<Esc>ohey<Esc>uu", "one"],
    ["one", "3ix<Esc>u", "one"],
    ["abc", "xxu", "bc"],
    ["one\ntwo\nthree", "ddp.u", "two\none\nthree"],
    ["one", "ihello<C-w>world<Esc>u", "one"],
    ["one", "ia<BS>b<Esc>u", "one"],
    ["ab\ncd", "<C-v>jIZ<Esc>u", "ab\ncd"],
    ["a a\na", ":%s/a/b/g<CR>u", "a a\na"],
    ["x1\ny\nx2", ":g/x/d<CR>u", "x1\ny\nx2"],
    // vim: u undoes a whole macro run, here 2@q (which stops at the failing j).
    ["ab\ncd\nef", "qqxjq2@qu", "b\ncd\nef"],
    ["a\nb", "qaA,<Esc>jq@au", "a,\nb"],
    ["a\nb", ":g/^/norm Ax<CR>u", "a\nb"],
    ["abc", "xu<C-r>", "bc"],
    // vim (:help ins-special-special): a cursor key that moves, or any <Home>/<End>, splits the insert.
    ["", "ifoo<Left>bar<Esc>u", "foo"],
    ["", "ifoo<Right>bar<Esc>u", ""],
    ["", "ifoo<End>bar<Esc>u", "foo"],
    ["ab", "Afoo<Left><Right>bar<Esc>u", "abfoo"],
  ];
  for (const [start, keys, want] of cases) {
    test(keys, () => {
      for (const clock of CLOCKS) expect(undoRun(start, keys, clock)).toBe(want);
    });
  }

  test("the steps in between are the vim ones, not one big step", () => {
    for (const clock of CLOCKS) {
      expect(undoRun("one", "ihi<Esc>ohey<Esc>u", clock)).toBe("hione");
      expect(undoRun("abc", "xxxuu", clock)).toBe("bc");
      expect(undoRun("ab\ncd\nef", "qqxjq2@quu", clock)).toBe("ab\ncd\nef");
    }
  });
});

describe("transactions outside the key log", () => {
  test("a compartment reconfigure and an empty transaction add no step", () => {
    for (const clock of CLOCKS) {
      const doc = withSession("abc", clock, ({ s, feed, toggleNumbers }) => {
        feed("xx");
        toggleNumbers();
        s.view.dispatch({});
        feed("u");
        return s.view.state.doc.toString();
      });
      expect(doc).toBe("bc");
    }
  });

  test("they do not split an insert session", () => {
    for (const clock of CLOCKS) {
      const doc = withSession("abc", clock, ({ s, feed, toggleNumbers }) => {
        feed("ihel");
        toggleNumbers();
        s.view.dispatch({});
        feed("lo<Esc>u");
        return s.view.state.doc.toString();
      });
      expect(doc).toBe("abc");
    }
  });
});
