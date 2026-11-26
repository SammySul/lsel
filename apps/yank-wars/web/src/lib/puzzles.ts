// The puzzle files bundled into the web app, parsed once.

import { comparePuzzles, type Puzzle, parsePuzzle } from "@yank-wars/engine";
import { filterPuzzles, nextAfter } from "./filter.ts";
import { prefs } from "./prefs.svelte.ts";

interface PuzzleLoadError {
  readonly file: string;
  readonly message: string;
}

const files = import.meta.glob("../../../puzzles/handmade/*.json", {
  eager: true,
  import: "default",
});

const loaded: Puzzle[] = [];
const failed: PuzzleLoadError[] = [];
for (const [path, json] of Object.entries(files)) {
  const file = path.slice(path.lastIndexOf("/") + 1);
  try {
    loaded.push(parsePuzzle(json, file.replace(/\.json$/, "")));
  } catch (e) {
    failed.push({ file, message: e instanceof Error ? e.message : String(e) });
  }
}

export const puzzles: readonly Puzzle[] = loaded.sort(comparePuzzles);
export const puzzleErrors: readonly PuzzleLoadError[] = failed;

export function findPuzzle(id: string): Puzzle | undefined {
  return puzzles.find((p) => p.id === id);
}

/** The puzzles the list's filter shows, in list order. */
export function visiblePuzzles(): Puzzle[] {
  return filterPuzzles(puzzles, prefs.filter, (id) => prefs.best[id] !== undefined);
}

/** Next in list order among the filtered puzzles; the whole list when the filter shows no other. */
export function nextPuzzle(id: string): Puzzle | undefined {
  return nextAfter(puzzles, visiblePuzzles(), id);
}
