import { ACTION_IDS, ACTIONS, type Action, type ActionId, isOnce } from "../content/actions.ts";
import { CREW, type CrewId } from "../content/crew.ts";
import { BEDS_PER_LEVEL } from "../content/crops.ts";
import { DEPARTMENTS, type DepartmentId } from "../content/departments.ts";
import type { FactionId, Owner } from "../content/factions.ts";
import type { Stack } from "../content/items.ts";
import type { ModuleId } from "../content/modules.ts";
import { OUTPOST_MODULES, SPECS } from "../content/outposts.ts";
import { UNLOCKS, type UnlockId } from "../content/unlocks.ts";
import { levelOf } from "./levels.ts";
import { mapOf, type SectorId, sectorOf } from "./map.ts";
import { MASTERY, masteryChance, POOL_CHECKPOINTS, POOL_FILL } from "./mastery.ts";
import type { Snapshot } from "./state.ts";

// Everything here is read off a game: none of it is stored, so none of it can go stale.

/** A fed crew member works this much faster. */
export const FED_BONUS = 0.1;

/** Ticks of work one ration lasts: an hour. */
export const FED_TICKS = 18_000;

export const moduleLevel = (state: Snapshot, module: ModuleId) => state.modules[module] ?? 0;

export const owns = (state: Snapshot, unlock: UnlockId) => state.unlocks.includes(unlock);

/** One job at first, one more per Habitat level. */
export const crewSlots = (state: Snapshot) => 1 + moduleLevel(state, "habitat");

/** The outposts of a game with their sectors, in the order the sectors were taken. */
export function outposts(state: Snapshot) {
  return state.owned.flatMap((sector) => {
    const outpost = state.outposts[sector];
    return outpost === undefined ? [] : [{ sector, outpost }];
  });
}

const specTotal = (state: Snapshot, of: "beds" | "routes") =>
  outposts(state).reduce(
    (sum, { outpost }) => sum + (outpost.spec === null ? 0 : SPECS[outpost.spec][of]),
    0,
  );

/** Two beds per Greenhouse level, and two per Farm outpost once there is a Greenhouse. */
export const bedCount = (state: Snapshot) =>
  moduleLevel(state, "greenhouse") === 0
    ? 0
    : BEDS_PER_LEVEL * moduleLevel(state, "greenhouse") + specTotal(state, "beds");

/** Trade runs at once: one per Market office level and one per Trade hub. */
export const routes = (state: Snapshot) =>
  moduleLevel(state, "market-office") + specTotal(state, "routes");

/** Who holds a sector now. */
export function ownerOf(state: Snapshot, sector: SectorId): Owner {
  return state.owned.includes(sector) ? "you" : sectorOf(mapOf(state.seed), sector).holder;
}

const bordersYours = (state: Snapshot, sector: SectorId) =>
  sectorOf(mapOf(state.seed), sector).lanes.some((lane) => state.owned.includes(lane));

/** The sector the next chart puts on the map: the lowest-numbered hidden one a lane from yours. */
export function chartTarget(state: Snapshot): SectorId | undefined {
  return mapOf(state.seed).sectors.find(
    (sector) => !state.revealed.includes(sector.id) && bordersYours(state, sector.id),
  )?.id;
}

/** Whether a beacon would take this sector: it is on the map, nobody holds it, and it borders yours. */
export const claimable = (state: Snapshot, sector: SectorId) =>
  state.revealed.includes(sector) &&
  ownerOf(state, sector) === "none" &&
  bordersYours(state, sector);

/** A faction's market is reachable once one of its sectors is on the map. */
export const marketOpen = (state: Snapshot, faction: FactionId) =>
  state.revealed.some((sector) => ownerOf(state, sector) === faction);

/** How much an outpost's output is multiplied: its own add-ons, and relays on the outposts next to it. */
export function outputBoost(state: Snapshot, sector: SectorId): number {
  let boost = 1;
  for (const module of state.outposts[sector]?.modules ?? []) boost += OUTPOST_MODULES[module].own;
  for (const lane of sectorOf(mapOf(state.seed), sector).lanes) {
    for (const module of state.outposts[lane]?.modules ?? []) {
      boost += OUTPOST_MODULES[module].neighbors;
    }
  }
  return boost;
}

export function departmentOpen(state: Snapshot, department: DepartmentId): boolean {
  const { needs } = DEPARTMENTS[department];
  if (needs.kind === "module") return moduleLevel(state, needs.module) >= needs.level;
  return state.unlocks.some((unlock) =>
    UNLOCKS[unlock].effects.some((e) => e.kind === "open" && e.department === department),
  );
}

export const departmentLevel = (state: Snapshot, department: DepartmentId) =>
  levelOf(state.xp[department] ?? 0);

/**
 * Whether an action is listed: its department is open and what it requires is owned.
 * A module level is listed only while it is next, and an unlock until it is owned.
 */
