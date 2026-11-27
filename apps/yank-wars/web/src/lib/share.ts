// The share line the result card copies.

import { duration } from "@sammysul/lsel";
import type { Puzzle } from "@yank-wars/engine";

/** What `y` on the result card copies: puzzle, score against par, time and a link back. */
export function shareText(puzzle: Puzzle, keys: number, ms: number, origin: string): string {
  return [
    `Yank Wars · ${puzzle.title}`,
    `${keys} keys, par ${puzzle.par} · ${duration(ms, "m:ss.t")}`,
    `${origin}/#/p/${puzzle.id}`,
  ].join("\n");
}
