// Runs at bundle time (imported `with { type: "macro" }`), so the compiled server carries every puzzle.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dir, "../../puzzles/handmade");

export function handmade(): { file: string; json: unknown }[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => ({ file, json: JSON.parse(readFileSync(join(DIR, file), "utf8")) }));
}
