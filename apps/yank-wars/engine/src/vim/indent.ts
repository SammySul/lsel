// Indent as vim's shift_line() builds it, from the puzzle's indentUnit and tabSize (> < :> :< r<Tab>).

import { type CodeMirror as CM, CodeMirror } from "@replit/codemirror-vim";
import { boundTo } from "./registry.ts";

export interface ShiftUnit {
  width: number;
  tabSize: number;
  useTabs: boolean;
}

export function shiftUnit(cm: CM): ShiftUnit {
  const unit = boundTo(cm)?.session.puzzle.indentUnit ?? "  ";
  const tabSize = boundTo(cm)?.session.puzzle.tabSize ?? 2;
  return unit === "\t"
    ? { width: tabSize, tabSize, useTabs: true }
    : { width: unit.length, tabSize, useTabs: false };
}

/** shift_line(): empty lines stay empty; the indent is rebuilt from its width (expandtab or tabs). */
export function shiftLine(cm: CM, line: number, amount: number, u: ShiftUnit): void {
  const text = cm.getLine(line);
  if (text.length === 0) return;
  const indent = /^[ \t]*/.exec(text)?.[0] ?? "";
  let width = 0;
  for (const c of indent) width = c === "\t" ? width + u.tabSize - (width % u.tabSize) : width + 1;
  // 'noshiftround': the indent moves by whole shiftwidths from where it is.
  const next = Math.max(0, width + amount * u.width);
  const fresh = u.useTabs
    ? "\t".repeat(Math.floor(next / u.tabSize)) + " ".repeat(next % u.tabSize)
    : " ".repeat(next);
  if (fresh !== indent)
    cm.replaceRange(fresh, new CodeMirror.Pos(line, 0), new CodeMirror.Pos(line, indent.length));
}
