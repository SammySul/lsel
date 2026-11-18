import { ACTIONS } from "../content/actions.ts";
import { CREW_IDS } from "../content/crew.ts";
import { type GameEvent, NO_EVENTS } from "./events.ts";
import { levelOf } from "./levels.ts";
import type { GameState } from "./state.ts";

export const TICK_MS = 200;

/** The only function that advances a game: one fixed step of TICK_MS. Returns what happened in it. */
export function tick(state: GameState): readonly GameEvent[] {
  let events: GameEvent[] | undefined;
  state.ticks++;
  for (const crew of CREW_IDS) {
    const job = state.jobs[crew];
    if (job === undefined) continue;
    const action = ACTIONS[job.action];
    job.progressMs += TICK_MS;
    while (job.progressMs >= action.durationMs) {
      job.progressMs -= action.durationMs;
      for (const { item, amount } of action.outputs) {
        state.items[item] = (state.items[item] ?? 0) + amount;
      }
      const before = state.xp[action.department] ?? 0;
      const after = before + action.xp;
      state.xp[action.department] = after;
      events ??= [];
      events.push({ kind: "action-done", crew, action: job.action });
      const level = levelOf(after);
      if (level > levelOf(before)) {
        events.push({ kind: "level-up", department: action.department, level });
      }
    }
  }
  return events ?? NO_EVENTS;
}
