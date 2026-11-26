// vim's ex command line (:help cmdline-ranges, ex-cmd-index) for the commands golfers use; the rest go to the core.

import { type CodeMirror as CM, CodeMirror, Vim } from "@replit/codemirror-vim";
import {
  checkRange,
  cursorLine,
  type ExCommand,
  ExError,
  type ExRange,
  lastLine,
  parseRange,
  Reader,
  splitBar,
} from "./exParse.ts";
import { global } from "./global.ts";
import { shiftLine, shiftUnit } from "./indent.ts";
import { joinLines, registers, toLineStart } from "./lines.ts";
import { runNormal } from "./macro.ts";
import { boundTo } from "./registry.ts";
import { exSort } from "./sort.ts";
import { substitute } from "./substitute.ts";

interface Def {
  name: string;
  /** shortest abbreviation */
  min: number;
  /** may return the command after a | */
  run(cm: CM, cmd: ExCommand): unknown;
  /** | is part of the argument (:g, :normal) */
  takesBar?: boolean;
  /** the range when none is typed: the cursor line, or the whole buffer */
  whole?: boolean;
}

/** A trailing count: the range becomes count lines from its last line. */
function applyCount(cm: CM, range: ExRange, count: string): void {
  if (count === "") return;
  const n = Number(count);
  if (n === 0) throw new ExError("E939: Positive count required");
  range.line1 = range.line2;
  range.line2 = Math.min(lastLine(cm), range.line2 + n - 1);
}

function deleteLines(cm: CM, line1: number, line2: number): string {
  const last = lastLine(cm);
  const text = `${cm.getRange(new CodeMirror.Pos(line1, 0), new CodeMirror.Pos(line2, cm.getLine(line2).length))}\n`;
  if (line2 < last)
    cm.replaceRange("", new CodeMirror.Pos(line1, 0), new CodeMirror.Pos(line2 + 1, 0));
  else if (line1 > 0)
    cm.replaceRange(
      "",
      new CodeMirror.Pos(line1 - 1, cm.getLine(line1 - 1).length),
      new CodeMirror.Pos(line2, cm.getLine(line2).length),
    );
  else
    cm.replaceRange(
      "",
      new CodeMirror.Pos(0, 0),
      new CodeMirror.Pos(line2, cm.getLine(line2).length),
    );
  return text;
}

/** Puts whole lines below `after` (-1: above the first line). */
function insertLines(cm: CM, after: number, lines: readonly string[]): void {
  const text = lines.join("\n");
  if (after < 0) cm.replaceRange(`${text}\n`, new CodeMirror.Pos(0, 0));
  else cm.replaceRange(`\n${text}`, new CodeMirror.Pos(after, cm.getLine(after).length));
}

function getLines(cm: CM, line1: number, line2: number): string[] {
  const out: string[] = [];
  for (let l = line1; l <= line2; l++) out.push(cm.getLine(l));
  return out;
}

/** :d and :y take an optional register (not a digit) and then a count. */
function registerAndCount(arg: string): { reg: string | undefined; count: string } {
  const m = /^\s*([^\d\s])?\s*(\d*)\s*$/.exec(arg);
  if (!m) throw new ExError(`E488: Trailing characters: ${arg}`);
  return { reg: m[1], count: m[2] ?? "" };
}

function shiftLines(cm: CM, cmd: ExCommand, dir: 1 | -1): void {
  const m = /^(>*|<*)\s*(\d*)\s*$/.exec(cmd.arg);
  if (!m) throw new ExError(`E488: Trailing characters: ${cmd.arg}`);
  const times = 1 + (m[1]?.length ?? 0);
  applyCount(cm, cmd.range, m[2] ?? "");
  checkRange(cm, cmd.range);
  cm.setCursor(cmd.range.line1, 0);
  const unit = shiftUnit(cm);
  for (let l = cmd.range.line1; l <= cmd.range.line2; l++) shiftLine(cm, l, dir * times, unit);
  toLineStart(cm, cmd.range.line2);
}

function destination(cm: CM, arg: string): number {
  const r = new Reader(arg.trim());
  if (r.text === "0") return -1;
  const range = parseRange(cm, r);
  if (r.rest().trim() !== "") throw new ExError(`E488: Trailing characters: ${r.rest()}`);
  if (range.count === 0) throw new ExError("E14: Invalid address");
  if (range.line2 < -1 || range.line2 > lastLine(cm)) throw new ExError("E16: Invalid range");
  return range.line2;
}

