// :g and :v (:help :global).

import { type CodeMirror as CM, CodeMirror, Vim } from "@replit/codemirror-vim";
import { executeEx } from "./ex.ts";
import {
  checkRange,
  cursorLine,
  type ExCommand,
  ExError,
  lastLine,
  lastPattern,
  Reader,
  skipPattern,
} from "./exParse.ts";
import { registers, toLineStart } from "./lines.ts";
import { boundTo } from "./registry.ts";
import { trackLines } from "./track.ts";
import { vimRegExp } from "./vimRegex.ts";

let globalDepth = 0;
/** Commands that end with beginline() defer it to the end of :g (global_need_beginline). */
let globalLineStart = false;

/** :g runs its command with the cursor on each marked line, in order, skipping lines deleted on the way. */
export function global(cm: CM, cmd: ExCommand, invert: boolean): void {
  if (globalDepth > 0) throw new ExError("E147: Cannot do :global recursive");
  const r = new Reader(cmd.arg);
  r.white();
  const delim = r.peek();
  if (delim === "" || /[A-Za-z0-9\\"|]/.test(delim))
    throw new ExError("E146: Regular expressions can't be delimited by letters");
  r.i++;
  const end = skipPattern(r.text, r.i, delim);
  let pattern = r.text.slice(r.i, end);
  r.i = end < r.text.length ? end + 1 : end;
  if (pattern === "") pattern = lastPattern();
  else registers().getRegister("/").setText(pattern);
  Vim.getVimGlobalState_().query = vimRegExp(pattern, "m");
  const command = r.rest() || "p";
  const re = vimRegExp(pattern, "");
  const range = cmd.range.count === 0 ? { line1: 0, line2: lastLine(cm), count: 0 } : cmd.range;
  checkRange(cm, range);
  const starts: number[] = [];
  for (let l = range.line1; l <= range.line2; l++) {
    re.lastIndex = 0;
    if (re.test(cm.getLine(l)) !== invert) starts.push(cm.indexFromPos(new CodeMirror.Pos(l, 0)));
  }
  if (starts.length === 0) throw new ExError(`E486: Pattern not found: ${pattern}`);
  const view = boundTo(cm)?.session.view;
  if (view === undefined) return;
  const tracked = trackLines(view, starts);
  globalDepth++;
  globalLineStart = false;
  try {
    for (const at of tracked.positions) {
      // A deleted line loses its mark; one joined onto another line no longer starts a line.
      if (at === null || at === undefined) continue;
      const pos = cm.posFromIndex(at);
      if (pos.ch !== 0) continue;
      cm.setCursor(pos.line, 0);
      if (!executeEx(cm, command)) Vim.handleEx(cm as Parameters<typeof Vim.handleEx>[0], command);
    }
  } finally {
    globalDepth--;
    tracked.stop();
  }
  if (globalLineStart) toLineStart(cm, cursorLine(cm));
  globalLineStart = false;
}

export function inGlobal(): boolean {
  return globalDepth > 0;
}
export function deferLineStart(): void {
  globalLineStart = true;
}
