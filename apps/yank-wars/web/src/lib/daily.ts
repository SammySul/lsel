// Today's daily: its number and puzzle, the streak, the share line, and the board's two calls.
import { duration, getJson } from "@sammysul/lsel";
import type { DayBoard } from "@sammysul/lsel/daily";
import { type DailyClaim, dailyPuzzle, dayOf, type Puzzle } from "@yank-wars/engine";

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

const WHO = "the board";

/** Today's board, with the asker's rank when signed in. */
export const fetchBoard = (signal: AbortSignal): Promise<DayBoard> =>
  getJson<DayBoard>("/api/daily", signal, WHO);

/** Puts a locked-in run on the board, which answers as `fetchBoard` does; fails with the server's reason. */
export async function sendRun(claim: DailyClaim): Promise<DayBoard> {
  let res: Response;
  try {
    res = await fetch("/api/daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(claim),
    });
  } catch {
    throw new Error(`${WHO} could not be reached`);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: unknown };
  if (!res.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `${WHO} answered ${res.status}`);
  }
  return body as DayBoard;
}
