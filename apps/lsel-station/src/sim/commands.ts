import { ACTIONS, type ActionId, isOnce } from "../content/actions.ts";
import type { CrewId } from "../content/crew.ts";
import { CROPS, type CropId } from "../content/crops.ts";
import {
  OUTPOST_MODULES,
  OUTPOST_SLOTS,
  type OutpostModuleId,
  RESPEC_COST,
  type SpecId,
} from "../content/outposts.ts";
import { type GameEvent, NO_EVENTS } from "./events.ts";
import type { SectorId } from "./map.ts";
import { isMasteryStep, MASTERY } from "./mastery.ts";
import {
  actionLock,
  actionShown,
  claimable,
  crewSlots,
  masterable,
  poolCost,
  routes,
} from "./rules.ts";
import type { GameState } from "./state.ts";
import { fitBeds, give, pay } from "./stock.ts";

export type Command =
  | { kind: "assign"; crew: CrewId; action: ActionId }
  | { kind: "unassign"; crew: CrewId }
  | { kind: "spend-pool"; action: ActionId }
  | { kind: "plant"; bed: number; crop: CropId }
  | { kind: "claim"; sector: SectorId }
  | { kind: "specialise"; sector: SectorId; spec: SpecId }
  | { kind: "install"; sector: SectorId; module: OutpostModuleId };

/** Takes a crew member off their job: a started bar gives its inputs back, a once-made project keeps its progress. */
function release(state: GameState, crew: CrewId): boolean {
  const job = state.jobs[crew];
  if (job === undefined) return false;
  const action = ACTIONS[job.action];
  if (job.phase === "working") {
    if (isOnce(action)) state.projects[job.action] = job.progressMs;
    else for (const { item, amount } of action.inputs) give(state, item, amount);
  }
  delete state.jobs[crew];
  return true;
}

function assign(state: GameState, crew: CrewId, id: ActionId): readonly GameEvent[] {
  const current = state.jobs[crew];
  if (!state.crew.includes(crew) || current?.action === id) return NO_EVENTS;
  if (!actionShown(state, id) || actionLock(state, id) !== null) return NO_EVENTS;
  const others = state.crew.filter((c) => c !== crew && state.jobs[c] !== undefined);
  if (current === undefined && others.length >= crewSlots(state)) return NO_EVENTS;
  // a route per Market office level and Trade hub
  const trading = others.filter((c) => {
    const job = state.jobs[c];
    return job !== undefined && ACTIONS[job.action].department === "trade";
  });
  if (ACTIONS[id].department === "trade" && trading.length >= routes(state)) return NO_EVENTS;
  // one project per crew member
  if (isOnce(ACTIONS[id]) && others.some((c) => state.jobs[c]?.action === id)) return NO_EVENTS;

  release(state, crew);
  const resumed = state.projects[id];
  delete state.projects[id];
  state.jobs[crew] =
    resumed === undefined
      ? { action: id, progressMs: 0, phase: "new" }
      : { action: id, progressMs: resumed, phase: "working" };
  return [{ kind: "job-started", crew, action: id }];
}

function spendPool(state: GameState, id: ActionId): readonly GameEvent[] {
  const action = ACTIONS[id];
  const cost = poolCost(state, id);
  const pool = state.pool[action.department] ?? 0;
  if (!masterable(id)) return NO_EVENTS;
  if (cost === null || pool < cost) return NO_EVENTS;
  state.pool[action.department] = pool - cost;
  state.mastery[id] = (state.mastery[id] ?? 0) + cost;
  const level = MASTERY.levelOf(state.mastery[id] ?? 0);
  return isMasteryStep(level) ? [{ kind: "mastery-step", action: id, level }] : NO_EVENTS;
}

const CLAIM_COST = [{ item: "claim-beacon", amount: 1 }] as const;

function claim(state: GameState, sector: SectorId): readonly GameEvent[] {
  if (!claimable(state, sector) || !pay(state, CLAIM_COST)) return NO_EVENTS;
  state.owned.push(sector);
  state.outposts[sector] = { spec: null, modules: [], stored: 0 };
  return [{ kind: "sector-claimed", sector }];
}

/** Sets what an outpost does: free the first time, for credits after. Beds follow the number of Farms. */
function specialise(state: GameState, sector: SectorId, spec: SpecId): readonly GameEvent[] {
  const outpost = state.outposts[sector];
  if (outpost === undefined || outpost.spec === spec) return NO_EVENTS;
  if (outpost.spec !== null && !pay(state, RESPEC_COST)) return NO_EVENTS;
  outpost.spec = spec;
  outpost.stored = 0;
  fitBeds(state);
  return [{ kind: "outpost-changed", sector }];
}

function install(
  state: GameState,
  sector: SectorId,
  module: OutpostModuleId,
): readonly GameEvent[] {
  const outpost = state.outposts[sector];
  if (outpost === undefined || outpost.modules.length >= OUTPOST_SLOTS) return NO_EVENTS;
  if (!pay(state, [{ item: OUTPOST_MODULES[module].kit, amount: 1 }])) return NO_EVENTS;
  outpost.modules.push(module);
  return [{ kind: "outpost-changed", sector }];
}

function plant(state: GameState, bed: number, crop: CropId): readonly GameEvent[] {
  if (state.beds[bed] !== null || !pay(state, CROPS[crop].cost)) return NO_EVENTS;
  state.beds[bed] = { crop, progressMs: 0 };
  return [{ kind: "planted", bed, crop }];
}

/** Changes the game as the player asked. Returns what happened; a command that cannot apply changes nothing. */
export function apply(state: GameState, command: Command): readonly GameEvent[] {
  switch (command.kind) {
    case "assign":
      return assign(state, command.crew, command.action);
    case "unassign":
      return release(state, command.crew)
        ? [{ kind: "job-stopped", crew: command.crew }]
        : NO_EVENTS;
    case "spend-pool":
      return spendPool(state, command.action);
    case "claim":
      return claim(state, command.sector);
    case "specialise":
      return specialise(state, command.sector, command.spec);
    case "install":
      return install(state, command.sector, command.module);
    case "plant":
      return plant(state, command.bed, command.crop);
    default: {
      const _exhaustive: never = command;
      return NO_EVENTS;
    }
  }
}
