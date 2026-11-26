// Reads an editor session's buffer, cursor and mode the way vim reports them.

import { type EditorSession, sessionSnapshot } from "../src/index.ts";
import type { Observed, OracleMode } from "./types.ts";

/** The session's buffer, cursor and mode in vim's terms; shared by the engine suite and the browser harness. */
export function observe(s: EditorSession): Observed {
  const vim = s.cm.state.vim;
  const hud = sessionSnapshot(s);
  // In visual mode the CM selection head sits past the character vim's cursor is on.
  const sel = vim?.visualMode ? vim.sel.head : s.cm.getCursor();
  // A <C-v>$ selection keeps Infinity as its column; vim's col('.') there is one past the line's end.
  const pos =
    sel.ch === Number.POSITIVE_INFINITY
      ? { line: sel.line, ch: s.cm.getLine(sel.line).length }
      : sel;
  let mode: OracleMode = hud.mode;
  if (s.prompt !== null) mode = "prompt";
  else if (hud.mode === "normal" && hud.insertModeReturn) mode = "insert-normal";
  else if (hud.mode === "normal" && vim?.inputState.operator) mode = "operator-pending";
  return {
    doc: s.view.state.doc.toString(),
    cursor: { line: pos.line + 1, col: pos.ch + 1 },
    mode,
  };
}
