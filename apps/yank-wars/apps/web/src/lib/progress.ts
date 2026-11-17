import type { Puzzle } from "@yank-wars/engine";
import type { Best } from "./prefsStorage.ts";

export type Mark = "under" | "par" | "over";

/** Fewer keys than par is under par, as in golf. */
export function markOf(best: Best, par: number): Mark {
  if (best.keys < par) return "under";
  return best.keys === par ? "par" : "over";
}

export interface Progress {
  readonly solved: number;
  readonly parOrBetter: number;
}

export function progressOf(
  puzzles: readonly Puzzle[],
  best: Readonly<Record<string, Best>>,
): Progress {
  let solved = 0;
  let parOrBetter = 0;
  for (const p of puzzles) {
    const b = best[p.id];
    if (b === undefined) continue;
    solved++;
    if (markOf(b, p.par) !== "over") parOrBetter++;
  }
  return { solved, parOrBetter };
}
