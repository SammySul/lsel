import type { VimKey } from "./keys.ts";

export const RESET = "<Reset>" as const;
export type ResetMarker = typeof RESET;
export type LogEntry = VimKey | ResetMarker;
export type KeyLog = readonly LogEntry[];

export function isReset(e: LogEntry): e is ResetMarker {
  return e === RESET;
}

export function currentRun(log: KeyLog): VimKey[] {
  return log.slice(log.lastIndexOf(RESET) + 1).filter((e): e is VimKey => !isReset(e));
}

export function scoreOf(log: KeyLog): number {
  return log.length - 1 - log.lastIndexOf(RESET);
}