export function actionShown(state: Snapshot, id: ActionId): boolean {
  const { department, result, requires, market } = ACTIONS[id];
  if (!departmentOpen(state, department)) return false;
  if (requires?.some((unlock) => !owns(state, unlock))) return false;
  if (market !== undefined && !marketOpen(state, market)) return false;
  if (result.kind === "module") return moduleLevel(state, result.module) === result.level - 1;
  if (result.kind === "unlock") return !owns(state, result.unlock);
  return true;
}

/** Why a listed action cannot be assigned yet, or null when it can. */
export function actionLock(
  state: Snapshot,
  id: ActionId,
): { kind: "level"; level: number } | { kind: "core"; level: number } | { kind: "charted" } | null {
  const { department, level, result } = ACTIONS[id];
  if (departmentLevel(state, department) < level) return { kind: "level", level };
  if (result.kind === "reveal" && chartTarget(state) === undefined) return { kind: "charted" };
  // the Core gates the level of every other module
  if (result.kind === "module" && result.module !== "core") {
    if (moduleLevel(state, "core") < result.level) return { kind: "core", level: result.level };
  }
  return null;
}

/** The stacks of a cost that are still lacking, with the amount short of each. */
export function missing(state: Snapshot, cost: readonly Stack[]): Stack[] {
  return cost
    .map(({ item, amount }) => ({ item, amount: amount - (state.items[item] ?? 0) }))
    .filter((stack) => stack.amount > 0);
}

export const missingInputs = (state: Snapshot, action: Action) => missing(state, action.inputs);

export const masteryLevel = (state: Snapshot, id: ActionId) =>
  MASTERY.levelOf(state.mastery[id] ?? 0);

/** The actions of a department that repeat, which are the ones that can be mastered. */
export const masterable = (department: DepartmentId) =>
  DEPARTMENTS[department].mastery === null
    ? []
    : ACTION_IDS.filter((id) => ACTIONS[id].department === department && !isOnce(ACTIONS[id]));

export const poolCap = (department: DepartmentId) =>
  POOL_FILL * masterable(department).length * MASTERY.total;

/** How full a department's mastery pool is, 0 to 1. */
export function poolShare(state: Snapshot, department: DepartmentId): number {
  const cap = poolCap(department);
  return cap === 0 ? 0 : Math.min((state.pool[department] ?? 0) / cap, 1);
}

function poolBonus(state: Snapshot, department: DepartmentId, kind: "speed" | "chance"): number {
  const share = poolShare(state, department);
  let bonus = 0;
  for (const checkpoint of POOL_CHECKPOINTS) {
    if (checkpoint.kind === kind && share >= checkpoint.share) bonus += checkpoint.bonus;
  }
  return bonus;
}

function unlockSpeed(state: Snapshot, department: DepartmentId): number {
  let bonus = 0;
  for (const unlock of state.unlocks) {
    for (const effect of UNLOCKS[unlock].effects) {
      if (effect.kind === "speed" && effect.department === department) bonus += effect.bonus;
    }
  }
  return bonus;
}

/** How fast a crew member works an action: 1 is the action's own duration, and bonuses add up. */
export function speedOf(state: Snapshot, crew: CrewId, id: ActionId): number {
  const { department } = ACTIONS[id];
  const { specialty } = CREW[crew];
  const own = specialty.department === "all" || specialty.department === department;
  return (
    1 +
    (own ? specialty.bonus : 0) +
    ((state.fed[crew] ?? 0) > 0 ? FED_BONUS : 0) +
    0.02 * moduleLevel(state, "reactor") +
    unlockSpeed(state, department) +
    poolBonus(state, department, "speed")
  );
}

/** How fast beds grow: 1 is the crop's own time. */
export function growthSpeed(state: Snapshot): number {
  let bonus = 0;
  for (const unlock of state.unlocks) {
    for (const effect of UNLOCKS[unlock].effects)
      if (effect.kind === "growth") bonus += effect.bonus;
  }
  return 1 + bonus;
}

export const replants = (state: Snapshot) =>
  state.unlocks.some((unlock) => UNLOCKS[unlock].effects.some((e) => e.kind === "auto-replant"));

/** The chance that a finished bar pays its department's mastery bonus. */
export function bonusChance(state: Snapshot, id: ActionId): number {
  const action = ACTIONS[id];
  if (DEPARTMENTS[action.department].mastery === null || isOnce(action)) return 0;
  return masteryChance(masteryLevel(state, id)) + poolBonus(state, action.department, "chance");
}

/** Pool XP it costs to raise an item's mastery by one level, or null at the cap. */
export function poolCost(state: Snapshot, id: ActionId): number | null {
  const next = MASTERY.toReachNext(masteryLevel(state, id));
  return next === null ? null : next - (state.mastery[id] ?? 0);
}
