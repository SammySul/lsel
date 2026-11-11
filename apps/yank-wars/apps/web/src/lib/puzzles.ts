import { type Puzzle, parsePuzzle } from "@yank-wars/engine";

export interface PuzzleLoadError {
  readonly file: string;
  readonly message: string;
}

const files = import.meta.glob("../../../../puzzles/handmade/*.json", {
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

export const puzzles: readonly Puzzle[] = loaded.sort((a, b) => a.title.localeCompare(b.title));
export const puzzleErrors: readonly PuzzleLoadError[] = failed;

export function findPuzzle(id: string): Puzzle | undefined {
  return puzzles.find((p) => p.id === id);
}

export function nextPuzzle(id: string): Puzzle | undefined {
  const i = puzzles.findIndex((p) => p.id === id);
  return puzzles[(i + 1) % puzzles.length];
}
