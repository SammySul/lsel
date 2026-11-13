import type { OracleSettings } from "../types.ts";
import { Rng } from "./prng.ts";
import { SETTINGS, SNIPPETS } from "./snippets.ts";

/** A generated case; keys is chunks joined, each chunk one complete command that ends in normal mode. */
export interface FuzzCase {
  id: string;
  start: string;
  keys: string;
  settings: OracleSettings;
  chunks: string[];
}

type W<T> = readonly (readonly [number, T])[];

interface St {
  rng: Rng;
  lines: number;
  words: string[];
  chars: string[];
  macros: string[];
  replayed: boolean;
  inMacro: boolean;
  marks: string[];
  named: boolean;
}

const MACRO_REGS = ["q", "w", "e"];
const YANK_REGS = ["a", "b", "c"];
const PUNCT = [";", ",", ".", "(", ")", "{", "}", "[", "]", "=", "+", "-", "*", ":", '"', "'", "_"];
const IDENT = /[A-Za-z_][A-Za-z0-9_]*/g;
// Normal-mode commands that end a run, wait forever or edit another buffer (ZZ, Q, K, @, q:, gf, gs).
const UNSAFE_TEXT = /[ZQK@|&~\\/]|q[:/?]|g[fFsh]/;

/** plain text as key notation */
function esc(s: string): string {
  return s.replaceAll("<", "<lt>").replaceAll("\t", "<Tab>");
}

function count(st: St, max = 12): string {
  return st.rng.weighted<() => string>([
    [70, () => ""],
    [22, () => String(st.rng.int(2, 3))],
    [6, () => String(st.rng.int(4, 6))],
    [2, () => String(st.rng.int(7, max))],
  ])();
}

function char(st: St): string {
  const c = st.rng.chance(0.85) && st.chars.length > 0 ? st.rng.pick(st.chars) : st.rng.pick(PUNCT);
  return esc(c);
}

function word(st: St): string {
  return st.words.length > 0 && st.rng.chance(0.85)
    ? st.rng.pick(st.words)
    : st.rng.pick(["foo", "bar", "x", "id", "value", "tmp", "i", "n"]);
}

function token(st: St): string {
  return st.rng.weighted<() => string>([
    [10, () => word(st)],
    [4, () => st.rng.pick(PUNCT)],
    [3, () => " "],
    [2, () => String(st.rng.int(0, 99))],
    [1, () => `${word(st)}(`],
    [1, () => " = "],
    [1, () => ", "],
    [1, () => "<"],
  ])();
}

function text(st: St, maxTokens = 3): string {
  for (;;) {
    const n = st.rng.int(1, maxTokens);
    let s = "";
    for (let i = 0; i < n; i++) s += token(st);
    if (!UNSAFE_TEXT.test(s)) return esc(s);
  }
}

// --- motions and text objects

// In visual mode vim flushes the typeahead on a failed search or mark jump, so the oracle would hang.
function motion(st: St, visual = false): string {
  const r = st.rng;
  const jumps = visual ? 0 : 1;
  return r.weighted<() => string>([
    [20, () => count(st) + r.pick(["h", "j", "k", "l"])],
    [18, () => count(st) + r.pick(["w", "b", "e", "W", "B", "E", "ge"])],
    [8, () => r.pick(["0", "^", "$", "_", `${r.int(2, 3)}$`])],
    [5, () => r.pick(["gg", "G", `${r.int(1, st.lines)}G`, `${r.int(1, st.lines)}gg`])],
    [12, () => count(st, 3) + r.pick(["f", "t", "F", "T"]) + char(st)],
    [3, () => r.pick([";", ","])],
    [3, () => "%"],
    [4, () => count(st, 3) + r.pick(["{", "}"])],
    [1, () => r.pick(["(", ")"])],
    [2, () => count(st, 3) + r.pick(["+", "-", "<CR>"])],
    [3 * jumps, () => r.pick(["n", "N", "*", "#"])],
    [3 * jumps, () => `${r.pick(["/", "?"])}${pattern(st).pat}<CR>`],
    [st.marks.length > 0 ? 2 * jumps : 0, () => r.pick(["`", "'"]) + r.pick(st.marks)],
    [1, () => r.pick(["H", "M", "L"])],
    [1, () => `${r.int(1, 12)}|`],
  ])();
}

