// vim's regex dialect (:help pattern) translated to a JavaScript source valid under the "u" flag, as CM's RegExpCursor uses.

import {
  CLASSES,
  collection,
  hasCase,
  KEYWORD,
  numberEscape,
  otherCase,
  renderClass,
  SIMPLE_ESCAPES,
} from "./vimRegexClass.ts";

export class VimRegexError extends Error {}

export interface VimRegex {
  /** case folding is written into the source (literal a is [aA]), so \u and [:upper:] stay case-sensitive as in vim */
  source: string;
  ignoreCase: boolean;
  /** smartcase's test (pat_has_uppercase): an upper-case letter that is not part of an escape */
  hasUpper: boolean;
}

export interface CaseOptions {
  ignoreCase?: boolean;
  smartCase?: boolean;
  lastReplacement?: string;
}

/** \c or \C anywhere in the pattern (the last one wins), outside collections. */
function forcedCase(p: readonly string[]): boolean | undefined {
  let out: boolean | undefined;
  for (let i = 0; i < p.length; i++) {
    if (p[i] !== "\\") continue;
    const n = p[i + 1];
    if (n === "c") out = true;
    else if (n === "C") out = false;
    i++;
  }
  return out;
}

type Mode = "v" | "m" | "M" | "V";

const WORD_START = `(?<![${KEYWORD}])(?=[${KEYWORD}])`;
const WORD_END = `(?<=[${KEYWORD}])(?![${KEYWORD}])`;

// Characters that are special without a backslash in each mode (:help /magic); the rest need one.
const BARE_SPECIAL: Readonly<Record<Mode, string>> = {
  v: "()|+?={@%<>.*[~^$&",
  m: ".*[~^$",
  M: "^$",
  V: "",
};
const ESCAPED_SPECIAL: Readonly<Record<Mode, string>> = {
  v: "",
  m: "()|+?={@%<>&",
  M: ".*[~()|+?={@%<>&",
  V: ".*[~^$()|+?={@%<>&",
};

const JS_SYNTAX = "^$\\.*+?()[]{}|/";
const lit = (c: string) => (JS_SYNTAX.includes(c) ? `\\${c}` : c);
/** pat_has_uppercase(): escapes (\S, \_X, \%X) do not count; in \v neither do %X and _X. */
export function hasUppercase(pattern: string): boolean {
  let veryMagic = false;
  const p = [...pattern];
  for (let i = 0; i < p.length; ) {
    const c = p[i] as string;
    const n = p[i + 1];
    if (c === "\\") {
      if (n === "v" || n === "m" || n === "M" || n === "V") veryMagic = n === "v";
      if ((n === "_" || n === "%") && p[i + 2] !== undefined) i += 3;
      else i += n === undefined ? 1 : 2;
    } else if ((c === "%" || c === "_") && veryMagic) i += 2;
    else if (c !== c.toLowerCase() && c === c.toUpperCase()) return true;
    else i++;
  }
  return false;
}

interface Level {
  items: string[];
  /** indices of items that already carry a multi */
  multi: Set<number>;
  /** the index in items after which ^ is still an anchor and * still literal */
  start: number;
  capture: "(" | "(?:" | null;
}

const level = (capture: Level["capture"]): Level => ({
  items: [],
  multi: new Set(),
  start: 0,
  capture,
});

// A marker item for \zs and \ze, resolved once the whole pattern is read.
const EDGE = "\u0000";

class Translator {
  readonly p: string[];
  i = 0;
  mode: Mode = "m";
  readonly stack: Level[] = [level(null)];

  constructor(
    pattern: string,
    readonly ic: boolean,
    readonly lastReplacement: string,
  ) {
    this.p = [...pattern];
  }

  get top(): Level {
    return this.stack[this.stack.length - 1] as Level;
  }

  atStart(): boolean {
    return this.top.items.length === this.top.start;
  }

  push(atom: string): void {
    this.top.items.push(atom);
  }

  fold(c: string): string {
    return this.ic && hasCase(c) && [...otherCase(c)].length === 1
      ? `[${c}${otherCase(c)}]`
      : lit(c);
  }

  translate(): string[] {
    const p = this.p;
    while (this.i < p.length) {
      const c = p[this.i] as string;
      const n = p[this.i + 1];
      if (c !== "\\") {
        this.i++;
        if (BARE_SPECIAL[this.mode].includes(c)) this.magic(c);
        else this.push(this.fold(c));
      } else if (n === undefined) {
        this.i++;
        this.push(this.fold("\\"));
      } else {
        this.i += 2;
        if (/[A-Za-z0-9_]/.test(n)) this.escapedLetter(n);
        else if (ESCAPED_SPECIAL[this.mode].includes(n)) this.magic(n);
        else this.push(this.fold(n));
      }
    }
    if (this.stack.length > 1) throw new VimRegexError("E54: Unmatched \\(");
    return this.top.items;
  }

