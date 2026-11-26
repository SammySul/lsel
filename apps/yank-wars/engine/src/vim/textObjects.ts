import { type CodeMirror as CM, CodeMirror, type MotionFn, type Pos } from "@replit/codemirror-vim";
import { replaceMotion } from "./lines.ts";

// Text objects and { } where the core differs from vim (:help a(, a", ap, {).

const P = (line: number, ch: number) => new CodeMirror.Pos(line, ch);
const before = (a: Pos, b: Pos) => a.line < b.line || (a.line === b.line && a.ch < b.ch);

/** findpar(): { and } stop on the count-th empty line; } at the end puts the cursor on the last character, inclusive. */
export const moveByParagraph: MotionFn = (cm, head, args) => {
  const dir = args.forward ? 1 : -1;
  const last = cm.lastLine();
  let curr = head.line;
  let count = args.repeat ?? 1;
  while (count-- > 0) {
    let didSkip = false;
    for (let first = true; ; first = false) {
      if (cm.getLine(curr) !== "") didSkip = true;
      if (!first && didSkip && cm.getLine(curr) === "") break;
      curr += dir;
      if (curr < 0 || curr > last) {
        if (count > 0) return null as unknown as Pos;
        curr -= dir;
        break;
      }
    }
  }
  if (curr === last && dir === 1) {
    const len = cm.getLine(curr).length;
    if (len > 0) {
      args.inclusive = true;
      return P(curr, len - 1);
    }
  }
  return P(curr, 0);
};

/** The unmatched open bracket at or before pos (count levels out), and its match; undefined when there is none. */
function findBlock(
  cm: CM,
  pos: Pos,
  open: string,
  close: string,
  count: number,
): [Pos, Pos] | undefined {
  const doc = cm.getValue();
  let at = cm.indexFromPos(pos);
  let start = -1;
  for (let level = 0; level < count; level++) {
    let depth = 0;
    let i = at;
    if (level === 0 && doc[i] === close) i--;
    else if (level === 0 && doc[i] === open) {
      start = i;
      at = i - 1;
      continue;
    } else if (level > 0) i = at;
    for (; i >= 0; i--) {
      const c = doc[i];
      if (c === close) depth++;
      else if (c === open) {
        if (depth === 0) break;
        depth--;
      }
    }
    if (i < 0) return undefined;
    start = i;
    at = i - 1;
  }
  let depth = 0;
  for (let j = start + 1; j < doc.length; j++) {
    const c = doc[j];
    if (c === open) depth++;
    else if (c === close) {
      if (depth === 0) return [cm.posFromIndex(start), cm.posFromIndex(j)];
      depth--;
    }
  }
  return undefined;
}

export interface ObjectRange {
  start: Pos;
  end: Pos;
  linewise: boolean;
}

/** current_block(): with i, a ( ending its line and a ) after only blanks leave both lines out, linewise. */
export function blockObject(
  cm: CM,
  head: Pos,
  open: string,
  close: string,
  inner: boolean,
  count: number,
): ObjectRange | undefined {
  let found = findBlock(cm, head, open, close, count);
  if (!found && count === 1) {
    // Not inside a block: vim takes the next one that opens later on the line.
    const doc = cm.getValue();
    const at = doc.indexOf(open, cm.indexFromPos(head));
    if (at !== -1) found = findBlock(cm, cm.posFromIndex(at), open, close, 1);
  }
  if (!found) return undefined;
  const [o, c] = found;
  if (!inner) return { start: o, end: P(c.line, c.ch + 1), linewise: false };
  const openEndsLine = o.ch + 1 >= cm.getLine(o.line).length;
  const closeAfterBlanks = /^[ \t]*$/.test(cm.getLine(c.line).slice(0, c.ch));
  if (openEndsLine && closeAfterBlanks && c.line > o.line) {
    if (c.line - o.line < 2) return { start: P(c.line, 0), end: P(c.line, 0), linewise: false };
    return { start: P(o.line + 1, 0), end: P(c.line - 1, 0), linewise: true };
  }
  const start = openEndsLine && c.line > o.line ? P(o.line + 1, 0) : P(o.line, o.ch + 1);
  const end =
    closeAfterBlanks && c.line > o.line ? P(c.line - 1, cm.getLine(c.line - 1).length) : c;
  if (before(end, start)) return { start, end: start, linewise: false };
  return { start, end, linewise: false };
}

