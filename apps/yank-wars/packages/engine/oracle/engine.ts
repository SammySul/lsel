import { createSession, destroySession, feedKey, type Puzzle, parseKeys } from "../src/index.ts";
import { observe } from "./observe.ts";
import { type Observed, type OracleCase, settingsOf } from "./types.ts";

// Never equals a buffer, so feedKey never stops at "solved".
const UNREACHABLE = "\u0000unreachable";

/** A puzzle around a case; it may break puzzle limits (start === target is fine here). */
export function puzzleOf(c: Pick<OracleCase, "id" | "start" | "settings">): Puzzle {
  const s = settingsOf(c);
  return {
    id: `oracle-${c.id}`,
    title: c.id,
    difficulty: "easy",
    language: "text",
    tabSize: s.tabSize,
    indentUnit: s.indentUnit,
    start: c.start,
    target: UNREACHABLE,
    solution: [],
    par: 0,
    source: { kind: "original", author: "oracle" },
  };
}

export interface EngineRun extends Observed {
  errors: { index: number; message: string }[];
}

/** replay() with stopAtSolve false, keeping the session long enough to read the cursor. */
export function replayCase(
  c: OracleCase,
  opts: { parent?: HTMLElement; beforeKey?(index: number): void } = {},
): EngineRun {
  const s = createSession(puzzleOf(c), { parent: opts.parent ?? document.body });
  const errors: { index: number; message: string }[] = [];
  try {
    for (const [i, key] of parseKeys(c.keys).entries()) {
      opts.beforeKey?.(i);
      const r = feedKey(s, key);
      if (r.error !== null) errors.push({ index: i, message: r.error });
    }
    return { ...observe(s), errors };
  } finally {
    destroySession(s);
  }
}