  /** A multi after the last atom; at the start of a branch it is a literal. */
  quantify(q: string, raw: string): void {
    const top = this.top;
    const at = top.items.length - 1;
    const last = top.items[at];
    if (
      this.atStart() ||
      last === undefined ||
      last === "|" ||
      last === "^" ||
      last.startsWith(EDGE)
    ) {
      this.push(lit(raw));
      return;
    }
    // vim allows a multi after a multi (a**): it repeats the repeated atom.
    top.items[at] = top.multi.has(at) ? `(?:${last})${q}` : last + q;
    top.multi.add(at);
  }

  // The position right after the pattern or before \| \) \& \n (or | ) & in \v) ends a branch, where $ is an anchor.
  endsBranch(): boolean {
    const p = this.p;
    const i = this.i;
    if (i >= p.length) return true;
    if (this.mode === "v")
      return "|)&".includes(p[i] as string) || (p[i] === "\\" && p[i + 1] === "n");
    return p[i] === "\\" && "|)&n".includes(p[i + 1] ?? "");
  }

  /** \x with x a letter, digit or _: modes, back-references, classes, \_x and \zs \ze. */
  escapedLetter(e: string): void {
    const p = this.p;
    if (e === "v" || e === "m" || e === "M" || e === "V") this.mode = e;
    else if (e === "c" || e === "C") return;
    else if (/[1-9]/.test(e)) this.push(`\\${e}`);
    else if (SIMPLE_ESCAPES[e] !== undefined) this.push(SIMPLE_ESCAPES[e]);
    else if (CLASSES[e] !== undefined) {
      const [members, negated] = CLASSES[e];
      this.push(renderClass(members, negated, false));
    } else if (e === "_") {
      const n = p[this.i++];
      if (n !== undefined && CLASSES[n] !== undefined) {
        const [members, negated] = CLASSES[n];
        this.push(renderClass(members, negated, true));
      } else if (n === ".") this.push("[\\s\\S]");
      else if (n === "^" || n === "$") this.push(n);
      else if (n === "[") {
        const r = this.collection(true);
        if (r === undefined) throw new VimRegexError("E769: Missing ] after \\_[");
        this.push(r);
      } else throw new VimRegexError(`E63: Invalid use of \\_${n ?? ""}`);
    } else if (e === "z") {
      const n = p[this.i++];
      if (n !== "s" && n !== "e")
        throw new VimRegexError(`E68: Invalid character after \\z: ${n ?? ""}`);
      if (this.stack.length > 1) throw new VimRegexError(`\\z${n} inside a group is not supported`);
      this.push(`${EDGE}z${n}`);
    } else throw new VimRegexError(`unsupported pattern item \\${e}`);
  }

  /** A character that is special in this mode, bare or escaped (:help /magic). */
  magic(m: string): void {
    const atom = this.atom(m);
    if (atom !== undefined) this.push(atom);
  }

  /** What a special character matches, or undefined when it changed the state instead (multis, groups, |, \@). */
  atom(m: string): string | undefined {
    switch (m) {
      case ".":
        return "[^\\n]";
      case "*":
      case "+":
        this.quantify(m, m);
        return undefined;
      case "=":
      case "?":
        this.quantify("?", m);
        return undefined;
      case "{":
        this.quantify(this.brace(), "{");
        return undefined;
      case "[":
        return this.collection(false) ?? "\\[";
      case "~":
        return [...this.lastReplacement].map((c) => this.fold(c)).join("") || "(?:)";
      case "^":
        return this.atStart() ? "^" : "\\^";
      case "$":
        return this.endsBranch() ? "$" : "\\$";
      case "<":
        return WORD_START;
      case ">":
        return WORD_END;
      case "(":
        this.stack.push(level("("));
        return undefined;
      case ")": {
        if (this.stack.length === 1) throw new VimRegexError("E54: Unmatched \\)");
        const done = this.stack.pop() as Level;
        return `${done.capture}${done.items.join("")})`;
      }
      case "|":
        this.push("|");
        this.top.start = this.top.items.length;
        return undefined;
      case "@":
        this.lookaround();
        return undefined;
      case "%":
        return this.percent();
      case "&":
        throw new VimRegexError("unsupported pattern item \\&");
      default:
        return this.fold(m);
    }
  }

