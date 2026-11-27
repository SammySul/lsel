// Appends every easy or medium puzzle the daily schedule lacks, shuffled, after its last day: bun run daily
import { join } from "node:path";
import { parsePuzzle, SCHEDULE } from "../src/index.ts";

const root = join(import.meta.dir, "../../puzzles");
const files = [...new Bun.Glob("*.json").scanSync({ cwd: join(root, "handmade") })];
const puzzles = await Promise.all(
  files.map(async (f) =>
    parsePuzzle(await Bun.file(join(root, "handmade", f)).json(), f.slice(0, -".json".length)),
  ),
);
const due = new Set(puzzles.filter((p) => p.difficulty !== "hard").map((p) => p.id));
const stray = SCHEDULE.filter((id) => !due.has(id));
if (stray.length > 0) {
  // removing a day shifts every day after it, today's included: swap in a new puzzle at the same place instead
  console.error(`scheduled but not an easy or medium puzzle: ${stray.join(", ")}`);
  process.exit(1);
}
const fresh = [...due].filter((id) => !SCHEDULE.includes(id));
for (let i = fresh.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [fresh[i], fresh[j]] = [fresh[j] as string, fresh[i] as string];
}
await Bun.write(join(root, "daily.json"), `${JSON.stringify([...SCHEDULE, ...fresh], null, 2)}\n`);
console.log(`daily: ${fresh.length} added, ${SCHEDULE.length + fresh.length} days scheduled`);
