import { createSession, destroySession, feedKey, type Puzzle, parseKeys } from "../src/index.ts";
import { observe } from "./observe.ts";
import { type Observed, type OracleCase, settingsOf } from "./types.ts";

/** A puzzle around `start` for tests; its target never equals a buffer unless `over` sets one. */
export function testPuzzle(start: string, over: Partial<Puzzle> = {}): Puzzle {
  return {
    id: "test",
    title: "test",
    difficulty: "easy",
    language: "text",
    tabSize: 4,
    indentUnit: "  ",
    start,
    target: "\u0000unreachable",
    solution: [],
    par: 0,
    source: { kind: "original", author: "test" },
    ...over,
  };
}

/** A puzzle around a case; it may break puzzle limits (start === target is fine here). */
export function puzzleOf(c: Pick<OracleCase, "id" | "start" | "settings">): Puzzle {
  const { tabSize, indentUnit } = settingsOf(c);
  return testPuzzle(c.start, { id: `oracle-${c.id}`, title: c.id, tabSize, indentUnit });
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
