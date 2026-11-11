import type { VimKey } from "./keys.ts";
import { type KeyLog, RESET } from "./log.ts";

export const ROUND = { studyMs: 5_000, capMs: 240_000 } as const;

export type RoundPhase = "study" | "playing" | "locked" | "forfeited" | "expired";

export interface RoundState {
  readonly phase: RoundPhase;
  readonly createdAt: number;
  readonly studyEndsAt: number;
  readonly startedAt: number | null;
  readonly endsAt: number | null;
  readonly finishedAt: number | null;
  readonly log: KeyLog;
  readonly runs: number;
  readonly capMs: number;
}

export type RoundEvent =
  | { type: "tick" }
  | { type: "ready" }
  | { type: "key"; key: VimKey; solved: boolean }
  | { type: "reset" }
  | { type: "forfeit" };

export type RoundConfig = { readonly [K in keyof typeof ROUND]: number };

export function createRound(now: number, cfg?: Partial<RoundConfig>): RoundState {
  const { studyMs, capMs } = { ...ROUND, ...cfg };
  return {
    phase: "study",
    createdAt: now,
    studyEndsAt: now + studyMs,
    startedAt: null,
    endsAt: null,
    finishedAt: null,
    log: [],
    runs: 1,
    capMs,
  };
}

export function reduceRound(s: RoundState, e: RoundEvent, now: number): RoundState {
  if (s.phase === "study") {
    if (e.type === "ready" || (e.type === "tick" && now >= s.studyEndsAt)) {
      return { ...s, phase: "playing", startedAt: now, endsAt: now + s.capMs };
    }
    return s;
  }
  if (s.phase !== "playing") return s;
  // A key that arrives after the cap (throttled rAF, background tab) must not count or lock in.
  if (s.endsAt !== null && now >= s.endsAt) {
    return { ...s, phase: "expired", finishedAt: s.endsAt };
  }
  switch (e.type) {
    case "key":
      return e.solved
        ? { ...s, log: [...s.log, e.key], phase: "locked", finishedAt: now }
        : { ...s, log: [...s.log, e.key] };
    case "reset":
      return { ...s, log: [...s.log, RESET], runs: s.runs + 1 };
    case "forfeit":
      return { ...s, phase: "forfeited", finishedAt: now };
    case "tick":
    case "ready":
      return s;
  }
}

export function elapsedMs(s: RoundState, now: number): number {
  if (s.startedAt === null) return 0;
  return (s.finishedAt ?? now) - s.startedAt;
}

export function remainingMs(s: RoundState, now: number): number {
  if (s.phase !== "playing" || s.endsAt === null) return 0;
  return Math.max(0, s.endsAt - now);
}
