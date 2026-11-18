import { ACTION_IDS, ACTIONS, type ActionId } from "../../content/actions.ts";
import { MODULES, type ModuleId, numeral } from "../../content/modules.ts";
import { speedOf } from "../../sim/rules.ts";
import type { Snapshot } from "../../sim/state.ts";
import { SITES } from "./layout.ts";

/** What the running jobs make the scene show. Every job shows up, and only running jobs do. */
export type Activity = {
  /** One drone per mining job, in roster order; `progress` is null while its job waits, so it stays docked. */
  readonly drones: readonly { readonly action: ActionId; readonly progress: number | null }[];
  readonly refining: boolean;
  /** Module projects: `active` ones have someone welding, the others are paused. */
  readonly building: readonly { readonly module: ModuleId; readonly active: boolean }[];
};

/** The scene's activity for a game, `sinceTickMs` after its last tick. */
export function activityOf(state: Snapshot, sinceTickMs: number): Activity {
  const drones: { action: ActionId; progress: number | null }[] = [];
  const building: { module: ModuleId; active: boolean }[] = [];
  let refining = false;
  for (const crew of state.crew) {
    const job = state.jobs[crew];
    if (job === undefined) continue;
    const action = ACTIONS[job.action];
    const working = job.phase === "working";
    if (action.result.kind === "module") {
      if (working) building.push({ module: action.result.module, active: true });
    } else if (SITES[job.action] !== undefined) {
      const done = job.progressMs + sinceTickMs * speedOf(state, crew, job.action);
      drones.push({
        action: job.action,
        progress: working ? Math.min(done / action.durationMs, 1) : null,
      });
    } else if (action.department === "refining" && working) refining = true;
  }
  for (const id of ACTION_IDS) {
    const { result } = ACTIONS[id];
    if (state.projects[id] !== undefined && result.kind === "module") {
      building.push({ module: result.module, active: false });
    }
  }
  return { drones, refining, building };
}

/** The scene in words, for anyone who cannot see it: nothing is shown only in the picture. */
export function describeScene(state: Snapshot): string {
  const { drones, refining, building } = activityOf(state, 0);
  const lines = ["The station in orbit above a planet."];
  for (const drone of drones) {
    const rock = ACTIONS[drone.action].name.toLowerCase();
    lines.push(
      drone.progress === null
        ? `A drone waits to mine the ${rock}.`
        : `A drone is mining the ${rock}.`,
    );
  }
  if (refining) lines.push("The refinery is running.");
  for (const { module, active } of building) {
    const level = numeral((state.modules[module] ?? 0) + 1);
    lines.push(`${MODULES[module].name} ${level} is ${active ? "being built" : "half built"}.`);
  }
  return lines.join(" ");
}
