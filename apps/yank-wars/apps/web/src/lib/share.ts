import type { Puzzle } from "@yank-wars/engine";
import { formatClock } from "./clock.ts";

/** What `y` on the result card copies: puzzle, score against par, time and a link back. */
export function shareText(puzzle: Puzzle, keys: number, ms: number, origin: string): string {
  return [
    `Yank Wars · ${puzzle.title}`,
    `${keys} keys, par ${puzzle.par} · ${formatClock(ms)}`,
    `${origin}/#/p/${puzzle.id}`,
  ].join("\n");
}
