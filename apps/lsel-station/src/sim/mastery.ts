import { curve } from "./levels.ts";

/** Item mastery: 1 to 99, gentler than department levels. One second of an action is one mastery XP. */
export const MASTERY = curve(6, 1.08, 99);

/** The mastery levels at which an item's bonus grows, and the chance it gives from each. */
export const MASTERY_STEPS: readonly { readonly level: number; readonly chance: number }[] = [
  { level: 10, chance: 0.05 },
  { level: 25, chance: 0.1 },
  { level: 50, chance: 0.15 },
  { level: 75, chance: 0.2 },
  { level: 99, chance: 0.3 },
];

/** The chance an item's mastery level gives in its department's style. */
export function masteryChance(level: number): number {
  let chance = 0;
  for (const step of MASTERY_STEPS) if (level >= step.level) chance = step.chance;
  return chance;
}

export const isMasteryStep = (level: number) => MASTERY_STEPS.some((s) => s.level === level);

/** The share of every mastery XP that also goes to the department's pool. */
export const POOL_SHARE = 0.5;

/** A pool is full at this share of all its items' mastery to 99. */
export const POOL_FILL = 0.5;

/** How full a pool must be for each department-wide bonus. */
export const POOL_CHECKPOINTS: readonly {
  readonly share: number;
  readonly kind: "speed" | "chance";
  readonly bonus: number;
}[] = [
  { share: 0.1, kind: "speed", bonus: 0.03 },
  { share: 0.25, kind: "chance", bonus: 0.05 },
  { share: 0.5, kind: "speed", bonus: 0.05 },
  { share: 0.95, kind: "chance", bonus: 0.1 },
];
