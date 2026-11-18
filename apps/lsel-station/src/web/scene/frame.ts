import { ACTION_IDS, ACTIONS, type ActionId } from "../../content/actions.ts";
import { CROPS } from "../../content/crops.ts";
import { DEPARTMENTS } from "../../content/departments.ts";
import { MODULES, type ModuleId, numeral } from "../../content/modules.ts";
import { speedOf } from "../../sim/rules.ts";
import type { Snapshot } from "../../sim/state.ts";
import { SITES } from "./layout.ts";

/** What the running jobs make the scene show. Every job shows up, and only running jobs do. */
export type Activity = {
  /** One drone per mining job, in roster order; `progress` is null while its job waits, so it stays docked. */
  readonly drones: readonly { readonly action: ActionId; readonly progress: number | null }[];
  /** How far along each salvage job's bar is: the tug's trip to the wrecks and back. */
  readonly tugs: readonly number[];
  /** How far along each skimming job's bar is: the skimmer's trip out of the frame and back. */
  readonly skimmers: readonly number[];
  /** Modules with someone working inside. */
  readonly running: readonly ModuleId[];
  /** How grown each bed is, 0 to 1, or null when it is empty. */
  readonly beds: readonly (number | null)[];
  /** Module projects: `active` ones have someone welding, the others are paused. */
  readonly building: readonly { readonly module: ModuleId; readonly active: boolean }[];
};

/** The scene's activity for a game, `sinceTickMs` after its last tick. */
export function activityOf(state: Snapshot, sinceTickMs: number): Activity {
  const drones: { action: ActionId; progress: number | null }[] = [];
  const tugs: number[] = [];
  const skimmers: number[] = [];
  const running: ModuleId[] = [];
  const building: { module: ModuleId; active: boolean }[] = [];
  for (const crew of state.crew) {
    const job = state.jobs[crew];
    if (job === undefined) continue;
    const action = ACTIONS[job.action];
    const working = job.phase === "working";
    const done = job.progressMs + sinceTickMs * speedOf(state, crew, job.action);
    const progress = Math.min(done / action.durationMs, 1);
    if (action.result.kind === "module") {
      if (working) building.push({ module: action.result.module, active: true });
    } else if (SITES[job.action] !== undefined) {
      drones.push({ action: job.action, progress: working ? progress : null });
    } else if (!working) continue;
    else if (action.department === "salvage") tugs.push(progress);
    else if (action.department === "skimming") skimmers.push(progress);
    else {
      // a fabricated unlock such as the tug is made in the Workshop, a study in the Lab
      const { needs } = DEPARTMENTS[action.department];
      if (needs.kind === "module" && !running.includes(needs.module)) running.push(needs.module);
    }
  }
  for (const id of ACTION_IDS) {
    const { result } = ACTIONS[id];
    if (state.projects[id] !== undefined && result.kind === "module") {
      building.push({ module: result.module, active: false });
    }
  }
  const beds = state.beds.map((bed) =>
    bed === null ? null : Math.min(bed.progressMs / CROPS[bed.crop].growMs, 1),
  );
  return { drones, tugs, skimmers, running, beds, building };
}

const RUNNING: Readonly<Partial<Record<ModuleId, string>>> = {
  refinery: "The refinery is running.",
  workshop: "The workshop is at work.",
  greenhouse: "The galley is cooking.",
  scanner: "The scanner is sweeping.",
  lab: "The lab is at work.",
};

/** The scene in words, for anyone who cannot see it: nothing is shown only in the picture. */
export function describeScene(state: Snapshot): string {
  const { drones, tugs, skimmers, running, beds, building } = activityOf(state, 0);
  const lines = ["The station in orbit above a planet."];
  for (const drone of drones) {
    const rock = ACTIONS[drone.action].name.toLowerCase();
    lines.push(
      drone.progress === null
        ? `A drone waits to mine the ${rock}.`
        : `A drone is mining the ${rock}.`,
    );
  }
  for (const _ of tugs) lines.push("A tug is hauling wreck pieces in.");
  for (const _ of skimmers) lines.push("A skimmer is out at the gas giant.");
  for (const module of running) {
    const line = RUNNING[module];
    if (line !== undefined) lines.push(line);
  }
  const growing = beds.filter((bed) => bed !== null).length;
  if (growing > 0) lines.push(growing === 1 ? "1 bed is growing." : `${growing} beds are growing.`);
  for (const { module, active } of building) {
    const level = numeral((state.modules[module] ?? 0) + 1);
    lines.push(`${MODULES[module].name} ${level} is ${active ? "being built" : "half built"}.`);
  }
  return lines.join(" ");
}
