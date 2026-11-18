import { ACTIONS, type Action } from "../content/actions.ts";
import { CREW_IDS } from "../content/crew.ts";
import type { GameState } from "./state.ts";

export const TICK_MS = 200;

function complete(state: GameState, action: Action): void {
  for (const { item, amount } of action.outputs) {
    state.items[item] = (state.items[item] ?? 0) + amount;
  }
  state.xp[action.department] = (state.xp[action.department] ?? 0) + action.xp;
}

/** The only function that advances a game: one fixed step of TICK_MS. */
export function tick(state: GameState): void {
  state.ticks++;
  for (const crew of CREW_IDS) {
    const job = state.jobs[crew];
    if (job === undefined) continue;
    const action = ACTIONS[job.action];
    job.progressMs += TICK_MS;
    while (job.progressMs >= action.durationMs) {
      job.progressMs -= action.durationMs;
      complete(state, action);
    }
  }
}
