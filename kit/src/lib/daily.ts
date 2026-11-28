// A daily: which day it is, midnight to midnight UTC, the day's pick from an append-only schedule, and the shape of its board.

const DAY_MS = 86_400_000;

export interface Calendar {
  /** when day 1 starts */
  readonly epoch: number;
  readonly dayMs: number;
  /** the day's number at `ms`: 1 on the first day */
  dayOf(ms: number): number;
  /** how long until the next day starts */
  msUntilNextDay(ms: number): number;
}

/** Days counted from `epoch`, a UTC midnight, so everyone has the same day at once. */
export function calendar(epoch: number): Calendar {
  const dayOf = (ms: number) => Math.floor((ms - epoch) / DAY_MS) + 1;
  return {
    epoch,
    dayMs: DAY_MS,
    dayOf,
    msUntilNextDay: (ms) => epoch + dayOf(ms) * DAY_MS - ms,
  };
}

/** Day `day`'s item from `pool`, its id the day's place in `order`; past the end it starts over. None when the pool lacks it. */
export function scheduled<P extends { readonly id: string }>(
  pool: Iterable<P>,
  day: number,
  order: readonly string[],
): P | undefined {
  if (order.length === 0) return undefined;
  const id = order[(((day - 1) % order.length) + order.length) % order.length];
  for (const p of pool) if (p.id === id) return p;
  return undefined;
}

/** A run on a day's board, as the page shows it. */
export interface BoardEntry {
  readonly rank: number;
  readonly name: string;
  readonly score: number;
  readonly ms: number;
  readonly you: boolean;
}

/** The day's board: the top runs and, when the asker has one outside them, theirs. */
export interface DayBoard {
  readonly day: number;
  readonly puzzle: string;
  readonly players: number;
  readonly top: readonly BoardEntry[];
  readonly you: BoardEntry | null;
}