const OBJECTS = [
  "iw",
  "aw",
  "iW",
  "aW",
  "is",
  "ip",
  "ap",
  "i(",
  "a(",
  "ib",
  "i[",
  "a]",
  "i{",
  "a{",
  "iB",
  "i<lt>",
  "a>",
  'i"',
  'a"',
  "i'",
  "a'",
  "i`",
];

function object(st: St): string {
  return st.rng.pick(OBJECTS);
}

// Motions after which c never fails, so the inserted text is never run as normal-mode commands.
function safeChangeTarget(st: St): string {
  const r = st.rng;
  return r.weighted<() => string>([
    [10, () => count(st, 3) + r.pick(["w", "e", "W", "E"])],
    [6, () => r.pick(["iw", "aw", "iW", "aW"])],
    [4, () => r.pick(["$", "^", "0"])],
    [3, () => "c"],
  ])();
}

// --- insert mode

function insertBody(st: St): string {
  const r = st.rng;
  const n = r.int(1, 4);
  let s = text(st);
  for (let i = 1; i < n; i++) {
    s += r.weighted<() => string>([
      [10, () => text(st)],
      [2, () => "<BS>"],
      [2, () => "<C-w>"],
      [1, () => "<C-u>"],
      [2, () => "<CR>"],
      [1, () => "<Tab>"],
      [1, () => r.pick(["<Left>", "<Right>"])],
      [0.5, () => r.pick(["<Up>", "<Down>", "<Home>", "<End>"])],
      [1, () => "<Del>"],
      [
        1.5,
        () => `<C-o>${r.pick(["0", "$", "w", "b", "x", "dd", "D", "p", "P", "dw", "j", "k", "~"])}`,
      ],
      [1, () => `<C-r>${r.pick(['"', "0", "-", ".", ...(st.named ? ["a"] : [])])}`],
      [0.5, () => r.pick(["<C-t>", "<C-d>"])],
      [0.3, () => r.pick(["<C-a>", "<C-e>", "<C-y>"])],
    ])();
  }
  return `${s}<Esc>`;
}

function insert(st: St): string {
  const r = st.rng;
  const entry = r.weighted<() => string>([
    [12, () => r.pick(["i", "a", "I", "A", "o", "O"])],
    [3, () => `${r.int(2, 3)}${r.pick(["i", "a", "A", "o"])}`],
    [2, () => r.pick(["s", "S", "C", `${r.int(2, 3)}s`])],
    [1, () => "gi"],
    [1, () => "gI"],
  ])();
  return entry + insertBody(st);
}

function replace(st: St): string {
  return `${st.rng.chance(0.2) ? st.rng.int(2, 3) : ""}R${text(st)}<Esc>`;
}

// --- operators

function reg(st: St): string {
  const r = st.rng;
  if (!r.chance(0.15)) return "";
  st.named = true;
  return `"${r.pick([...YANK_REGS, "A", "B", "_", "_"])}`;
}

function operator(st: St): string {
  const r = st.rng;
  return r.weighted<() => string>([
    [
      30,
      () =>
        reg(st) + count(st, 3) + r.pick(["d", "y"]) + (r.chance(0.35) ? object(st) : motion(st)),
    ],
    [12, () => `c${safeChangeTarget(st)}${insertBody(st)}`],
    [5, () => count(st, 3) + r.pick(["dd", "yy"])],
    // a counted cc past the last line fails and would run the text as commands
    [2, () => `cc${insertBody(st)}`],
    [
      6,
      () =>
        count(st, 3) +
        r.pick([">", "<lt>"]) +
        r.pick([r.pick([">", "<lt>"]), motion(st), object(st)]),
    ],
    [5, () => r.pick([">>", "<lt><lt>"])],
    [8, () => r.pick(["g~", "gu", "gU", "g?"]) + (r.chance(0.5) ? object(st) : motion(st))],
    [3, () => r.pick(["guu", "gUU", "g~~", "gUiw", "guiw"])],
  ])();
}

