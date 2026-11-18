export const MAX_LEVEL = 99;

/** XP needed to go from `level` to the next one. */
export function xpForNext(level: number): number {
  return Math.round(60 * 1.1 ** (level - 1));
}

/** REACH[n] is the total XP at which level n + 1 starts. */
const REACH: number[] = [0];
for (let level = 1, total = 0; level < MAX_LEVEL; level++) {
  total += xpForNext(level);
  REACH.push(total);
}

export function levelOf(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= (REACH[level] ?? Number.POSITIVE_INFINITY)) level++;
  return level;
}

/** Total XP at which the level after `level` starts, or null at the cap. */
export function xpToReachNext(level: number): number | null {
  return REACH[level] ?? null;
}