  /** \@= \@! \@<= \@<! \@> wrap the atom before them. */
  lookaround(): void {
    const m = /^(\d*)(<=|<!|=|!|>)/.exec(this.p.slice(this.i, this.i + 6).join(""));
    if (!m) throw new VimRegexError("E64: invalid character after \\@");
    this.i += m[0].length;
    const items = this.top.items;
    const last = items[items.length - 1];
    if (last === undefined || last === "|") throw new VimRegexError("E64: \\@ follows nothing");
    const open: Record<string, string> = {
      "=": "(?=",
      "!": "(?!",
      "<=": "(?<=",
      "<!": "(?<!",
      ">": "(?:",
    };
    items[items.length - 1] = `${open[m[2] as string]}${last})`;
  }

  /** \%( \%^ \%$ and the numeric character escapes. */
  percent(): string | undefined {
    const n = this.p[this.i];
    if (n === "(") {
      this.i++;
      this.stack.push(level("(?:"));
      return undefined;
    }
    if (n === "^" || n === "$") {
      this.i++;
      return n === "^" ? "(?<![\\s\\S])" : "(?![\\s\\S])";
    }
    const num = numberEscape(this.p.slice(this.i, this.i + 10).join(""));
    if (num === undefined) throw new VimRegexError(`unsupported pattern item \\%${n ?? ""}`);
    this.i += num[1];
    return num[0];
  }

  /** \{n,m}: the JavaScript quantifier; a - makes it lazy. */
  brace(): string {
    const p = this.p;
    let j = this.i;
    let body = "";
    while (j < p.length && p[j] !== "}") {
      if (p[j] === "\\" && p[j + 1] === "}") break;
      body += p[j];
      j++;
    }
    if (j >= p.length) throw new VimRegexError("E60: Missing } after \\{");
    this.i = j + (p[j] === "\\" ? 2 : 1);
    const m = /^(-?)(\d*)(,?)(\d*)$/.exec(body);
    if (!m) throw new VimRegexError(`E870: Invalid character after \\{: ${body}`);
    const lazy = m[1] === "-" ? "?" : "";
    const [lo, comma, hi] = [m[2] ?? "", m[3] ?? "", m[4] ?? ""];
    let q: string;
    if (!comma) q = lo === "" ? "*" : `{${lo}}`;
    else if (lo === "" && hi === "") q = "*";
    else q = `{${lo || "0"},${hi}}`;
    return q + (q.startsWith("{") && !comma ? "" : lazy);
  }

  /** [...], moving past it; undefined (a literal [) when there is no ]. */
  collection(withNewline: boolean): string | undefined {
    const r = collection(this.p, this.i, this.ic, withNewline);
    if (r === undefined) return undefined;
    this.i = r[1];
    return r[0];
  }
}

/** \zs and \ze move the match edges: what precedes \zs must match before it, what follows \ze after it. */
function withMatchEdges(items: readonly string[]): string {
  const zs = items.lastIndexOf(`${EDGE}zs`);
  const ze = items.indexOf(`${EDGE}ze`);
  if (zs === -1 && ze === -1) return items.join("");
  if (items.includes("|")) throw new VimRegexError("\\zs/\\ze with \\| is not supported");
  const atoms = (from: number, to: number) =>
    items
      .slice(from, to)
      .filter((x) => !x.startsWith(EDGE))
      .join("");
  const mid0 = zs === -1 ? 0 : zs + 1;
  const noEnd = ze === -1 || ze < mid0;
  const before = zs === -1 ? "" : atoms(0, zs);
  const after = noEnd ? "" : atoms(ze + 1, items.length);
  return (
    (before === "" ? "" : `(?<=${before})`) +
    atoms(mid0, noEnd ? items.length : ze) +
    (after === "" ? "" : `(?=${after})`)
  );
}

export function translateVimRegex(pattern: string, opts: CaseOptions = {}): VimRegex {
  const hasUpper = hasUppercase(pattern);
  const ic =
    forcedCase([...pattern]) ??
    ((opts.ignoreCase ?? true) && !((opts.smartCase ?? true) && hasUpper));
  const items = new Translator(pattern, ic, opts.lastReplacement ?? "").translate();
  return { source: withMatchEdges(items), ignoreCase: ic, hasUpper };
}

let lastReplacement = "";

/** The latest :s replacement, which ~ in a pattern stands for. */
export function setLastReplacement(text: string): void {
  lastReplacement = text;
}

export function resetVimRegexState(): void {
  lastReplacement = "";
}

/** A RegExp the way vim searches: \c/\C win, then 'ignorecase' (and 'smartcase' when it applies). */
export function vimRegExp(
  pattern: string,
  flags: string,
  ignoreCase = true,
  smartCase = true,
): RegExp {
  const t = translateVimRegex(pattern, { ignoreCase, smartCase, lastReplacement });
  try {
    return new RegExp(t.source, `${flags}u`);
  } catch (e) {
    throw new VimRegexError(`E486: invalid pattern ${pattern}: ${(e as Error).message}`);
  }
}
