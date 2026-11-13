// vim's regex dialect (:help pattern) translated to a JavaScript source valid under the "u" flag, as CM's RegExpCursor uses.

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

const hasCase = (c: string) => c.toLowerCase() !== c.toUpperCase();
const otherCase = (c: string) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase());

type Mode = "v" | "m" | "M" | "V";

// vim's default 'iskeyword' and 'isfname'.
const KEYWORD = "0-9A-Za-z_\\u00C0-\\u00FF";
const WORD_START = `(?<![${KEYWORD}])(?=[${KEYWORD}])`;
const WORD_END = `(?<=[${KEYWORD}])(?![${KEYWORD}])`;

// Character class atoms as [members, negated]; none matches a line break unless written \_x.
const CLASSES: Readonly<Record<string, readonly [string, boolean]>> = {
  s: [" \\t", false],
  S: [" \\t", true],
  d: ["0-9", false],
  D: ["0-9", true],
  w: ["0-9A-Za-z_", false],
  W: ["0-9A-Za-z_", true],
  a: ["A-Za-z", false],
  A: ["A-Za-z", true],
  l: ["a-z", false],
  L: ["a-z", true],
  u: ["A-Z", false],
  U: ["A-Z", true],
  x: ["0-9A-Fa-f", false],
  X: ["0-9A-Fa-f", true],
  o: ["0-7", false],
  O: ["0-7", true],
  h: ["A-Za-z_", false],
  H: ["A-Za-z_", true],
  k: [KEYWORD, false],
  K: ["A-Za-z_\\u00C0-\\u00FF", false],
  i: [KEYWORD, false],
  I: ["A-Za-z_\\u00C0-\\u00FF", false],
  f: ["0-9A-Za-z/.\\-_+,#$%~=", false],
  F: ["A-Za-z/.\\-_+,#$%~=", false],
  p: ["\\x20-\\x7E\\u00A0-\\uFFFF", false],
  P: ["\\x20-\\x2F\\x3A-\\x7E\\u00A0-\\uFFFF", false],
};

const POSIX: Readonly<Record<string, string>> = {
  alnum: "0-9A-Za-z",
  alpha: "A-Za-z",
  blank: " \\t",
  cntrl: "\\x00-\\x1F\\x7F",
  digit: "0-9",
  graph: "\\x21-\\x7E",
  lower: "a-z",
  print: "\\x20-\\x7E",
  punct: "!-\\/:-@\\[-`{-~",
  space: "\\t\\x0B\\f\\r ",
  upper: "A-Z",
  xdigit: "0-9A-Fa-f",
  return: "\\r",
  tab: "\\t",
  escape: "\\x1B",
  backspace: "\\x08",
  ident: KEYWORD,
  keyword: KEYWORD,
  fname: "0-9A-Za-z/.\\-_+,#$%~=",
};

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
const classLit = (c: string) => ("\\]^-[".includes(c) ? `\\${c}` : c);
const codeLit = (n: number) => {
  if (n === 10) return "\\n";
  const c = String.fromCodePoint(n);
  return n < 0x20 || n === 0x7f ? `\\u{${n.toString(16)}}` : c;
};

function renderClass(members: string, negated: boolean, withNewline: boolean): string {
  if (negated) return withNewline ? `[^${members}]` : `[^${members}\\n]`;
  return withNewline ? `[${members}\\n]` : `[${members}]`;
}

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

