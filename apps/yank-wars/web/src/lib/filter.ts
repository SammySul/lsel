import type { Difficulty, Puzzle } from "@yank-wars/engine";

export interface PuzzleFilter {
  readonly difficulty: Difficulty | null;
  readonly unsolved: boolean;
  readonly query: string;
}

export const NO_FILTER: PuzzleFilter = { difficulty: null, unsolved: false, query: "" };

/** Every word of the query must appear in the title, language, description or a tag. */
export function matchesFilter(p: Puzzle, f: PuzzleFilter, solved: boolean): boolean {
  if (f.difficulty !== null && p.difficulty !== f.difficulty) return false;
  if (f.unsolved && solved) return false;
  const haystack = [p.title, p.language, p.description ?? "", ...(p.tags ?? [])]
    .join(" ")
    .toLowerCase();
  return f.query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w !== "")
    .every((w) => haystack.includes(w));
}

export function filterPuzzles(
  list: readonly Puzzle[],
  f: PuzzleFilter,
  solved: (id: string) => boolean,
): Puzzle[] {
  return list.filter((p) => matchesFilter(p, f, solved(p.id)));
}

/** The next puzzle after `id` in list order that the filter shows, wrapping; the whole list when it shows nothing else. */
export function nextAfter(
  list: readonly Puzzle[],
  visible: readonly Puzzle[],
  id: string,
): Puzzle | undefined {
  const others = visible.filter((p) => p.id !== id);
  const pool = new Set(others.length > 0 ? others : list.filter((p) => p.id !== id));
  const at = list.findIndex((p) => p.id === id);
  for (let k = 1; k <= list.length; k++) {
    const p = list[(at + k + list.length) % list.length];
    if (p !== undefined && pool.has(p)) return p;
  }
  return undefined;
}
