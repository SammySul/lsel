// vim's Insstart_orig (edit.c): where this insert began, per cursor, so <C-w>/<C-u> can stop there.

import type { ChangeSpec } from "@codemirror/state";
import type { EditorSession } from "../session.ts";

interface InsertStart {
  pending: boolean;
  inInsert: boolean;
  starts: { line: number; ch: number }[];
  frozen: boolean;
  arrowUsed: boolean;
  changed: boolean;
}

const state = new WeakMap<EditorSession, InsertStart>();

function of(s: EditorSession): InsertStart {
  let st = state.get(s);
  if (st === undefined) {
    st = {
      pending: false,
      inInsert: false,
      starts: [],
      frozen: false,
      arrowUsed: false,
      changed: false,
    };
    state.set(s, st);
  }
  return st;
}

function heads(s: EditorSession) {
  const { doc, selection } = s.view.state;
  return selection.ranges.map((r) => {
    const line = doc.lineAt(r.head);
    return { line: line.number, ch: r.head - line.from };
  });
}

// The core signals the mode before it places the cursor (vim.js:3104-3112): capture after the key.
export function noteModeChange(s: EditorSession, mode: string): void {
  const st = of(s);
  const insert = mode === "insert" || mode === "replace";
  if (insert && !st.inInsert) st.pending = true;
  st.inInsert = insert;
}

export function captureInsertStart(s: EditorSession): void {
  const st = of(s);
  if (!st.pending) return;
  st.pending = false;
  if (!s.cm.state.vim?.insertMode) return;
  st.starts = heads(s);
  st.frozen = false;
  st.arrowUsed = false;
  st.changed = false;
}

/** Where the current insert started (0-based line and ch), for i_CTRL-G j/k. */
export function insertStartOf(s: EditorSession): { line: number; ch: number } | undefined {
  const at = of(s).starts[0];
  return at && { line: at.line - 1, ch: at.ch };
}

export function noteArrow(s: EditorSession): void {
  of(s).arrowUsed = true;
}

// stop_arrow(): an edit after a cursor key restarts the insert, until the cursor moved right of it after typing.
export function beforeInsertEdit(s: EditorSession): void {
  const st = of(s);
  if (st.arrowUsed) {
    st.arrowUsed = false;
    const now = heads(s);
    const main = now[0];
    const was = st.starts[0];
    if (!st.frozen && main && was && main.ch > was.ch && st.changed) st.frozen = true;
    if (!st.frozen) st.starts = now;
  }
  st.changed = true;
}

const isSpace = (c: string) => c === " " || c === "\t";
// vim's default 'iskeyword': @,48-57,_,192-255.
const isWordChar = (c: string) => /[A-Za-z0-9_À-ÿ]/.test(c);

export function deleteBackInInsert(s: EditorSession | undefined, mode: "word" | "line"): void {
  if (s === undefined) return;
  beforeInsertEdit(s);
  const st = of(s);
  const { doc, selection } = s.view.state;
  const changes: ChangeSpec[] = [];
  selection.ranges.forEach((r, i) => {
    const line = doc.lineAt(r.head);
    const col = r.head - line.from;
    if (col === 0) {
      if (line.number === 1) return;
      changes.push({ from: r.head - 1, to: r.head });
      const start = st.starts[i];
      if (!st.frozen && start?.line === line.number) {
        st.starts[i] = { line: line.number - 1, ch: doc.line(line.number - 1).length };
      }
      return;
    }
    const start = st.starts[i];
    const stopAt = start?.line === line.number ? start.ch : -1;
    let p = col;
    let word: boolean | undefined;
    do {
      const c = line.text[p - 1] ?? "";
      if (mode === "word") {
        if (word === undefined) {
          if (!isSpace(c)) word = isWordChar(c);
        } else if (isSpace(c) || isWordChar(c) !== word) break;
      }
      p--;
    } while (p > 0 && p !== stopAt);
    changes.push({ from: line.from + p, to: r.head });
  });
  if (changes.length > 0) s.view.dispatch({ changes, userEvent: "delete.backward" });
}
