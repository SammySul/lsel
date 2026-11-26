// Character classes and [...] collections of vim's regex dialect, and the escapes both share.

export const hasCase = (c: string) => c.toLowerCase() !== c.toUpperCase();
export const otherCase = (c: string) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase());

// vim's default 'iskeyword' and 'isfname'.
export const KEYWORD = "0-9A-Za-z_\\u00C0-\\u00FF";

// Character class atoms as [members, negated]; none matches a line break unless written \_x.
export const CLASSES: Readonly<Record<string, readonly [string, boolean]>> = {
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

const classLit = (c: string) => ("\\]^-[".includes(c) ? `\\${c}` : c);
const codeLit = (n: number) => {
  if (n === 10) return "\\n";
  const c = String.fromCodePoint(n);
  return n < 0x20 || n === 0x7f ? `\\u{${n.toString(16)}}` : c;
};

export function renderClass(members: string, negated: boolean, withNewline: boolean): string {
  if (negated) return withNewline ? `[^${members}]` : `[^${members}\\n]`;
  return withNewline ? `[${members}\\n]` : `[${members}]`;
}

export const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  n: "\\n",
  t: "\\t",
  e: "\\x1B",
  r: "\\r",
  b: "\\x08",
};

/** \%d123 \%o40 \%x2a \%u20AC \%U1F600 (and \d \o \x \u \U in []): the character, and how many pattern characters it took. */
export function numberEscape(text: string): [string, number] | undefined {
  const m =
    /^(?:d(\d+)|o([0-7]+)|x([0-9a-fA-F]{1,2})|u([0-9a-fA-F]{1,4})|U([0-9a-fA-F]{1,8}))/.exec(text);
  if (!m) return undefined;
  const digits = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? "0";
  const radix = m[1] ? 10 : m[2] ? 8 : 16;
  return [codeLit(Number.parseInt(digits, radix)), m[0].length];
}

/** [...] from just after the [, as a JavaScript class case-folded under ignorecase, and the index after the ]; undefined when there is none. */
export function collection(
  p: readonly string[],
  from: number,
  ic: boolean,
  withNewline: boolean,
): [string, number] | undefined {
  let j = from;
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
      else if (/[A-Z]/.test(a) && /[A-Z]/.test(b)) extra += `${a.toLowerCase()}-${b.toLowerCase()}`;
    } else if (ic && hasCase(c) && [...otherCase(c)].length === 1) extra += classLit(otherCase(c));
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
      const set = POSIX[end === -1 ? "" : p.slice(j + 2, end).join("")];
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
      const num = numberEscape(p.slice(j + 1, j + 11).join(""));
      if (SIMPLE_ESCAPES[n] !== undefined) {
        out += SIMPLE_ESCAPES[n];
        j += 2;
      } else if ("\\]^-".includes(n)) {
        plain(n);
        j += 2;
      } else if (num !== undefined) {
        out += num[0];
        j += 1 + num[1];
      } else {
        out += "\\\\";
        j++;
      }
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
}
