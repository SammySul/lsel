// The daily puzzle: which day it is, its puzzle, and the result a player sends the board.
import * as v from "valibot";
import { Entry, LIMITS, Name } from "./protocol.ts";
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

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * Day `day`'s puzzle: a fixed stride through the easy and medium ones by id, so no puzzle comes
 * back before every other one has had its day. A deploy that changes the pool reshuffles the days ahead.
 */
export function dailyPuzzle<P extends { readonly id: string; readonly difficulty: string }>(
  pool: Iterable<P>,
  day: number,
): P {
  const byId = [...pool]
    .filter((p) => p.difficulty !== "hard")
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const n = byId.length;
  if (n === 0) throw new Error("no puzzles");
  let stride = Math.max(1, Math.floor(n * 0.618));
  while (gcd(stride, n) !== 1) stride++;
  const at = (((day * stride) % n) + n) % n;
  return byId[at] as P;
}

export const PlayerId = v.pipe(v.string(), v.regex(/^[0-9a-f]{32}$/, "not a player id"));

/** A locked-in daily run: the server replays `log` against the day's puzzle before it counts. */
export const DailyClaim = v.strictObject({
  day: v.pipe(v.number(), v.integer(), v.minValue(1)),
  player: PlayerId,
  name: Name,
  log: v.pipe(v.array(Entry), v.minLength(1), v.maxLength(LIMITS.logEntries)),
  ms: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(ROUND.capMs)),
});
export type DailyClaim = v.InferOutput<typeof DailyClaim>;

/** `raw` as a claim, or null when it isn't one. */
export function parseDailyClaim(raw: unknown): DailyClaim | null {
  const r = v.safeParse(DailyClaim, raw);
  return r.success ? r.output : null;
}

/** Whether `id` can be a player id (the board's `?player=`). */
export const isPlayerId = (id: unknown): id is string => v.is(PlayerId, id);

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
