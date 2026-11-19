import { persisted } from "@sammysul/lsel";
import * as v from "valibot";
import { STATS } from "../../shared/stats.ts";

export const VIEWS = [
  { id: "table", label: "Table" },
  { id: "bar", label: "Bar" },
  { id: "line", label: "Line" },
  { id: "pie", label: "Pie" },
] as const;

export const Prefs = v.object({
  players: v.fallback(v.array(v.string()), []),
  view: v.fallback(v.picklist(VIEWS.map((x) => x.id)), "table"),
  stat: v.fallback(v.picklist(STATS), "kills"),
});

export const prefs = persisted("dajaj:prefs:v1", Prefs, {
  players: [],
  view: "table",
  stat: "kills",
});

/** The stored players that still exist, in the configured order; with none left, everyone. */
export function choosePlayers(stored: readonly string[], available: readonly string[]): string[] {
  const kept = available.filter((p) => stored.includes(p));
  return kept.length > 0 ? kept : [...available];
}
