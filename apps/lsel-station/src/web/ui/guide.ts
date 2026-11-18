import { MASTERY_STEPS, POOL_CHECKPOINTS, POOL_SHARE } from "../../sim/mastery.ts";
import { percent } from "./format.ts";

const list = (words: readonly string[]) =>
  words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;

/** How the game works, a line per idea, for the help panel; the numbers come from the rules themselves. */
export const GUIDE: readonly (readonly [string, string])[] = [
  [
    "Jobs",
    "Assign a crew member to a job and it runs on its own, while you are away too. One job each.",
  ],
  ["Waiting", "A job short of its inputs waits, and starts again by itself once they arrive."],
  ["Levels", "Every finished job gives its department xp. Levels open new jobs."],
  [
    "Mastery",
    `Each job has its own mastery, raised by doing it. At ${list(
      MASTERY_STEPS.map((step) => String(step.level)),
    )} it gives a bigger chance of a double, a kept input or double credits, by department.`,
  ],
  [
    "Pool",
    `${percent(POOL_SHARE)} of mastery xp also fills the department's pool. At ${list(
      POOL_CHECKPOINTS.map((checkpoint) => percent(checkpoint.share)),
    )} full the whole department gets faster or luckier, and pressing p spends it on one job's mastery.`,
  ],
  [
    "Modules",
    "Construction builds and raises station modules. Each opens or improves something, and none goes above the Core's level.",
  ],
  [
    "Map",
    "Survey charts sectors. A claim beacon from Construction takes an empty one, and the faction markets you find open Trade routes.",
  ],
  [
    "Outposts",
    "Every claimed sector gets one. It works with nobody assigned: pick what it does, and install kits from Construction.",
  ],
];
