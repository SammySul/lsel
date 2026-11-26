// / ? n N * # with vim's rules: a match is found by where it starts (or ends, for an e offset), with 'wrapscan',
// and the search offset (:help search-offset) is remembered for n and N.

import {
  type CodeMirror as CM,
  CodeMirror,
  type MotionFn,
  type Pos,
  Vim,
} from "@replit/codemirror-vim";
import { skipPattern } from "./exParse.ts";
import { registers } from "./lines.ts";

interface Offset {
  kind: "none" | "line" | "e" | "s";
  n: number;
}

const NONE: Offset = { kind: "none", n: 0 };
let lastOffset: Offset = NONE;
/** the query the offset belongs to: * and :s set a new one without an offset */
let offsetQuery: RegExp | undefined;
/** ;/pat/ after a search: the next search, run right after the first */
let pendingChain: { forward: boolean; pattern: string; offset: Offset } | undefined;

export function resetSearch(): void {
  lastOffset = NONE;
  offsetQuery = undefined;
  pendingChain = undefined;
}

function parseOffset(text: string): { offset: Offset; rest: string } {
  const m = /^([esb]?)([+-]?)(\d*)/.exec(text) as RegExpExecArray;
  const [all, kind, sign, digits] = [m[0], m[1] ?? "", m[2] ?? "", m[3] ?? ""];
  let n = digits === "" ? (sign === "" ? 0 : 1) : Number(digits);
  if (sign === "-") n = -n;
  const offset: Offset =
    kind === "e"
      ? { kind: "e", n }
      : kind !== ""
        ? { kind: "s", n }
        : all === ""
          ? NONE
          : { kind: "line", n };
  return { offset, rest: text.slice(all.length) };
}

/** A typed /pat/off or ?pat?off: the pattern for the core, the offset (and any ;-chained search) for us. */
export function takeSearchLine(prefix: string, value: string): string {
  const end = skipPattern(value, 0, prefix);
  let pattern = value.slice(0, end);
  if (end >= value.length) {
    lastOffset = NONE;
    pendingChain = undefined;
  } else {
    const { offset, rest } = parseOffset(value.slice(end + 1));
    lastOffset = offset;
    pendingChain = undefined;
    const chain = /^;([/?])(.*)$/s.exec(rest);
    if (chain) {
      const d = chain[1] as string;
      const body = chain[2] as string;
      const e = skipPattern(body, 0, d);
      pendingChain = {
        forward: d === "/",
        pattern: body.slice(0, e),
        offset: e >= body.length ? NONE : parseOffset(body.slice(e + 1)).offset,
      };
    }
  }
  // The core splits at an unescaped / (vim.js:5246); in a ? search a / is an ordinary character.
  if (prefix === "?")
    pattern = pattern.replace(/(^|[^\\])((?:\\\\)*)\//g, "$1$2\\/").replace(/\\\?/g, "?");
  offsetQuery = undefined;
  return pattern;
}

interface Found {
  from: number;
  to: number;
}

function allMatches(doc: string, query: RegExp): Found[] {
  const re = new RegExp(query.source, query.flags.includes("g") ? query.flags : `${query.flags}g`);
  const out: Found[] = [];
  for (let at = 0; at <= doc.length; ) {
    re.lastIndex = at;
    const m = re.exec(doc);
    if (!m) break;
    out.push({ from: m.index, to: m.index + m[0].length });
    at = m[0].length === 0 ? m.index + 1 : m.index + m[0].length;
  }
  return out;
}

/** searchit(): the count-th match after (or before) pos, wrapping around; e compares match ends. */
function search(
  cm: CM,
  query: RegExp,
  forward: boolean,
  count: number,
  offset: Offset,
): Pos | null {
  const doc = cm.getValue();
  const matches = allMatches(doc, query);
  if (matches.length === 0) return null;
  const ref = (m: Found) => (offset.kind === "e" ? Math.max(m.from, m.to - 1) : m.from);
  let pos = cm.indexFromPos(cm.getCursor());
  // A character offset is taken off first, so /pat/s-1 and ?pat?e+1 do not find the same match again.
  if (offset.kind === "e" || offset.kind === "s") pos -= offset.n;
  let found: Found | undefined;
  for (let i = 0; i < count; i++) {
    found = forward
      ? matches.find((m) => ref(m) > pos)
      : [...matches].reverse().find((m) => ref(m) < pos);
    found ??= forward ? matches[0] : matches[matches.length - 1];
    if (found === undefined) return null;
    pos = ref(found);
  }
  if (found === undefined) return null;
  if (offset.kind === "line") {
    const line = cm.posFromIndex(found.from).line + offset.n;
    return new CodeMirror.Pos(Math.max(0, Math.min(cm.lastLine(), line)), 0);
  }
  const base = offset.kind === "e" ? Math.max(found.from, found.to - 1) : found.from;
  return cm.posFromIndex(Math.max(0, Math.min(doc.length, base + offset.n)));
}

export function installSearch(define: (name: string, fn: MotionFn) => MotionFn): void {
  define("findNext", (cm, _head, args) => {
    const state = Vim.getVimGlobalState_();
    const query = state.query as RegExp | undefined;
    if (!query) return undefined;
    if (offsetQuery === undefined) offsetQuery = query;
    else if (offsetQuery !== query) lastOffset = NONE;
    const forward = state.isReversed ? !args.forward : !!args.forward;
    let offset = lastOffset;
    let pos = search(cm, query, forward, args.repeat || 1, offset);
    const chain = pendingChain;
    pendingChain = undefined;
    if (pos && chain) {
      const was = cm.getCursor();
      cm.setCursor(pos);
      registers().getRegister("/").setText(chain.pattern);
      const next = (
        Vim as unknown as { vimRegExp: (p: string, i: boolean, s: boolean) => RegExp }
      ).vimRegExp(chain.pattern, true, true);
      state.query = next;
      state.isReversed = !chain.forward;
      lastOffset = chain.offset;
      offsetQuery = next;
      offset = chain.offset;
      pos = search(cm, next, true, 1, offset);
      cm.setCursor(was);
    }
    if (!pos) return undefined;
    if (offset.kind === "line") args.linewise = true;
    else if (offset.kind === "e") args.inclusive = true;
    return pos;
  });
}
