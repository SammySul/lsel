import { type CodeMirror as CM, Vim } from "@replit/codemirror-vim";
import { deferLineStart, type ExCommand, ExError, inGlobal, skipPattern } from "./ex.ts";
import { evalExpr } from "./expr.ts";
import { registers, toLineStart } from "./lines.ts";
import { setLastReplacement, vimRegExp } from "./vimRegex.ts";

// :help :substitute, following do_sub() in vim's ex_cmds.c.

interface SubState {
  pattern: string;
  /** after ~ expansion (regtilde), what the next ~ stands for */
  replacement: string | undefined;
  flags: Flags;
}

interface Flags {
  global: boolean;
  confirm: boolean;
  noError: boolean;
  countOnly: boolean;
  ignoreCase: boolean | undefined;
}

const noFlags = (): Flags => ({
  global: false,
  confirm: false,
  noError: false,
  countOnly: false,
  ignoreCase: undefined,
});

let last: SubState = { pattern: "", replacement: undefined, flags: noFlags() };

export function lastSubstitute(): SubState {
  return last;
}

export function resetSubstitute(): void {
  last = { pattern: "", replacement: undefined, flags: noFlags() };
}

/** regtilde(): ~ is the previous replacement, \~ a literal ~. */
function expandTilde(rep: string): string {
  let out = "";
  for (let i = 0; i < rep.length; i++) {
    const c = rep[i] as string;
    if (c === "\\" && i + 1 < rep.length) {
      out += c + rep[i + 1];
      i++;
    } else if (c === "~") out += last.replacement ?? "";
    else out += c;
  }
  return out;
}

type CaseFn = ((c: string) => string) | undefined;
const upper = (c: string) => c.toUpperCase();
const lower = (c: string) => c.toLowerCase();

/** vim_regsub() in magic mode: & and \0-\9, \u \U \l \L \e \E, \r a line break, \n a NUL, \x the character x. */
export function expandReplacement(rep: string, m: RegExpExecArray): string {
  let out = "";
  let one: CaseFn;
  let all: CaseFn;
  const emit = (text: string) => {
    for (const ch of text) {
      if (one) {
        out += one(ch);
        one = undefined;
      } else out += all ? all(ch) : ch;
    }
  };
  for (let i = 0; i < rep.length; i++) {
    const c = rep[i] as string;
    if (c === "&") {
      emit(m[0]);
      continue;
    }
    if (c === "\r") {
      out += "\n";
      continue;
    }
    if (c !== "\\" || i + 1 >= rep.length) {
      emit(c);
      continue;
    }
    const n = rep[++i] as string;
    if (/[0-9]/.test(n)) emit(m[Number(n)] ?? "");
    else if (n === "u") one = upper;
    else if (n === "l") one = lower;
    else if (n === "U") all = upper;
    else if (n === "L") all = lower;
    else if (n === "e" || n === "E") {
      all = undefined;
      one = undefined;
    } else if (n === "r") out += "\n";
    else if (n === "n") out += "\u0000";
    else if (n === "t") emit("\t");
    else if (n === "b") emit("\u0008");
    else if (n === "\r") out += "\r";
    else emit(n);
  }
  return out;
}

interface Parsed {
  pattern: string | undefined;
  replacement: string | undefined;
  flagsText: string;
  count: string;
  rest: string;
}

