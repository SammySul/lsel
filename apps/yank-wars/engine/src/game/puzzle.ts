// The puzzle schema, its parser and the rules every puzzle file must follow.

import * as v from "valibot";
import { parseKeys, type VimKey } from "../input/keys.ts";

export type LanguageId =
  | "text"
  | "javascript"
  | "typescript"
  | "jsx"
  | "tsx"
  | "python"
  | "go"
  | "rust"
  | "json"
  | "css";

export interface PuzzleSource {
  kind: "original";
  author: string;
}

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export interface Puzzle {
  id: string;
  title: string;
  difficulty: Difficulty;
  description?: string;
  language: LanguageId;
  tabSize: number;
  indentUnit: string;
  start: string;
  target: string;
  solution: VimKey[];
  par: number;
  source: PuzzleSource;
  tags?: string[];
}

export interface PuzzleJson {
  id: string;
  title: string;
  difficulty: Difficulty;
  description?: string;
  language: LanguageId;
  tabSize: 2 | 4 | 8;
  indentUnit: "  " | "    " | "\t";
  start: string;
  target: string;
  solution: string;
  source: PuzzleSource;
  tags?: string[];
}

export const PUZZLE_LIMITS = { maxLines: 30, maxLineLength: 120, maxChars: 3000 } as const;

const NOT_PRINTABLE = /[^\t\n\r -~]/;

function longestLine(s: string): { line: number; length: number } {
  let best = { line: 1, length: 0 };
  s.split("\n").forEach((l, i) => {
    if (l.length > best.length) best = { line: i + 1, length: l.length };
  });
  return best;
}

const Text = v.pipe(
  v.string(),
  v.check((s) => !s.includes("\r"), "must use LF line endings (found \\r)"),
  v.check(
    (s) => !s.endsWith("\n"),
    "must not end with a newline (the editor has no final line terminator)",
  ),
  v.check(
    (s) => s.split("\n").length <= PUZZLE_LIMITS.maxLines,
    (i) => `has ${i.input.split("\n").length} lines (max ${PUZZLE_LIMITS.maxLines})`,
  ),
  v.check(
    (s) => longestLine(s).length <= PUZZLE_LIMITS.maxLineLength,
    (i) => {
      const l = longestLine(i.input);
      return `line ${l.line} is ${l.length} chars (max ${PUZZLE_LIMITS.maxLineLength}; nothing wraps)`;
    },
  ),
  v.check(
    (s) => s.length <= PUZZLE_LIMITS.maxChars,
    (i) => `is ${i.input.length} chars (max ${PUZZLE_LIMITS.maxChars})`,
  ),
  v.check(
    (s) => !NOT_PRINTABLE.test(s),
    (i) => {
      const at = i.input.search(NOT_PRINTABLE);
      return `has ${JSON.stringify(i.input[at])} at offset ${at}: only printable ASCII, tab and newline are allowed`;
    },
  ),
);

const Notation = v.pipe(
  v.string(),
  v.rawCheck(({ dataset, addIssue }) => {
    if (!dataset.typed) return;
    try {
      parseKeys(dataset.value);
    } catch (e) {
      addIssue({ message: e instanceof Error ? e.message : String(e) });
    }
  }),
);

const NonEmpty = v.pipe(v.string(), v.nonEmpty("must not be empty"));

const Source = v.strictObject({ kind: v.literal("original"), author: NonEmpty });

export const PuzzleJsonSchema: v.GenericSchema<unknown, PuzzleJson> = v.pipe(
  v.strictObject({
    id: v.pipe(
      v.string(),
      v.minLength(3),
      v.maxLength(40),
      v.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be lower-case kebab-case"),
    ),
    title: v.pipe(v.string(), v.minLength(1), v.maxLength(60)),
    difficulty: v.picklist(DIFFICULTIES),
    description: v.exactOptional(v.pipe(v.string(), v.maxLength(200))),
    language: v.picklist([
      "text",
      "javascript",
      "typescript",
      "jsx",
      "tsx",
      "python",
      "go",
      "rust",
      "json",
      "css",
    ]),
    tabSize: v.picklist([2, 4, 8]),
    indentUnit: v.picklist(["  ", "    ", "\t"]),
    start: Text,
    target: v.pipe(Text, v.nonEmpty("must not be empty")),
    solution: Notation,
    source: Source,
    tags: v.exactOptional(v.array(NonEmpty)),
  }),
  v.forward(
    v.partialCheck([["start"], ["target"]], (p) => p.start !== p.target, "must differ from start"),
    ["target"],
  ),
  v.forward(
    v.partialCheck(
      [["indentUnit"], ["start"]],
      (p) => p.indentUnit === "\t" || !p.start.includes("\t"),
      'has a tab, which needs indentUnit "\\t"',
    ),
    ["start"],
  ),
  v.forward(
    v.partialCheck(
      [["indentUnit"], ["target"]],
      (p) => p.indentUnit === "\t" || !p.target.includes("\t"),
      'has a tab, which needs indentUnit "\\t"',
    ),
    ["target"],
  ),
);

export class PuzzleError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(issues.join("\n"));
    this.name = "PuzzleError";
  }
}

export function parsePuzzle(json: unknown, expectedId?: string): Puzzle {
  const r = v.safeParse(PuzzleJsonSchema, json);
  if (!r.success) {
    throw new PuzzleError(r.issues.map((i) => `${v.getDotPath(i) ?? "(root)"}: ${i.message}`));
  }
  const p = r.output;
  if (expectedId !== undefined && p.id !== expectedId) {
    throw new PuzzleError([`id: "${p.id}" does not match the file name "${expectedId}"`]);
  }
  const solution = parseKeys(p.solution);
  return {
    id: p.id,
    title: p.title,
    difficulty: p.difficulty,
    ...(p.description === undefined ? {} : { description: p.description }),
    language: p.language,
    tabSize: p.tabSize,
    indentUnit: p.indentUnit,
    start: p.start,
    target: p.target,
    solution,
    par: solution.length,
    source: p.source,
    ...(p.tags === undefined ? {} : { tags: p.tags }),
  };
}

/** List order: easiest first, then shortest par, then title. */
export function comparePuzzles(a: Puzzle, b: Puzzle): number {
  return (
    DIFFICULTIES.indexOf(a.difficulty) - DIFFICULTIES.indexOf(b.difficulty) ||
    a.par - b.par ||
    a.title.localeCompare(b.title)
  );
}
