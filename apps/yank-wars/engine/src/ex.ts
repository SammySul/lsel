import { type CodeMirror as CM, CodeMirror, Vim } from "@replit/codemirror-vim";
import { joinLines, registers, toLineStart } from "./lines.ts";
import { runNormal } from "./macro.ts";
import { boundTo } from "./registry.ts";
import { exSort } from "./sort.ts";
import { lastSubstitute, substitute } from "./substitute.ts";
import { trackLines } from "./track.ts";
import { vimRegExp } from "./vimRegex.ts";

// vim's ex command line (:help cmdline-ranges, ex-cmd-index) for the commands golfers use; the rest go to the core.

export class ExError extends Error {}

export interface ExRange {
  line1: number;
  line2: number;
  /** how many addresses were typed: 0 means the command's default */
  count: number;
}

export interface ExCommand {
  range: ExRange;
  name: string;
  bang: boolean;
  arg: string;
}

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

const lastLine = (cm: CM) => cm.lastLine();
const cursorLine = (cm: CM) => cm.getCursor().line;

function markLine(cm: CM, name: string): number {
  const vim = cm.state.vim;
  if (name === "'" || name === "`") {
    const pos = Vim.getVimGlobalState_().jumpList.find(cm, -1);
    return pos ? pos.line : 0;
  }
  const mark = vim?.marks[name]?.find();
  if (!mark) throw new ExError("E20: Mark not set");
  return mark.line;
}

/** The end of a pattern the way skip_regexp() finds it: an unescaped delimiter outside [...]. */
export function skipPattern(text: string, from: number, delim: string): number {
  let i = from;
  while (i < text.length && text[i] !== delim) {
    if (text[i] === "\\" && i + 1 < text.length) i += 2;
    else if (text[i] === "[") {
      const close = skipCollection(text, i + 1);
      if (close === -1) return text.length;
      i = close + 1;
    } else i++;
  }
  return i;
}

function skipCollection(text: string, from: number): number {
  let i = from;
  if (text[i] === "^") i++;
  if (text[i] === "]" || text[i] === "-") i++;
  while (i < text.length && text[i] !== "]") {
    if (text[i] === "\\" && i + 1 < text.length) i += 2;
    else if (text[i] === "[" && text[i + 1] === ":") {
      const end = text.indexOf(":]", i + 2);
      i = end === -1 ? i + 1 : end + 2;
    } else i++;
  }
  return i >= text.length ? -1 : i;
}

function searchLine(cm: CM, pattern: string, from: number, forward: boolean): number {
  const re = vimRegExp(pattern, "");
  const n = cm.lastLine() + 1;
  for (let k = 1; k <= n; k++) {
    const l = (((forward ? from + k : from - k) % n) + n) % n;
    re.lastIndex = 0;
    if (re.test(cm.getLine(l))) return l;
  }
  throw new ExError(`E486: Pattern not found: ${pattern}`);
}

function lastPattern(): string {
  return registers().getRegister("/").toString();
}

class Reader {
  constructor(
    readonly text: string,
    public i = 0,
  ) {}
  peek(n = 0): string {
    return this.text[this.i + n] ?? "";
  }
  white(): void {
    while (this.peek() === " " || this.peek() === "\t") this.i++;
  }
  digits(): string {
    const m = /^\d+/.exec(this.text.slice(this.i));
    if (!m) return "";
    this.i += m[0].length;
    return m[0];
  }
  rest(): string {
    return this.text.slice(this.i);
  }
}