function parseFlagsAndCount(text: string): { flagsText: string; count: string; rest: string } {
  const m = /^(&?[cegiInp#lr]*)\s*(\d*)\s*(.*)$/s.exec(text);
  if (!m) return { flagsText: "", count: "", rest: text };
  return { flagsText: m[1] ?? "", count: m[2] ?? "", rest: m[3] ?? "" };
}

function parseSubstitute(arg: string): Parsed {
  const delim = arg[0];
  if (delim === undefined || /[\sA-Za-z0-9\\"|]/.test(delim)) {
    return { pattern: undefined, replacement: undefined, ...parseFlagsAndCount(arg.trimStart()) };
  }
  const patEnd = skipPattern(arg, 1, delim);
  const pattern = arg.slice(1, patEnd);
  if (patEnd >= arg.length) return { pattern, replacement: "", flagsText: "", count: "", rest: "" };
  let i = patEnd + 1;
  let replacement = "";
  while (i < arg.length && arg[i] !== delim) {
    if (arg[i] === "\\" && i + 1 < arg.length) {
      // An escaped delimiter is the delimiter itself.
      replacement += arg[i + 1] === delim ? delim : arg.slice(i, i + 2);
      i += 2;
    } else replacement += arg[i++];
  }
  if (i >= arg.length) return { pattern, replacement, flagsText: "", count: "", rest: "" };
  return { pattern, replacement, ...parseFlagsAndCount(arg.slice(i + 1)) };
}

/** \= is an expression (:help sub-replace-expression); its line breaks stay line breaks. */
function replace(rep: string, m: RegExpExecArray, line: number, col: number): string {
  if (!rep.startsWith("\\=")) return expandReplacement(rep, m);
  try {
    return evalExpr(rep.slice(2), {
      submatch: (n) => m[n] ?? "",
      line: (which) => (which === "." ? line + 1 : 0),
      col: (which) => (which === "." ? col + 1 : 0),
    }).replaceAll("\r", "\n");
  } catch (e) {
    throw new ExError((e as Error).message);
  }
}

interface Match {
  from: number;
  to: number;
  text: string;
}

const isMultiline = (source: string) => /\\n|\[\\s\\S\]|\\n\]|\[\^/.test(source);

/** The matches do_sub() would replace on lines line1..line2 of doc (with a virtual last newline). */
function findMatches(
  doc: string,
  re: RegExp,
  multiline: boolean,
  line1: number,
  line2: number,
  global: boolean,
  rep: string,
): Match[] {
  const starts = [0];
  for (let i = 0; i < doc.length; i++) if (doc[i] === "\n") starts.push(i + 1);
  const out: Match[] = [];
  let consumed = 0;
  for (let l = line1; l <= line2; l++) {
    const spanStart = starts[l] as number;
    const eol = (starts[l + 1] ?? doc.length + 1) - 1;
    if (consumed > eol) continue;
    let col = Math.max(spanStart, consumed);
    let prevEnd = -1;
    for (;;) {
      re.lastIndex = col;
      const m = re.exec(doc);
      if (!m || m.index > eol) break;
      const end = m.index + m[0].length;
      if (m[0].length === 0 && m.index === prevEnd) {
        if (m.index >= eol) break;
        col = m.index + 1;
        if (col >= eol && !multiline) break;
        continue;
      }
      out.push({ from: m.index, to: end, text: replace(rep, m, l, m.index - spanStart) });
      consumed = Math.max(consumed, end);
      prevEnd = end;
      if (!global || (end >= eol && !multiline)) break;
      col = end;
      if (end > eol) break;
    }
  }
  return out;
}

function apply(cm: CM, doc: string, matches: readonly Match[]): number {
  const realLength = doc.length - 1;
  let out = "";
  let at = 0;
  let lastEnd = 0;
  for (const m of matches) {
    out += doc.slice(at, m.from) + m.text;
    at = m.to;
    lastEnd = out.length;
  }
  out += doc.slice(at);
  // The virtual last newline survives unless a match took it.
  if (at <= realLength) out = out.slice(0, -1);
  const old = doc.slice(0, realLength);
  let pre = 0;
  while (pre < old.length && pre < out.length && old[pre] === out[pre]) pre++;
  let suf = 0;
  while (
    suf < old.length - pre &&
    suf < out.length - pre &&
    old[old.length - 1 - suf] === out[out.length - 1 - suf]
  )
    suf++;
  cm.replaceRange(
    out.slice(pre, out.length - suf),
    cm.posFromIndex(pre),
    cm.posFromIndex(old.length - suf),
  );
  return out.slice(0, lastEnd).split("\n").length - 1;
}

export function substitute(cm: CM, cmd: ExCommand, kind: "s" | "&" | "~"): string | undefined {
  let p: Parsed;
  if (kind === "s") p = parseSubstitute(cmd.arg);
  else
    p = { pattern: undefined, replacement: undefined, ...parseFlagsAndCount(cmd.arg.trimStart()) };
  if (p.rest !== "" && !p.rest.startsWith("|"))
    throw new ExError(`E488: Trailing characters: ${p.rest}`);
  const next = p.rest.startsWith("|") ? p.rest.slice(1) : undefined;

  let flags = noFlags();
  let flagsText = p.flagsText;
  if (flagsText.startsWith("&")) {
    flags = { ...last.flags };
    flagsText = flagsText.slice(1);
  }
  let useSearch = kind === "~";
  for (const f of flagsText) {
    if (f === "g") flags.global = !flags.global;
    else if (f === "c") flags.confirm = true;
    else if (f === "e") flags.noError = true;
    else if (f === "n") flags.countOnly = true;
    else if (f === "i") flags.ignoreCase = true;
    else if (f === "I") flags.ignoreCase = false;
    else if (f === "r") useSearch = true;
  }

  let pattern: string;
  let replacement: string;
  if (p.pattern === undefined) {
    // :s, :& and :~ repeat the last substitute (with the last search pattern for :~ and the r flag).
    if (last.replacement === undefined) throw new ExError("E35: No previous regular expression");
    pattern = useSearch ? registers().getRegister("/").toString() : last.pattern;
    replacement = last.replacement;
  } else {
    pattern = p.pattern === "" ? registers().getRegister("/").toString() : p.pattern;
    if (pattern === "") throw new ExError("E35: No previous regular expression");
    replacement = expandTilde(p.replacement ?? "");
  }
  if (p.pattern === undefined) last = { ...last, flags };

  const range = { ...cmd.range };
  if (p.count !== "") {
    const n = Number(p.count);
    if (n === 0) throw new ExError("E939: Positive count required");
    range.line1 = range.line2;
    range.line2 = Math.min(cm.lastLine(), range.line2 + n - 1);
  }
  if (range.line1 < 0 || range.line2 > cm.lastLine() || range.line1 > range.line2) {
    throw new ExError("E16: Invalid range");
  }

  // ~ in the pattern is the previous replacement, so the regex is built before this one becomes it.
  const re = vimRegExp(pattern, "gm", flags.ignoreCase ?? true, flags.ignoreCase === undefined);
  Vim.getVimGlobalState_().query = vimRegExp(pattern, "m");
  if (p.pattern !== undefined) {
    setLastReplacement(replacement);
    last = { pattern, replacement, flags };
    registers().getRegister("/").setText(pattern);
  }
  const doc = `${cm.getValue()}\n`;
  const matches = findMatches(
    doc,
    re,
    isMultiline(re.source),
    range.line1,
    range.line2,
    flags.global,
    replacement,
  );
  if (matches.length === 0) {
    if (flags.noError) return next;
    throw new ExError(`E486: Pattern not found: ${pattern}`);
  }
  if (flags.countOnly) return next;
  if (flags.confirm) {
    confirmEach(cm, doc, matches);
    return next;
  }
  finish(cm, apply(cm, doc, matches));
  return next;
}

function finish(cm: CM, line: number): void {
  if (inGlobal()) {
    cm.setCursor(line, 0);
    deferLineStart();
  } else toLineStart(cm, line);
}

/** The c flag: y n a q l and <Esc> per match, as do_sub()'s prompt, each answer applied at once; other keys are swallowed. */
function confirmEach(cm: CM, doc: string, matches: readonly Match[]): void {
  const realLength = doc.length - 1;
  let delta = 0;
  let i = 0;
  let lastLine = 0;
  const at = (m: Match) => cm.posFromIndex(Math.min(m.from + delta, cm.getValue().length));
  const put = (m: Match) => {
    const from = Math.min(m.from + delta, realLength + delta);
    const to = Math.min(m.to + delta, realLength + delta);
    cm.replaceRange(m.text, cm.posFromIndex(from), cm.posFromIndex(to));
    lastLine = cm.posFromIndex(from + m.text.length).line;
    delta += m.text.length - (Math.min(m.to, realLength) - Math.min(m.from, realLength));
  };
  // q leaves the cursor on the match asked about; otherwise it ends in column 0 of the last one asked.
  const done = (close: () => void, quit: boolean) => {
    close();
    const m = matches[Math.min(i, matches.length - 1)] as Match;
    const pos = at(m);
    cm.setCursor(quit ? pos : { line: pos.line, ch: 0 });
  };
  cm.setCursor(at(matches[0] as Match));
  const template = document.createElement("span");
  template.textContent = "replace with ... (y/n/a/q/l/^E/^Y)?";
  cm.openDialog(template, () => {}, {
    onKeyDown(e: { key: string; ctrlKey: boolean }, _v: string, close: () => void) {
      const key = e.ctrlKey ? `C-${e.key}` : e.key;
      const m = matches[i] as Match;
      if (key === "y" || key === "l") {
        put(m);
        if (key === "l" || i + 1 >= matches.length) done(close, false);
        else {
          i++;
          cm.setCursor(at(matches[i] as Match));
        }
      } else if (key === "n") {
        if (i + 1 >= matches.length) done(close, false);
        else {
          i++;
          cm.setCursor(at(matches[i] as Match));
        }
      } else if (key === "a") {
        for (; i < matches.length; i++) put(matches[i] as Match);
        close();
        finish(cm, lastLine);
      } else if (key === "q" || key === "Escape" || key === "C-c" || key === "C-[")
        done(close, true);
      return true;
    },
  } as unknown as Parameters<CM["openDialog"]>[2]);
}
