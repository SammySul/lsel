import { feedKey } from "./feedKey.ts";
import type { VimKey } from "./keys.ts";
import { currentRun, type KeyLog } from "./log.ts";
import type { Puzzle } from "./puzzle.ts";
import { createSession, destroySession } from "./session.ts";
import { type HudState, sessionSnapshot } from "./snapshot.ts";

export interface ReplayResult {
  doc: string;
  solved: boolean;
  solvedAt: number | null;
  applied: number;
  errors: { index: number; message: string }[];
  hud: HudState;
}

export interface ReplayOptions {
  parent?: HTMLElement;
  /** default true */
  stopAtSolve?: boolean;
}

// Resets the process-global vim state: never call while a live session on the page still accepts keys.
export function replay(
  puzzle: Puzzle,
  keys: readonly VimKey[],
  opts: ReplayOptions = {},
): ReplayResult {
  const stopAtSolve = opts.stopAtSolve ?? true;
  const s = createSession(puzzle, { parent: opts.parent ?? document.body });
  const errors: { index: number; message: string }[] = [];
  let solvedAt: number | null = null;
  let applied = 0;
  try {
    for (const [i, key] of keys.entries()) {
      const r = feedKey(s, key);
      applied = i + 1;
      if (r.error !== null) errors.push({ index: i, message: r.error });
      if (r.solved && solvedAt === null) {
        solvedAt = i;
        if (stopAtSolve) break;
      }
    }
    return {
      doc: s.view.state.doc.toString(),
      solved: s.solved,
      solvedAt,
      applied,
      errors,
      hud: sessionSnapshot(s),
    };
  } finally {
    destroySession(s);
  }
}

export function verifyRun(
  puzzle: Puzzle,
  log: KeyLog,
  opts: Pick<ReplayOptions, "parent"> = {},
): { ok: boolean; score: number; result: ReplayResult } {
  const keys = currentRun(log);
  const result = replay(puzzle, keys, opts);
  return { ok: result.solvedAt === keys.length - 1, score: keys.length, result };
}
