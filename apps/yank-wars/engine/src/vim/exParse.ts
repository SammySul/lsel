// Reading an ex line as vim does (:help cmdline-ranges): patterns, addresses, ranges and the | that ends a command.

import { type CodeMirror as CM, Vim } from "@replit/codemirror-vim";
import { registers } from "./lines.ts";
import { lastSubstitute } from "./substitute.ts";
import { vimRegExp } from "./vimRegex.ts";

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

export const lastLine = (cm: CM) => cm.lastLine();
export const cursorLine = (cm: CM) => cm.getCursor().line;

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

export function lastPattern(): string {
  return registers().getRegister("/").toString();
}

export class Reader {
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

export function checkRange(cm: CM, range: ExRange): void {
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

/** The first unescaped | ends a command (:help :bar). */
export function splitBar(arg: string): [string, string | undefined] {
  for (let i = 0; i < arg.length; i++) {
    if (arg[i] === "\\" && arg[i + 1] === "|") i++;
    else if (arg[i] === "|") return [arg.slice(0, i), arg.slice(i + 1)];
  }
  return [arg, undefined];
}
