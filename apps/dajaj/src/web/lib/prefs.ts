import { STATS, type Stat } from "../../shared/stats.ts";

export const VIEWS = ["table", "bar", "line", "pie"] as const;
export type View = (typeof VIEWS)[number];

export interface Prefs {
  players: string[];
  view: View;
  stat: Stat;
}

const KEY = "dajaj:prefs:v1";

export type PrefsStorage = Pick<Storage, "getItem" | "setItem">;

/** The stored choices, limited to players that still exist; anything unreadable falls back to everyone, the table, kills. */
export function readPrefs(storage: PrefsStorage | undefined, available: readonly string[]): Prefs {
  const fallback: Prefs = { players: [...available], view: "table", stat: "kills" };
  let data: unknown;
  try {
    data = JSON.parse(storage?.getItem(KEY) ?? "null");
  } catch {
    return fallback;
  }
  if (typeof data !== "object" || data === null) return fallback;
  const { players, view, stat } = data as Record<string, unknown>;
  const kept = Array.isArray(players) ? available.filter((p) => players.includes(p)) : [];
  return {
    players: kept.length > 0 ? kept : fallback.players,
    view: (VIEWS as readonly unknown[]).includes(view) ? (view as View) : fallback.view,
    stat: (STATS as readonly unknown[]).includes(stat) ? (stat as Stat) : fallback.stat,
  };
}

export function writePrefs(storage: PrefsStorage | undefined, prefs: Prefs): void {
  try {
    storage?.setItem(KEY, JSON.stringify(prefs));
  } catch {}
}