/** current_quote(): pairs counted from the line start, backslash escapes skipped; a" takes white space after, else before. */
export function quoteObject(
  cm: CM,
  head: Pos,
  q: string,
  inner: boolean,
  count: number,
): ObjectRange | undefined {
  const line = cm.getLine(head.line);
  const isQuote = (i: number) => {
    if (line[i] !== q) return false;
    let n = 0;
    for (let k = i - 1; k >= 0 && line[k] === "\\"; k--) n++;
    return n % 2 === 0;
  };
  const quotes: number[] = [];
  for (let i = 0; i < line.length; i++) if (isQuote(i)) quotes.push(i);
  const col = head.ch;
  let open: number | undefined;
  let close: number | undefined;
  if (isQuote(col)) {
    const idx = quotes.indexOf(col);
    if (idx % 2 === 0) {
      open = col;
      close = quotes[idx + 1];
    } else {
      open = quotes[idx - 1];
      close = col;
    }
  } else {
    const prev = [...quotes].reverse().find((i) => i < col);
    if (prev === undefined) {
      open = quotes.find((i) => i > col);
      close = open === undefined ? undefined : quotes.find((i) => i > (open as number));
    } else {
      open = prev;
      close = quotes.find((i) => i > col);
    }
  }
  if (open === undefined || close === undefined) return undefined;
  let a = open;
  let b = close + 1;
  if (inner && count < 2) {
    a = open + 1;
    b = close;
  } else if (!inner) {
    if (line[b] === " " || line[b] === "\t") while (line[b] === " " || line[b] === "\t") b++;
    else while (a > 0 && (line[a - 1] === " " || line[a - 1] === "\t")) a--;
  }
  return { start: P(head.line, a), end: P(head.line, b), linewise: false };
}

interface TagPair {
  openStart: number;
  openEnd: number;
  closeStart: number;
  closeEnd: number;
}

function tagPairs(doc: string): TagPair[] {
  const re = /<(\/?)([A-Za-z][^\s>/]*)[^>]*?(\/?)>/g;
  const stack: { name: string; start: number; end: number }[] = [];
  const pairs: TagPair[] = [];
  for (let m = re.exec(doc); m; m = re.exec(doc)) {
    const [all, slash, name, selfClose] = m as unknown as [string, string, string, string];
    if (selfClose) continue;
    if (!slash) {
      stack.push({ name, start: m.index, end: m.index + all.length });
      continue;
    }
    for (let i = stack.length - 1; i >= 0; i--) {
      const o = stack[i] as { name: string; start: number; end: number };
      if (o.name.toLowerCase() !== name.toLowerCase()) continue;
      stack.length = i;
      pairs.push({
        openStart: o.start,
        openEnd: o.end,
        closeStart: m.index,
        closeEnd: m.index + all.length,
      });
      break;
    }
  }
  return pairs;
}

/** current_tagblock() without a syntax tree: on a start tag it means that tag's block, on an end tag likewise. */
export function tagObject(
  cm: CM,
  head: Pos,
  inner: boolean,
  count: number,
): ObjectRange | undefined {
  const doc = cm.getValue();
  let pos = cm.indexFromPos(head);
  const line = cm.getLine(head.line);
  if (/^[ \t]*$/.test(line.slice(0, head.ch + 1))) {
    const skip = /^[ \t]*/.exec(line.slice(head.ch))?.[0].length ?? 0;
    pos += skip;
  }
  const pairs = tagPairs(doc);
  for (const p of pairs) {
    if (pos >= p.openStart && pos < p.openEnd) pos = p.openEnd - 1;
    else if (pos >= p.closeStart && pos < p.closeEnd) pos = p.closeStart - 1;
  }
  const around = pairs
    .filter((p) => p.openStart <= pos && pos < p.closeEnd)
    .sort((a, b) => b.openStart - a.openStart);
  const p = around[count - 1];
  if (p === undefined) return undefined;
  const [a, b] = inner ? [p.openEnd, p.closeStart] : [p.openStart, p.closeEnd];
  return { start: cm.posFromIndex(a), end: cm.posFromIndex(b), linewise: false };
}

export function installTextObjects(): void {
  replaceMotion("moveByParagraph", moveByParagraph);

  // i( a( and friends with counts and vim's line rules, quote objects as current_quote(); visual mode stays the core's.
  const PAIRS: Readonly<Record<string, readonly [string, string]>> = {
    "(": ["(", ")"],
    ")": ["(", ")"],
    b: ["(", ")"],
    "{": ["{", "}"],
    "}": ["{", "}"],
    B: ["{", "}"],
    "[": ["[", "]"],
    "]": ["[", "]"],
    "<": ["<", ">"],
    ">": ["<", ">"],
  };
  const coreObject = replaceMotion(
    "textObjectManipulation",
    function (this: unknown, cm, head, args, vim, is) {
      const c = (args as { selectedCharacter?: string }).selectedCharacter ?? "";
      const inner = !!(args as { textObjectInner?: boolean }).textObjectInner;
      const count = args.repeat ?? 1;
      if (vim.visualMode) return coreObject.call(this, cm, head, args, vim, is);
      let r: ObjectRange | undefined;
      const pair = PAIRS[c];
      if (pair) r = blockObject(cm, head, pair[0], pair[1], inner, count);
      else if (c === '"' || c === "'" || c === "`") r = quoteObject(cm, head, c, inner, count);
      else if (c === "t") r = tagObject(cm, head, inner, count);
      else return coreObject.call(this, cm, head, args, vim, is);
      if (r === undefined) return null as unknown as Pos;
      if (r.linewise) {
        args.linewise = true;
        const opArgs = vim.inputState.operatorArgs as { linewise?: boolean } | undefined;
        if (opArgs) opArgs.linewise = true;
      }
      return [r.start, r.end] as unknown as Pos;
    },
  );
}
