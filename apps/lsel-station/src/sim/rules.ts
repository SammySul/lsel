import { ACTION_IDS, ACTIONS, type Action, type ActionId, isOnce } from "../content/actions.ts";
import { CREW, type CrewId } from "../content/crew.ts";
import { BEDS_PER_LEVEL } from "../content/crops.ts";
import { DEPARTMENTS, type DepartmentId } from "../content/departments.ts";
import type { Stack } from "../content/items.ts";
import type { ModuleId } from "../content/modules.ts";
import { UNLOCKS, type UnlockId } from "../content/unlocks.ts";
import { levelOf } from "./levels.ts";
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

export const bedCount = (state: Snapshot) => BEDS_PER_LEVEL * moduleLevel(state, "greenhouse");

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
  const { department, result, requires } = ACTIONS[id];
  if (!departmentOpen(state, department)) return false;
  if (requires?.some((unlock) => !owns(state, unlock))) return false;
  if (result.kind === "module") return moduleLevel(state, result.module) === result.level - 1;
  if (result.kind === "unlock") return !owns(state, result.unlock);
  return true;
}

/** Why a listed action cannot be assigned yet, or null when it can. */
export function actionLock(
  state: Snapshot,
  id: ActionId,
): { kind: "level"; level: number } | { kind: "core"; level: number } | null {
  const { department, level, result } = ACTIONS[id];
  if (departmentLevel(state, department) < level) return { kind: "level", level };
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
  ACTION_IDS.filter((id) => ACTIONS[id].department === department && !isOnce(ACTIONS[id]));

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
