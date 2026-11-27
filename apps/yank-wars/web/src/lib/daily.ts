// Today's daily: its number and puzzle, the streak, the share line, and the board's two calls.
import { duration } from "@sammysul/lsel/format";
import {
  type DailyBoard,
  type DailyClaim,
  dailyPuzzle,
  dayOf,
  type Puzzle,
} from "@yank-wars/engine";

export interface Daily {
  readonly day: number;
  readonly puzzle: Puzzle;
}

/** The daily at `now`, from `pool`: the same puzzle the server picks, for everyone; none when the pool lacks it. */
export function dailyAt(pool: readonly Puzzle[], now: number): Daily | undefined {
  const day = dayOf(now);
  const puzzle = dailyPuzzle(pool, day);
  return puzzle === undefined ? undefined : { day, puzzle };
}

/** Days in a row solved, up to today; a streak whose last day was yesterday is still alive. */
export function streakOf(solved: readonly number[], today: number): number {
  const days = new Set(solved);
  let day = days.has(today) ? today : today - 1;
  let streak = 0;
  while (days.has(day)) {
    streak++;
    day--;
  }
  return streak;
}

/** What Share copies after a daily. */
export function dailyShareText(
  daily: Daily,
  keys: number,
  ms: number,
  streak: number,
  origin: string,
): string {
  return [
    `Yank Wars daily #${daily.day} · ${daily.puzzle.title}`,
    `${keys} keys, par ${daily.puzzle.par} · ${duration(ms, "m:ss.t")}${streak > 1 ? ` · ${streak}-day streak` : ""}`,
    `${origin}/#/daily`,
  ].join("\n");
}

export type BoardAnswer = { ok: true; board: DailyBoard } | { ok: false; error: string };

async function answer(res: Promise<Response>): Promise<BoardAnswer> {
  try {
    const r = await res;
    const body: unknown = await r.json();
    if (r.ok) return { ok: true, board: body as DailyBoard };
    const error = (body as { error?: unknown }).error;
    return { ok: false, error: typeof error === "string" ? error : `error ${r.status}` };
  } catch {
    return { ok: false, error: "the board is unreachable" };
  }
}

export const fetchBoard = (): Promise<BoardAnswer> => answer(fetch("/api/daily"));

export const sendRun = (claim: DailyClaim): Promise<BoardAnswer> =>
  answer(
    fetch("/api/daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(claim),
    }),
  );