/** get_address(): one line specifier with its offsets, or undefined when there is none. */
function address(cm: CM, r: Reader, base: number): number | undefined {
  r.white();
  let lnum: number | undefined;
  const c = r.peek();
  if (c === ".") {
    r.i++;
    lnum = base;
  } else if (c === "$") {
    r.i++;
    lnum = lastLine(cm);
  } else if (c === "'") {
    r.i += 2;
    lnum = markLine(cm, r.text[r.i - 1] ?? "");
  } else if (c === "/" || c === "?") {
    // /pat1//pat2/ searches for pat2 from the line pat1 found.
    lnum = base;
    while (r.peek() === "/" || r.peek() === "?") {
      const d = r.peek();
      r.i++;
      const end = skipPattern(r.text, r.i, d);
      const pat = r.text.slice(r.i, end) || lastPattern();
      r.i = end < r.text.length ? end + 1 : end;
      lnum = searchLine(cm, pat, lnum, d === "/");
    }
  } else if (c === "\\" && "/?&".includes(r.peek(1))) {
    const k = r.peek(1);
    r.i += 2;
    const pat = k === "&" ? lastSubstitute().pattern : lastPattern();
    if (!pat) throw new ExError("E35: No previous regular expression");
    lnum = searchLine(cm, pat, base, k !== "?");
  } else if (/\d/.test(c)) {
    lnum = Number(r.digits()) - 1;
  }
  for (;;) {
    r.white();
    const o = r.peek();
    if (o !== "+" && o !== "-" && !/\d/.test(o)) break;
    if (lnum === undefined) lnum = base;
    let sign = "+";
    if (!/\d/.test(o)) {
      sign = o;
      r.i++;
    }
    const d = r.digits();
    const n = d === "" ? 1 : Number(d);
    lnum += sign === "+" ? n : -n;
  }
  return lnum;
}

/** parse_cmd_range(): `;` moves the cursor before the next address, as in vim. */
export function parseRange(cm: CM, r: Reader): ExRange {
  let line1 = cursorLine(cm);
  let line2 = line1;
  let count = 0;
  for (;;) {
    line1 = line2;
    line2 = cursorLine(cm);
    r.white();
    if (count === 0 && r.peek() === "%") {
      r.i++;
      line1 = 0;
      line2 = lastLine(cm);
      count = 2;
    } else {
      const l = address(cm, r, cursorLine(cm));
      if (l !== undefined) {
        line2 = l;
        count++;
      }
    }
    r.white();
    if (r.peek() === ";") {
      if (line2 < 0 || line2 > lastLine(cm)) throw new ExError("E16: Invalid range");
      cm.setCursor(line2, 0);
    } else if (r.peek() !== ",") break;
    r.i++;
  }
  if (count === 1) line1 = line2;
  return { line1, line2, count };
}

function checkRange(cm: CM, range: ExRange): void {
  if (
    range.line1 < 0 ||
    range.line2 < 0 ||
    range.line1 > lastLine(cm) ||
    range.line2 > lastLine(cm)
  ) {
    throw new ExError("E16: Invalid range");
  }
  if (range.line1 > range.line2) throw new ExError("E493: Backwards range given");
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

interface ShiftUnit {
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
        toLineStart(cm, dest === line2 ? line2 : line2);
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

let globalDepth = 0;

/** :g runs its command with the cursor on each marked line, in order, skipping lines deleted on the way. */
function global(cm: CM, cmd: ExCommand, invert: boolean): void {
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

/** Commands that end with beginline() defer it to the end of :g (global_need_beginline). */
let globalLineStart = false;
export function inGlobal(): boolean {
  return globalDepth > 0;
}
export function deferLineStart(): void {
  globalLineStart = true;
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
    } else if (
      /^s[^ubeimlnot]/.test(name) ||
      (name.length > 1 && name[0] === "s" && !findCommand(name) && /^s[gcieInp#lr&]+$/.test(name))
    ) {
      // :sg, :sc and friends are :s with flags; not supported, run as typed.
    }
  }
  let bang = false;
  if (r.peek() === "!" && name !== "") {
    bang = true;
    r.i++;
  }
  const arg = r.rest();
  const cmd: ExCommand = { range, name, bang, arg };
  if (name === "") return { def: undefined, cmd };
  const def = findCommand(name);
  return { def, cmd };
}

/** The first unescaped | ends a command (:help :bar). */
function splitBar(arg: string): [string, string | undefined] {
  for (let i = 0; i < arg.length; i++) {
    if (arg[i] === "\\" && arg[i + 1] === "|") i++;
    else if (arg[i] === "|") return [arg.slice(0, i), arg.slice(i + 1)];
  }
  return [arg, undefined];
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