const COMMANDS: readonly Def[] = [
  {
    name: "delete",
    min: 1,
    run(cm, cmd) {
      const { reg, count } = registerAndCount(cmd.arg);
      applyCount(cm, cmd.range, count);
      checkRange(cm, cmd.range);
      // ex_operators(): the cursor goes to the range first, which is where u brings it back.
      cm.setCursor(cmd.range.line1, 0);
      const text = deleteLines(cm, cmd.range.line1, cmd.range.line2);
      registers().pushText(reg, "delete", text, true, false);
      toLineStart(cm, Math.min(cmd.range.line1, lastLine(cm)));
    },
  },
  {
    name: "yank",
    min: 1,
    run(cm, cmd) {
      const { reg, count } = registerAndCount(cmd.arg);
      applyCount(cm, cmd.range, count);
      checkRange(cm, cmd.range);
      const text = `${getLines(cm, cmd.range.line1, cmd.range.line2).join("\n")}\n`;
      registers().pushText(reg, "yank", text, true, false);
    },
  },
  {
    name: "join",
    min: 1,
    run(cm, cmd) {
      const m = /^\s*(\d*)\s*$/.exec(cmd.arg);
      if (!m) throw new ExError(`E488: Trailing characters: ${cmd.arg}`);
      const r = cmd.range;
      if (m[1]) {
        r.line1 = r.line2;
        r.line2 = r.line2 + Number(m[1]) - 1;
      } else if (r.count < 2) r.line2 = r.line1 + 1;
      else if (r.line1 === r.line2) {
        // :2,2j does nothing but move to the line, keeping the column.
        cm.setCursor(
          r.line1,
          Math.min(cm.getCursor().ch, Math.max(0, cm.getLine(r.line1).length - 1)),
        );
        return;
      }
      r.line2 = Math.min(r.line2, lastLine(cm));
      checkRange(cm, { ...r, line2: Math.max(r.line1, r.line2) });
      if (r.line2 > r.line1) joinLines(cm, r.line1, r.line2 - r.line1 + 1, !cmd.bang);
      toLineStart(cm, r.line1);
    },
  },
  {
    name: "move",
    min: 1,
    run(cm, cmd) {
      checkRange(cm, cmd.range);
      const { line1, line2 } = cmd.range;
      const dest = destination(cm, cmd.arg);
      if (dest >= line1 && dest < line2)
        throw new ExError("E134: Cannot move a range of lines into itself");
      if (dest === line2 || dest === line1 - 1) {
        toLineStart(cm, line2);
        return;
      }
      const lines = getLines(cm, line1, line2);
      const n = lines.length;
      if (dest > line2) {
        insertLines(cm, dest, lines);
        deleteLines(cm, line1, line2);
        toLineStart(cm, dest);
      } else {
        deleteLines(cm, line1, line2);
        insertLines(cm, dest, lines);
        toLineStart(cm, dest + n);
      }
    },
  },
  {
    name: "copy",
    min: 2,
    run: copy,
  },
  { name: "t", min: 1, run: copy },
  { name: ">", min: 1, run: (cm, cmd) => shiftLines(cm, cmd, 1) },
  { name: "<", min: 1, run: (cm, cmd) => shiftLines(cm, cmd, -1) },
  {
    name: "k",
    min: 1,
    run: (cm, cmd) => setMark(cm, cmd),
  },
  { name: "mark", min: 2, run: (cm, cmd) => setMark(cm, cmd) },
  {
    name: "put",
    min: 2,
    run(cm, cmd) {
      const typed = cmd.arg.trim();
      // The clipboard registers are the unnamed one in Yank Wars (vimSetup.ts).
      const name = typed === "" || typed === "+" || typed === "*" ? undefined : typed;
      const reg = registers().getRegister(name);
      let text = reg.toString();
      if (text === "") throw new ExError(`E353: Nothing in register ${name ?? '"'}`);
      if (text.endsWith("\n")) text = text.slice(0, -1);
      const lines = text.split("\n");
      const after = cmd.range.count === 0 ? cursorLine(cm) : cmd.range.line2;
      const at = cmd.bang ? after - 1 : after;
      if (at > lastLine(cm)) throw new ExError("E16: Invalid range");
      insertLines(cm, at, lines);
      toLineStart(cm, at + lines.length);
    },
  },
  {
    name: "normal",
    min: 4,
    takesBar: true,
    run(cm, cmd) {
      const b = boundTo(cm);
      if (b === undefined) return;
      const text = cmd.arg.replace(/^[ \t]+/, "");
      if (!text) throw new ExError("E471: Argument required");
      if (cmd.range.count === 0) {
        runNormal(b, text);
        return;
      }
      checkRange(cm, cmd.range);
      for (let line = cmd.range.line1; line <= cmd.range.line2 && line <= lastLine(cm); line++) {
        cm.setCursor(line, 0);
        runNormal(b, text);
      }
    },
  },
  {
    name: "substitute",
    min: 1,
    takesBar: true,
    run: (cm, cmd) => substitute(cm, cmd, "s"),
  },
  { name: "&", min: 1, takesBar: true, run: (cm, cmd) => substitute(cm, cmd, "&") },
  { name: "~", min: 1, takesBar: true, run: (cm, cmd) => substitute(cm, cmd, "~") },
  {
    name: "global",
    min: 1,
    whole: true,
    takesBar: true,
    run: (cm, cmd) => global(cm, cmd, cmd.bang),
  },
  { name: "vglobal", min: 1, whole: true, takesBar: true, run: (cm, cmd) => global(cm, cmd, true) },
  { name: "sort", min: 3, whole: true, run: (cm, cmd) => exSort(cm, cmd) },
];

