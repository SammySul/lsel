/** A level curve: the next level costs round(base × growth^(level − 1)), up to level `max`. */
export function curve(base: number, growth: number, max: number) {
  const forNext = (level: number) => Math.round(base * growth ** (level - 1));
  // reach[n] is the total XP at which level n + 1 starts
  const reach: number[] = [0];
  for (let level = 1, total = 0; level < max; level++) {
    total += forNext(level);
    reach.push(total);
  }
  return {
    max,
    forNext,
    levelOf(xp: number): number {
      let level = 1;
      while (level < max && xp >= (reach[level] ?? Number.POSITIVE_INFINITY)) level++;
      return level;
    },
    /** Total XP at which the level after `level` starts, or null at the cap. */
    toReachNext: (level: number): number | null => reach[level] ?? null,
    /** Total XP at which the last level starts. */
    total: reach[max - 1] ?? 0,
  };
}

/** Department levels: 1 to 99, about 6.8 million XP in all. */
export const LEVELS = curve(60, 1.1, 99);
