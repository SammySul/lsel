import { type Puzzle, parsePuzzle } from "@yank-wars/engine";
import { handmade } from "./handmade.macro.ts" with { type: "macro" };
import type { Pick } from "./room.ts";

export const PUZZLES: ReadonlyMap<string, Puzzle> = new Map(
  handmade().map(({ file, json }) => {
    const p = parsePuzzle(json, file.replace(/\.json$/, ""));
    return [p.id, p];
  }),
);

/** A random puzzle the room hasn't played, so the pool's mix of difficulties is the odds; once all were played, any. */
export function picker(
  pool: ReadonlyMap<string, Puzzle>,
  random: () => number = Math.random,
): Pick {
  return (played: readonly string[]) => {
    const all = [...pool.keys()];
    const fresh = all.filter((id) => !played.includes(id));
    const from = fresh.length > 0 ? fresh : all;
    const id = from[Math.floor(random() * from.length)];
    if (id === undefined) throw new Error("no puzzles");
    return id;
  };
}