// --- small edits

function edit(st: St): string {
  const r = st.rng;
  return r.weighted<() => string>([
    [10, () => count(st, 4) + r.pick(["x", "X"])],
    [4, () => r.pick(["D", "Y"])],
    [6, () => count(st, 3) + r.pick(["J", "gJ"])],
    [4, () => `${count(st, 4)}~`],
    [10, () => reg(st) + count(st, 3) + r.pick(["p", "P"])],
    [6, () => `${count(st, 3)}r${char(st)}`],
    [5, () => count(st, 20) + r.pick(["<C-a>", "<C-x>"])],
    [10, () => `${count(st, 3)}.`],
    [4, () => r.pick(["xp", "ddp", "yyp", "Yp", "ddP", "dwwP"])],
    [1, () => r.pick(["&", "g&"])],
  ])();
}

function undo(st: St): string {
  const r = st.rng;
  return r.weighted<() => string>([
    [6, () => `${count(st, 3)}u`],
    [3, () => `${count(st, 3)}<C-r>`],
    [1, () => "u<C-r>"],
  ])();
}

function mark(st: St): string {
  const m = st.rng.pick(["a", "b"]);
  if (!st.marks.includes(m)) st.marks.push(m);
  return `m${m}`;
}

function markUse(st: St): string {
  const r = st.rng;
  if (st.marks.length === 0) return mark(st);
  const m = r.pick(st.marks);
  return r.pick(["d", "y"]) + r.pick(["`", "'"]) + m;
}

// --- visual

function visual(st: St): string {
  const r = st.rng;
  const kind = r.weighted([
    [45, "v"],
    [30, "V"],
    [25, "<C-v>"],
  ] as const);
  let s = kind;
  const n = r.int(1, 3);
  for (let i = 0; i < n; i++) {
    s += kind === "v" && r.chance(0.25) ? object(st) : motion(st, true);
  }
  if (r.chance(0.1)) s += `o${motion(st, true)}`;
  const common: W<() => string> = [
    [12, () => reg(st) + r.pick(["d", "x"])],
    [6, () => `${reg(st)}y`],
    [4, () => r.pick([">", "<lt>"])],
    [5, () => r.pick(["~", "u", "U"])],
    [3, () => r.pick(["J", "gJ"])],
    [3, () => `r${char(st)}`],
    [4, () => reg(st) + r.pick(["p", "P"])],
    [2, () => "<Esc>"],
  ];
  const extra: W<() => string> =
    kind === "v"
      ? [[8, () => `c${insertBody(st)}`]]
      : kind === "V"
        ? [
            [4, () => `:${subCmd(st)}<CR>`],
            [2, () => `:norm ${normArgs(st)}<CR>`],
          ]
        : [
            [6, () => `c${insertBody(st)}`],
            [6, () => `I${insertBody(st)}`],
            [6, () => `A${insertBody(st)}`],
            [3, () => `$A${insertBody(st)}`],
          ];
  return s + r.weighted([...common, ...extra])();
}

// --- ex commands

interface Pattern {
  pat: string;
  group: boolean;
}

function escPatChar(c: string): string {
  return /[.*[\]~\\^$/]/.test(c) ? `\\${c}` : c;
}

