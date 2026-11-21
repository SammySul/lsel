import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defineCases, type OracleCase, type OracleSettings } from "../types.ts";

// Each handmade puzzle's reference solution, so vim confirms it reaches the target.
const DIR = join(import.meta.dir, "../../../puzzles/handmade");

export default defineCases(
  readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f): OracleCase => {
      const p = JSON.parse(readFileSync(join(DIR, f), "utf8")) as {
        id: string;
        start: string;
        solution: string;
        tabSize: OracleSettings["tabSize"];
        indentUnit: OracleSettings["indentUnit"];
      };
      return {
        id: `puzzle-${p.id}`,
        start: p.start,
        keys: p.solution,
        settings: { tabSize: p.tabSize, indentUnit: p.indentUnit },
      };
    }),
);
