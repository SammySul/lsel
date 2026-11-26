import { type Difficulty, type Puzzle, parsePuzzle } from "@yank-wars/engine";
import { handmade } from "./handmade.macro.ts" with { type: "macro" };
import type { Pick } from "./room.ts";

export const PUZZLES: ReadonlyMap<string, Puzzle> = new Map(
  handmade().map(({ file, json }) => {
    const p = parsePuzzle(json, file.replace(/\.json$/, ""));
    return [p.id, p];
  }),
);

/** A random puzzle at `difficulty` the room hasn't played; once none is left, any at that difficulty. */
export function picker(
  pool: ReadonlyMap<string, Puzzle>,
  random: () => number = Math.random,
): Pick {
  return (difficulty: Difficulty | null, played: readonly string[]) => {
    const fits = [...pool.values()].filter(
      (p) => difficulty === null || p.difficulty === difficulty,
    );
    const fresh = fits.filter((p) => !played.includes(p.id));
    const from = fresh.length > 0 ? fresh : fits;
    const p = from[Math.floor(random() * from.length)];
    if (p === undefined) throw new Error(`no ${difficulty ?? ""} puzzles`);
    return p.id;
  };
}