function pattern(st: St): Pattern {
  const r = st.rng;
  const w = word(st);
  return r.weighted<() => Pattern>([
    [40, () => ({ pat: w, group: false })],
    [10, () => ({ pat: `\\<lt>${w}\\>`, group: false })],
    [8, () => ({ pat: w.slice(0, Math.max(1, Math.ceil(w.length / 2))), group: false })],
    [
      8,
      () => ({ pat: esc(escPatChar(st.chars.length > 0 ? r.pick(st.chars) : ";")), group: false }),
    ],
    [5, () => ({ pat: r.pick(["^\\s\\+", "^\\s*", "\\s\\+$"]), group: false })],
    [4, () => ({ pat: `${w}$`, group: false })],
    [5, () => ({ pat: r.pick(["\\d\\+", "\\w\\+", "[aeiou]", "[0-9]"]), group: false })],
    [3, () => ({ pat: `${w.slice(0, 1)}.${w.slice(2, 3)}`, group: false })],
    [6, () => ({ pat: `\\(${w}\\)`, group: true })],
    [3, () => ({ pat: r.pick([`\\(\\w\\+\\) \\(\\w\\+\\)`, `\\(\\d\\+\\)`]), group: true })],
    [2, () => ({ pat: r.pick([",\\n", "\\n", ";\\n"]), group: false })],
    [3, () => ({ pat: r.pick(["^", "$"]), group: false })],
  ])();
}

function replacement(st: St, p: Pattern): string {
  const r = st.rng;
  return r.weighted<() => string>([
    [10, () => text(st, 2)],
    [3, () => ""],
    [p.group ? 8 : 0, () => r.pick(["\\1", `[\\1]`, `\\1${text(st, 1)}`, "\\2 \\1"])],
    [1, () => "\\r"],
  ])();
}

function range(st: St): string {
  const r = st.rng;
  const a = r.int(1, st.lines);
  return r.weighted([
    [30, ""],
    [30, "%"],
    [10, `${a},${Math.min(st.lines, a + r.int(1, 3))}`],
    [6, ".,+1"],
    [6, ".,$"],
    [5, String(a)],
  ] as const);
}

function subCmd(st: St): string {
  const p = pattern(st);
  return `s/${p.pat}/${replacement(st, p)}/${st.rng.pick(["", "g", "g"])}`;
}

function normArgs(st: St): string {
  const r = st.rng;
  const pre = r.weighted<() => string>([
    [4, () => ""],
    [3, () => r.pick(["0", "$", "w", "^", "f,", "f;", "2w", "e"])],
    [2, () => r.pick(["x", "dw", "D", "~", "J", "dd", "yyp", ">>"])],
  ])();
  const tail = r.weighted<() => string>([
    [6, () => r.pick(["A", "I", "a", "i", "o", "O"]) + text(st, 2)],
    [3, () => r.pick(["x", "dw", "D", "~", "J", "gUiw", "ct,X", "r#"])],
    [st.macros.length > 0 && !st.inMacro ? 4 : 0, () => `@${r.pick(st.macros)}`],
  ])();
  return pre + tail;
}

function ex(st: St): string {
  const r = st.rng;
  return r.weighted<() => string>([
    [30, () => `:${range(st)}${subCmd(st)}<CR>`],
    [10, () => `:g/${pattern(st).pat}/d<CR>`],
    [8, () => `:${r.pick(["g", "g", "v"])}/${pattern(st).pat}/norm ${normArgs(st)}<CR>`],
    [5, () => `:g/${pattern(st).pat}/${subCmd(st)}<CR>`],
    [4, () => `:v/${pattern(st).pat}/d<CR>`],
    [4, () => `:g/${r.pick(["^", pattern(st).pat])}/${r.pick(["m0", "t.", "j", "m$"])}<CR>`],
    [12, () => `:${r.pick(["%", "", range(st)])}norm ${normArgs(st)}<CR>`],
    [
      8,
      () =>
        `:${range(st)}${r.pick(["d", "m0", "m$", "t.", "t0", "j", ">", "<lt>", "sort", "y"])}<CR>`,
    ],
    [2, () => ":&&<CR>"],
  ])();
}

// --- macros

