// The daily puzzle: which day it is, its puzzle, and the result a player sends the board.
import * as v from "valibot";
import schedule from "../../../puzzles/daily.json";
import { Entry, LIMITS } from "./protocol.ts";
import { ROUND } from "./round.ts";

export const DAILY = {
  /** day 1 starts here; a day runs midnight to midnight UTC, so everyone has the same puzzle */
  epoch: Date.UTC(2026, 10, 27),
  dayMs: 86_400_000,
  boardSize: 10,
} as const;

/** The daily's number at `ms`: 1 on the first day. */
export function dayOf(ms: number): number {
  return Math.floor((ms - DAILY.epoch) / DAILY.dayMs) + 1;
}

/** How long until the next daily starts. */
export function msUntilNextDay(ms: number): number {
  return DAILY.epoch + dayOf(ms) * DAILY.dayMs - ms;
}

/** The daily order, one puzzle id per day from day 1: append-only, so a deploy never moves a day that has begun. */
export const SCHEDULE: readonly string[] = schedule;

/** Day `day`'s puzzle from `pool`; past the schedule's end it starts over. None when the pool lacks it. */
export function dailyPuzzle<P extends { readonly id: string }>(
  pool: Iterable<P>,
  day: number,
  order: readonly string[] = SCHEDULE,
): P | undefined {
  if (order.length === 0) return undefined;
  const id = order[(((day - 1) % order.length) + order.length) % order.length];
  for (const p of pool) if (p.id === id) return p;
  return undefined;
}

/** A locked-in daily run, sent signed in: the server replays `log` against the day's puzzle before it counts. */
export const DailyClaim = v.strictObject({
  day: v.pipe(v.number(), v.integer(), v.minValue(1)),
  log: v.pipe(v.array(Entry), v.minLength(1), v.maxLength(LIMITS.logEntries)),
  ms: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(ROUND.capMs)),
});
export type DailyClaim = v.InferOutput<typeof DailyClaim>;

/** `raw` as a claim, or null when it isn't one. */
export function parseDailyClaim(raw: unknown): DailyClaim | null {
  const r = v.safeParse(DailyClaim, raw);
  return r.success ? r.output : null;
}

export interface BoardEntry {
  readonly rank: number;
  readonly name: string;
  readonly keys: number;
  readonly ms: number;
  readonly you: boolean;
}

/** The day's board: the top runs and, when the asker has one outside them, theirs. */
export interface DailyBoard {
  readonly day: number;
  readonly puzzle: string;
  readonly players: number;
  readonly top: readonly BoardEntry[];
  readonly you: BoardEntry | null;
}