function copy(cm: CM, cmd: ExCommand): void {
  checkRange(cm, cmd.range);
  const lines = getLines(cm, cmd.range.line1, cmd.range.line2);
  const dest = destination(cm, cmd.arg);
  insertLines(cm, dest, lines);
  toLineStart(cm, dest + lines.length);
}

function setMark(cm: CM, cmd: ExCommand): void {
  const name = cmd.arg.trim();
  if (name.length !== 1)
    throw new ExError(name ? "E488: Trailing characters" : "E471: Argument required");
  if (!/[a-zA-Z'`<>[\]]/.test(name))
    throw new ExError("E191: Argument must be a letter or forward/backward quote");
  const vim = cm.state.vim;
  if (!vim) return;
  const line = cmd.range.line2;
  vim.marks[name]?.clear();
  vim.marks[name] = cm.setBookmark(new CodeMirror.Pos(line, 0));
}

function findCommand(name: string): Def | undefined {
  for (const d of COMMANDS) {
    if (name.length >= d.min && d.name.startsWith(name)) return d;
  }
  return undefined;
}

/** Splits `[range]name[!] args`; undefined when the core should run it. */
export function parseCommand(cm: CM, input: string): { def: Def | undefined; cmd: ExCommand } {
  const r = new Reader(input);
  while (r.peek() === ":" || r.peek() === " " || r.peek() === "\t") r.i++;
  const range = parseRange(cm, r);
  r.white();
  let name = "";
  const c = r.peek();
  if (c === "&" && r.peek(1) === "&") {
    name = "&";
    r.i++;
  } else if ("&~<>".includes(c) && c !== "") {
    name = c;
    r.i++;
  } else {
    while (/[A-Za-z]/.test(r.peek())) name += r.text[r.i++];
    // :ka and :s/x/y/ need no space; neither do :dl-style commands, which we leave to the core.
    if (
      /^k[a-zA-Z]$/.test(name) ||
      (name.startsWith("k") && name.length > 1 && !"keepmarks".startsWith(name))
    ) {
      r.i -= name.length - 1;
      name = "k";
    }
  }
  let bang = false;
  if (r.peek() === "!" && name !== "") {
    bang = true;
    r.i++;
  }
  const arg = r.rest();
  const cmd: ExCommand = { range, name, bang, arg };
  return { def: name === "" ? undefined : findCommand(name), cmd };
}

export function executeEx(cm: CM, input: string): boolean {
  const { def, cmd } = parseCommand(cm, input);
  if (cmd.name === "") {
    if (cmd.range.count === 0) return true;
    // A range alone moves to its last line.
    // :0 is line 1; past the end is the last line.
    const line = Math.max(0, Math.min(lastLine(cm), cmd.range.line2));
    Vim.getVimGlobalState_().jumpList.add(cm, cm.getCursor(), new CodeMirror.Pos(line, 0));
    toLineStart(cm, line);
    return true;
  }
  if (def === undefined) return false;
  if (def.whole && cmd.range.count === 0) cmd.range = { line1: 0, line2: lastLine(cm), count: 0 };
  let next: string | undefined;
  if (!def.takesBar) [cmd.arg, next] = splitBar(cmd.arg);
  const after = def.run(cm, cmd);
  next ??= typeof after === "string" && after !== "" ? after : undefined;
  if (next !== undefined && next.trim() !== "") executeEx(cm, next);
  return true;
}

/** The core's processCommand calls this first (our patch); true when ex.ts ran the line. */
export function exHook(cm: CM, input: string, params?: { callback?: () => void }): boolean {
  let handled = false;
  cm.operation(() => {
    if (cm.curOp) cm.curOp.isVimOp = true;
    const vim = cm.state.vim;
    if (vim?.visualMode) Vim.exitVisualMode(cm as Parameters<typeof Vim.exitVisualMode>[0]);
    const known = peekKnown(cm, input);
    if (!known) return;
    registers().getRegister(":").setText(input);
    handled = executeEx(cm, input);
  });
  if (handled) params?.callback?.();
  return handled;
}

// Decides without side effects (a ; in the range moves the cursor) whether ex.ts runs this line.
function peekKnown(cm: CM, input: string): boolean {
  const cur = cm.getCursor();
  try {
    const { def, cmd } = parseCommand(cm, input);
    return def !== undefined || cmd.name === "";
  } catch {
    return true;
  } finally {
    cm.setCursor(cur);
  }
}