export function translateVimRegex(pattern: string, opts: CaseOptions = {}): VimRegex {
  const p = [...pattern];
  let mode: Mode = "m";
  const hasUpper = hasUppercase(pattern);
  const ic =
    forcedCase(p) ?? ((opts.ignoreCase ?? true) && !((opts.smartCase ?? true) && hasUpper));
  const lastReplacement = opts.lastReplacement ?? "";
  const fold = (c: string) =>
    ic && hasCase(c) && [...otherCase(c)].length === 1 ? `[${c}${otherCase(c)}]` : lit(c);
  const stack: Level[] = [{ items: [], multi: new Set(), start: 0, capture: null }];
  const top = () => stack[stack.length - 1] as Level;
  const atStart = () => top().items.length === top().start;
  const push = (atom: string) => top().items.push(atom);
  const quantify = (q: string, raw: string) => {
    const level = top();
    const at = level.items.length - 1;
    const last = level.items[at];
    if (
      atStart() ||
      last === undefined ||
      last === "|" ||
      last === "^" ||
      last.startsWith("\u0000")
    ) {
      push(lit(raw));
      return;
    }
    // vim allows a multi after a multi (a**): it repeats the repeated atom.
    level.items[at] = level.multi.has(at) ? `(?:${last})${q}` : last + q;
    level.multi.add(at);
  };

  // The position right after the pattern or before \| \) \& \n (or | ) & in \v) ends a branch, where $ is an anchor.
  const endsBranch = (i: number): boolean => {
    if (i >= p.length) return true;
    if (mode === "v") return "|)&".includes(p[i] as string) || (p[i] === "\\" && p[i + 1] === "n");
    return p[i] === "\\" && "|)&n".includes(p[i + 1] ?? "");
  };

  const collection = (i: number, withNewline: boolean): [string, number] | undefined => {
    let j = i;
    let negated = false;
    if (p[j] === "^") {
      negated = true;
      j++;
    }
    let out = "";
    let extra = "";
    let lastPlain: string | undefined;
    let rangeFrom: string | undefined;
    const plain = (c: string) => {
      out += classLit(c);
      if (ic && rangeFrom !== undefined) {
        const [a, b] = [rangeFrom, c];
        if (/[a-z]/.test(a) && /[a-z]/.test(b)) extra += `${a.toUpperCase()}-${b.toUpperCase()}`;
        else if (/[A-Z]/.test(a) && /[A-Z]/.test(b))
          extra += `${a.toLowerCase()}-${b.toLowerCase()}`;
      } else if (ic && hasCase(c) && [...otherCase(c)].length === 1)
        extra += classLit(otherCase(c));
      lastPlain = rangeFrom === undefined ? c : undefined;
      rangeFrom = undefined;
    };
    if (p[j] === "]") {
      plain("]");
      j++;
    }
    while (j < p.length && p[j] !== "]") {
      const c = p[j] as string;
      if (c === "[" && p[j + 1] === ":") {
        const end = p.indexOf(":", j + 2);
        const name = end === -1 ? "" : p.slice(j + 2, end).join("");
        const set = POSIX[name];
        if (set !== undefined && p[end + 1] === "]") {
          out += set;
          j = end + 2;
          continue;
        }
      }
      if (
        c === "[" &&
        (p[j + 1] === "=" || p[j + 1] === ".") &&
        p[j + 3] === p[j + 1] &&
        p[j + 4] === "]"
      ) {
        out += classLit(p[j + 2] as string);
        j += 5;
        continue;
      }
      if (c === "\\" && j + 1 < p.length) {
        const n = p[j + 1] as string;
        const simple: Record<string, string> = {
          e: "\\x1B",
          t: "\\t",
          r: "\\r",
          b: "\\x08",
          n: "\\n",
        };
        if (simple[n] !== undefined) {
          out += simple[n];
          j += 2;
          continue;
        }
        if ("\\]^-".includes(n)) {
          plain(n);
          j += 2;
          continue;
        }
        const num =
          /^(?:d(\d+)|o([0-7]+)|x([0-9a-fA-F]{1,2})|u([0-9a-fA-F]{1,4})|U([0-9a-fA-F]{1,8}))/.exec(
            p.slice(j + 1, j + 11).join(""),
          );
        if (num) {
          const v = num[1] ?? num[2] ?? num[3] ?? num[4] ?? num[5] ?? "0";
          const radix = num[1] ? 10 : num[2] ? 8 : 16;
          out += codeLit(Number.parseInt(v, radix));
          j += 1 + num[0].length;
          continue;
        }
        out += "\\\\";
        j++;
        continue;
      }
      if (c === "-" && out !== "" && p[j + 1] !== "]" && j + 1 < p.length) {
        out += "-";
        rangeFrom = lastPlain;
        j++;
        continue;
      }
      plain(c);
      j++;
    }
    if (j >= p.length) return undefined;
    return [renderClass(out + extra, negated, withNewline), j + 1];
  };

  const brace = (i: number): [string, number] => {
    let j = i;
    let body = "";
    while (j < p.length && p[j] !== "}") {
      if (p[j] === "\\" && p[j + 1] === "}") break;
      body += p[j];
      j++;
    }
    if (j >= p.length) throw new VimRegexError("E60: Missing } after \\{");
    j += p[j] === "\\" ? 2 : 1;
    const m = /^(-?)(\d*)(,?)(\d*)$/.exec(body);
    if (!m) throw new VimRegexError(`E870: Invalid character after \\{: ${body}`);
    const lazy = m[1] === "-" ? "?" : "";
    const [lo, comma, hi] = [m[2] ?? "", m[3] ?? "", m[4] ?? ""];
    let q: string;
    if (!comma) q = lo === "" ? "*" : `{${lo}}`;
    else if (lo === "" && hi === "") q = "*";
    else q = `{${lo || "0"},${hi}}`;
    return [q + (q.startsWith("{") && !comma ? "" : lazy), j];
  };

  for (let i = 0; i < p.length; ) {
    const c = p[i] as string;
    let magic: string | undefined;
    let escapedLetter: string | undefined;
    let literal: string | undefined;
    if (c === "\\") {
      const n = p[i + 1];
      if (n === undefined) {
        literal = "\\";
        i++;
      } else if (/[A-Za-z0-9_]/.test(n)) {
        escapedLetter = n;
        i += 2;
      } else if (ESCAPED_SPECIAL[mode].includes(n)) {
        magic = n;
        i += 2;
      } else {
        literal = n;
        i += 2;
      }
    } else if (BARE_SPECIAL[mode].includes(c)) {
      magic = c;
      i++;
    } else {
      literal = c;
      i++;
    }

    if (literal !== undefined) {
      push(fold(literal));
      continue;
    }

    if (escapedLetter !== undefined) {
      const e = escapedLetter;
      if (e === "v" || e === "m" || e === "M" || e === "V") {
        mode = e;
        continue;
      }
      if (e === "c" || e === "C") continue;
      if (/[1-9]/.test(e)) {
        push(`\\${e}`);
        continue;
      }
      const simple: Record<string, string> = {
        n: "\\n",
        t: "\\t",
        e: "\\x1B",
        r: "\\r",
        b: "\\x08",
      };
      if (simple[e] !== undefined) {
        push(simple[e] as string);
        continue;
      }
      const cls = CLASSES[e];
      if (cls !== undefined) {
        push(renderClass(cls[0], cls[1], false));
        continue;
      }
      if (e === "_") {
        const n = p[i];
        i++;
        if (n !== undefined && CLASSES[n] !== undefined) {
          const [members, negated] = CLASSES[n] as readonly [string, boolean];
          push(renderClass(members, negated, true));
        } else if (n === ".") push("[\\s\\S]");
        else if (n === "^") push("^");
        else if (n === "$") push("$");
        else if (n === "[") {
          const r = collection(i, true);
          if (r === undefined) throw new VimRegexError("E769: Missing ] after \\_[");
          push(r[0]);
          i = r[1];
        } else throw new VimRegexError(`E63: Invalid use of \\_${n ?? ""}`);
        continue;
      }
      if (e === "z") {
        const n = p[i];
        i++;
        if (n === "s" || n === "e") {
          if (stack.length > 1) throw new VimRegexError(`\\z${n} inside a group is not supported`);
          push(`\u0000z${n}`);
          continue;
        }
        throw new VimRegexError(`E68: Invalid character after \\z: ${n ?? ""}`);
      }
      throw new VimRegexError(`unsupported pattern item \\${e}`);
    }

    switch (magic) {
      case ".":
        push("[^\\n]");
        break;
      case "*":
        quantify("*", "*");
        break;
      case "+":
        quantify("+", "+");
        break;
      case "=":
      case "?":
        quantify("?", magic);
        break;
      case "{": {
        const [q, next] = brace(i);
        i = next;
        quantify(q, "{");
        break;
      }
      case "[": {
        const r = collection(i, false);
        if (r === undefined) push("\\[");
        else {
          push(r[0]);
          i = r[1];
        }
        break;
      }
      case "~":
        push([...lastReplacement].map(fold).join("") || "(?:)");
        break;
      case "^":
        push(atStart() ? "^" : "\\^");
        break;
      case "$":
        push(endsBranch(i) ? "$" : "\\$");
        break;
      case "<":
        push(WORD_START);
        break;
      case ">":
        push(WORD_END);
        break;
      case "(":
        stack.push({ items: [], multi: new Set(), start: 0, capture: "(" });
        break;
      case ")": {
        if (stack.length === 1) throw new VimRegexError("E54: Unmatched \\)");
        const done = stack.pop() as Level;
        push(`${done.capture}${done.items.join("")})`);
        break;
      }
      case "|":
        push("|");
        top().start = top().items.length;
        break;
      case "@": {
        const rest = p.slice(i, i + 6).join("");
        const m = /^(\d*)(<=|<!|=|!|>)/.exec(rest);
        if (!m) throw new VimRegexError("E64: invalid character after \\@");
        i += m[0].length;
        const items = top().items;
        const last = items[items.length - 1];
        if (last === undefined || last === "|") throw new VimRegexError("E64: \\@ follows nothing");
        const wrap: Record<string, string> = {
          "=": "(?=",
          "!": "(?!",
          "<=": "(?<=",
          "<!": "(?<!",
          ">": "(?:",
        };
        items[items.length - 1] = `${wrap[m[2] as string]}${last})`;
        break;
      }
      case "%": {
        const n = p[i];
        if (n === "(") {
          i++;
          stack.push({ items: [], multi: new Set(), start: 0, capture: "(?:" });
          break;
        }
        if (n === "^") {
          i++;
          push("(?<![\\s\\S])");
          break;
        }
        if (n === "$") {
          i++;
          push("(?![\\s\\S])");
          break;
        }
        const num =
          /^(?:d(\d+)|o([0-7]+)|x([0-9a-fA-F]{1,2})|u([0-9a-fA-F]{1,4})|U([0-9a-fA-F]{1,8}))/.exec(
            p.slice(i, i + 10).join(""),
          );
        if (num) {
          const v = num[1] ?? num[2] ?? num[3] ?? num[4] ?? num[5] ?? "0";
          const radix = num[1] ? 10 : num[2] ? 8 : 16;
          push(codeLit(Number.parseInt(v, radix)));
          i += num[0].length;
          break;
        }
        throw new VimRegexError(`unsupported pattern item \\%${n ?? ""}`);
      }
      case "&":
        throw new VimRegexError("unsupported pattern item \\&");
      default:
        push(fold(magic as string));
    }
  }
  if (stack.length > 1) throw new VimRegexError("E54: Unmatched \\(");
  let items = top().items;
  // \zs and \ze move the match edges: what precedes \zs must match before it, what follows \ze after it.
  const zs = items.lastIndexOf("\u0000zs");
  const ze = items.indexOf("\u0000ze");
  let source: string;
  if (zs === -1 && ze === -1) source = items.join("");
  else {
    if (items.includes("|")) throw new VimRegexError("\\zs/\\ze with \\| is not supported");
    const before = zs === -1 ? [] : items.slice(0, zs).filter((x) => !x.startsWith("\u0000"));
    const mid0 = zs === -1 ? 0 : zs + 1;
    const mid1 = ze === -1 || ze < mid0 ? items.length : ze;
    const middle = items.slice(mid0, mid1).filter((x) => !x.startsWith("\u0000"));
    const after =
      ze === -1 || ze < mid0 ? [] : items.slice(ze + 1).filter((x) => !x.startsWith("\u0000"));
    items = middle;
    source =
      (before.length > 0 ? `(?<=${before.join("")})` : "") +
      middle.join("") +
      (after.length > 0 ? `(?=${after.join("")})` : "");
  }
  return { source, ignoreCase: ic, hasUpper };
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