function record(st: St): string {
  const r = st.rng;
  const q = r.pick(MACRO_REGS);
  st.inMacro = true;
  let body = "";
  const n = r.int(1, 4);
  for (let i = 0; i < n; i++) body += command(st);
  st.inMacro = false;
  if (!st.macros.includes(q)) st.macros.push(q);
  return `q${q}${body}q`;
}

function playback(st: St): string {
  const r = st.rng;
  const q = r.pick(st.macros);
  const s = r.weighted<() => string>([
    [10, () => `@${q}`],
    [8, () => `${r.int(2, 5)}@${q}`],
    [st.replayed ? 3 : 0, () => "@@"],
    [3, () => `j@${q}`],
    [3, () => `:${r.pick(["%", "", range(st)])}norm @${q}<CR>`],
    [2, () => `:g/${pattern(st).pat}/norm @${q}<CR>`],
  ])();
  st.replayed = true;
  return s;
}

function command(st: St): string {
  const r = st.rng;
  return r.weighted<() => string>([
    [22, () => motion(st)],
    [20, () => operator(st)],
    [14, () => insert(st)],
    [2, () => replace(st)],
    [14, () => edit(st)],
    [9, () => visual(st)],
    [8, () => ex(st)],
    [st.inMacro ? 0 : 5, () => record(st)],
    [st.inMacro || st.macros.length === 0 ? 0 : 6, () => playback(st)],
    [4, () => undo(st)],
    [1.5, () => mark(st)],
    [st.marks.length > 0 ? 1.5 : 0, () => markUse(st)],
  ])();
}

// --- start texts

function startText(r: Rng): { start: string; settings: OracleSettings } {
  const sn = r.pick(SNIPPETS);
  const lines = sn.text.split("\n");
  const n = Math.min(
    lines.length,
    r.weighted([
      [15, 1],
      [40, r.int(2, 4)],
      [35, r.int(5, 10)],
      [10, 30],
    ] as const),
  );
  let at = r.int(0, lines.length - n);
  // vim opens a file on line 1's first non-blank, the engine at 1:1; start on an unindented line
  while (at > 0 && /^\s/.test(lines[at] ?? "")) at--;
  const slice = lines.slice(at, at + n);
  slice[0] = (slice[0] ?? "").trimStart();
  // a start never ends in a newline, so trailing blank lines go
  while (slice.length > 1 && slice[slice.length - 1] === "") slice.pop();
  return { start: slice.join("\n"), settings: SETTINGS[sn.lang] };
}

function stateFor(r: Rng, start: string): St {
  const words = [...new Set(start.match(IDENT) ?? [])].filter((w) => !UNSAFE_TEXT.test(w));
  const chars = [...start].filter((c) => !/[\s|]/.test(c));
  return {
    rng: r,
    lines: start.split("\n").length,
    words,
    chars,
    macros: [],
    replayed: false,
    inMacro: false,
    marks: [],
    named: false,
  };
}

export function fuzzId(seed: number, index: number): string {
  return `fuzz-${seed}-${index}`;
}

/** Case `index` of the stream `seed`; the same pair always gives the same case. */
export function generateCase(seed: number, index: number): FuzzCase {
  const r = new Rng(seed, index);
  const { start, settings } = startText(r);
  const st = stateFor(r, start);
  const n = r.weighted([
    [10, r.int(1, 2)],
    [50, r.int(3, 5)],
    [30, r.int(6, 8)],
    [10, r.int(9, 12)],
  ] as const);
  const chunks: string[] = [];
  for (let i = 0; i < n; i++) chunks.push(command(st));
  // vim aborts a macro at a failing motion, possibly mid-insert or mid-selection
  if (st.replayed) chunks.push("<Esc>");
  return { id: fuzzId(seed, index), start, keys: chunks.join(""), settings, chunks };
}

export function generateCases(seed: number, count: number, from = 0): FuzzCase[] {
  return Array.from({ length: count }, (_, i) => generateCase(seed, from + i));
}
