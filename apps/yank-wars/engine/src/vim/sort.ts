import { type CodeMirror as CM, CodeMirror } from "@replit/codemirror-vim";
import { type ExCommand, ExError, skipPattern } from "./ex.ts";
import { registers, toLineStart } from "./lines.ts";
import { vimRegExp } from "./vimRegex.ts";

// :help :sort, following ex_sort(): a stable sort (equal keys keep their order), so every JS engine agrees.

interface Key {
  line: string;
  index: number;
  text: string;
  isNumber: boolean;
  value: number;
}

function numberKey(
  text: string,
  kind: "n" | "x" | "o" | "b" | "f",
): { isNumber: boolean; value: number } {
  if (kind === "f") {
    const m = /[-+]?(?:\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?|inf(?:inity)?|nan)/i.exec(
      text,
    );
    return m ? { isNumber: true, value: Number.parseFloat(m[0]) } : { isNumber: false, value: 0 };
  }
  const digit =
    kind === "x" ? /[0-9a-fA-F]/ : kind === "o" ? /[0-7]/ : kind === "b" ? /[01]/ : /[0-9]/;
  const at = text.search(digit);
  if (at === -1) return { isNumber: false, value: 0 };
  const neg = at > 0 && text[at - 1] === "-";
  const rest = text.slice(at);
  let value: number;
  if (kind === "x") value = Number.parseInt(/^(?:0[xX])?([0-9a-fA-F]+)/.exec(rest)?.[1] ?? "0", 16);
  else if (kind === "b") value = Number.parseInt(/^(?:0[bB])?([01]+)/.exec(rest)?.[1] ?? "0", 2);
  else if (kind === "o") value = Number.parseInt(/^[0-7]+/.exec(rest)?.[0] ?? "0", 8);
  else value = Number.parseInt(/^\d+/.exec(rest)?.[0] ?? "0", 10);
  return { isNumber: true, value: neg ? -value : value };
}

export function exSort(cm: CM, cmd: ExCommand): void {
  const arg = cmd.arg;
  let ignoreCase = false;
  let unique = false;
  let useMatch = false;
  let kind: "n" | "x" | "o" | "b" | "f" | undefined;
  let pattern: string | undefined;
  for (let i = 0; i < arg.length; ) {
    const c = arg[i] as string;
    if (c === " " || c === "\t") i++;
    else if (c === "i") {
      ignoreCase = true;
      i++;
    } else if (c === "u") {
      unique = true;
      i++;
    } else if (c === "r") {
      useMatch = true;
      i++;
    } else if ("nxobf".includes(c)) {
      if (kind !== undefined && kind !== c) throw new ExError("E474: Invalid argument");
      kind = c as typeof kind;
      i++;
    } else if (!/[A-Za-z0-9\\"|]/.test(c)) {
      const end = skipPattern(arg, i + 1, c);
      pattern = arg.slice(i + 1, end);
      if (pattern === "") pattern = registers().getRegister("/").toString();
      i = end + 1;
    } else throw new ExError(`E474: Invalid argument: ${arg.slice(i)}`);
  }
  const { line1, line2 } = cmd.range;
  if (line1 < 0 || line2 > cm.lastLine() || line1 > line2) throw new ExError("E16: Invalid range");
  const re = pattern === undefined ? undefined : vimRegExp(pattern, "");
  const keys: Key[] = [];
  for (let l = line1; l <= line2; l++) {
    const line = cm.getLine(l);
    let text = line;
    if (re !== undefined) {
      const m = re.exec(line);
      // A line without a match sorts on an empty key (end_col = 0).
      text = m ? (useMatch ? m[0] : line.slice(m.index + m[0].length)) : "";
    }
    const num = kind === undefined ? { isNumber: false, value: 0 } : numberKey(text, kind);
    keys.push({ line, index: l, text, ...num });
  }
  const cmp = (a: Key, b: Key): number => {
    let r = 0;
    if (kind !== undefined) {
      if (a.isNumber !== b.isNumber) r = a.isNumber ? 1 : -1;
      else r = a.value === b.value ? 0 : a.value > b.value ? 1 : -1;
    } else {
      const x = ignoreCase ? a.text.toLowerCase() : a.text;
      const y = ignoreCase ? b.text.toLowerCase() : b.text;
      r = x === y ? 0 : x > y ? 1 : -1;
    }
    return r === 0 ? a.index - b.index : r;
  };
  const sorted = [...keys].sort(cmp);
  if (cmd.bang) sorted.reverse();
  const out: string[] = [];
  let prev: Key | undefined;
  for (const k of sorted) {
    // u compares whole lines, whatever the sort key was.
    if (unique && prev !== undefined) {
      const same = ignoreCase
        ? prev.line.toLowerCase() === k.line.toLowerCase()
        : prev.line === k.line;
      if (same) continue;
    }
    out.push(k.line);
    prev = k;
  }
  const text = out.join("\n");
  const from = new CodeMirror.Pos(line1, 0);
  const to = new CodeMirror.Pos(line2, cm.getLine(line2).length);
  if (cm.getRange(from, to) !== text) cm.replaceRange(text, from, to);
  toLineStart(cm, line1);
}
