// The shape of an oracle case and of vim's recorded answer to it.

import { parseKeys } from "../src/input/keys.ts";

export interface OracleSettings {
  tabSize: 2 | 4 | 8;
  indentUnit: "  " | "    " | "\t";
}

export interface OracleCase {
  /** unique across the whole corpus; kebab-case, upper case allowed for key names (seed-Vc) */
  id: string;
  /** the buffer, without a trailing newline (puzzle convention) */
  start: string;
  /** our vim notation, as in a puzzle's solution */
  keys: string;
  settings?: Partial<OracleSettings>;
  note?: string;
}

export const DEFAULT_SETTINGS: OracleSettings = { tabSize: 2, indentUnit: "  " };

/** vim's mode(1), named; "prompt" is an open : / ? line, "insert-normal" is i_CTRL-O */
export type OracleMode =
  | "normal"
  | "insert"
  | "replace"
  | "visual"
  | "visual line"
  | "visual block"
  | "insert-normal"
  | "operator-pending"
  | "prompt";

/** 1-based line and byte column, as vim's line('.') and col('.'); the corpus is ASCII, so bytes are chars */
export interface Cursor {
  line: number;
  col: number;
}

export interface Observed {
  doc: string;
  cursor: Cursor;
  mode: OracleMode;
}

export interface FixtureEntry extends Observed {
  start: string;
  keys: string;
  settings: OracleSettings;
}

export interface FixtureFile {
  /** vim's version and patch level the answers came from */
  vim: string;
  cases: Record<string, FixtureEntry>;
}

export function settingsOf(c: Pick<OracleCase, "settings">): OracleSettings {
  return { ...DEFAULT_SETTINGS, ...c.settings };
}

const ID = /^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/;
const NOT_ASCII = /[^\t\n -~]/;

export function caseProblems(c: OracleCase): string[] {
  const p: string[] = [];
  if (!ID.test(c.id)) p.push("id must be kebab-case (ASCII letters and digits)");
  if (c.start.endsWith("\n")) p.push("start must not end with a newline");
  if (NOT_ASCII.test(c.start)) p.push("start must be printable ASCII, tab and newline");
  if (NOT_ASCII.test(c.keys) || c.keys.includes("\t") || c.keys.includes("\n")) {
    p.push("keys must be printable ASCII; write <Tab>, <CR>");
  }
  const s = settingsOf(c);
  if (![2, 4, 8].includes(s.tabSize)) p.push("tabSize must be 2, 4 or 8");
  if (!["  ", "    ", "\t"].includes(s.indentUnit))
    p.push("indentUnit must be 2/4 spaces or a tab");
  try {
    if (parseKeys(c.keys).length === 0) p.push("keys must not be empty");
  } catch (e) {
    p.push(`keys: ${e instanceof Error ? e.message : String(e)}`);
  }
  return p;
}

export function defineCases(cases: OracleCase[]): readonly OracleCase[] {
  const seen = new Set<string>();
  for (const c of cases) {
    const problems = caseProblems(c);
    if (seen.has(c.id)) problems.push("duplicate id");
    seen.add(c.id);
    if (problems.length > 0) throw new Error(`oracle case ${c.id}: ${problems.join("; ")}`);
  }
  return cases;
}
