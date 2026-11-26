// Line helpers the vim layer shares: first non-blank, J's join, tab columns, and wrapping core commands.

import {
  type ActionFn,
  type CodeMirror as CM,
  CodeMirror,
  type MotionFn,
  type OperatorFn,
  Vim,
} from "@replit/codemirror-vim";

export function firstNonBlank(text: string): number {
  const i = text.search(/[^ \t]/);
  return i === -1 ? Math.max(0, text.length - 1) : i;
}

/** The cursor on a line's first non-blank, as vim's beginline(BL_WHITE | BL_FIX) leaves it. */
export function toLineStart(cm: CM, line: number): void {
  const l = Math.max(0, Math.min(cm.lastLine(), line));
  const ch = firstNonBlank(cm.getLine(l));
  cm.setCursor(new CodeMirror.Pos(l, ch));
  const vim = cm.state.vim;
  if (vim) vim.lastHPos = ch;
}

/** do_join(): count lines from `line`; with insertSpace (J, :j) leading white space goes and one space is put in, as vim decides. */
export function joinLines(cm: CM, line: number, count: number, insertSpace: boolean): number {
  const last = Math.min(cm.lastLine(), line + count - 1);
  let text = cm.getLine(line);
  let col = 0;
  for (let l = line + 1; l <= last; l++) {
    let next = cm.getLine(l);
    let spaces = 0;
    if (insertSpace) {
      next = next.replace(/^[ \t]+/, "");
      const end = text[text.length - 1];
      if (next !== "" && next[0] !== ")" && text.length > 0 && end !== "\t" && end !== " ")
        spaces = 1;
    }
    col = text.length;
    text = text + " ".repeat(spaces) + next;
  }
  if (last > line) {
    cm.replaceRange(
      text,
      new CodeMirror.Pos(line, 0),
      new CodeMirror.Pos(last, cm.getLine(last).length),
    );
  }
  return col;
}

export function registers() {
  return Vim.getRegisterController();
}

// Our patch of the core makes the define* functions return what they replace, so an override can wrap it.
export const replaceMotion = Vim.defineMotion as unknown as (
  name: string,
  fn: MotionFn,
) => MotionFn;
export const replaceAction = Vim.defineAction as unknown as (
  name: string,
  fn: ActionFn,
) => ActionFn;
export const replaceOperator = Vim.defineOperator as unknown as (
  name: string,
  fn: OperatorFn,
) => OperatorFn;

/** The screen column where character ch starts (tabs to 'tabstop'). */
export function vcolOf(text: string, ch: number, tabSize: number): number {
  let v = 0;
  for (let i = 0; i < ch && i < text.length; i++)
    v = text[i] === "\t" ? v + tabSize - (v % tabSize) : v + 1;
  return v;
}

/** The character covering screen column vcol, or the line's length past its end. */
export function chAtVcol(text: string, vcol: number, tabSize: number): number {
  if (vcol === Number.POSITIVE_INFINITY) return text.length;
  let v = 0;
  for (let i = 0; i < text.length; i++) {
    const w = text[i] === "\t" ? tabSize - (v % tabSize) : 1;
    if (vcol < v + w) return i;
    v += w;
  }
  return text.length;
}

/** curswant for a cursor on ch: on a <Tab> normal mode shows the cursor on its last cell. */
export function cursorVcol(text: string, ch: number, tabSize: number): number {
  const v = vcolOf(text, ch, tabSize);
  return text[ch] === "\t" ? v + tabSize - (v % tabSize) - 1 : v;
}
