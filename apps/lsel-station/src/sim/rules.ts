import { ACTION_IDS, ACTIONS, type Action, type ActionId } from "../content/actions.ts";
import { CREW, type CrewId } from "../content/crew.ts";
import { DEPARTMENTS, type DepartmentId } from "../content/departments.ts";
import type { Stack } from "../content/items.ts";
import type { ModuleId } from "../content/modules.ts";
import { levelOf } from "./levels.ts";
import { MASTERY, masteryChance, POOL_CHECKPOINTS, POOL_FILL } from "./mastery.ts";
import type { Snapshot } from "./state.ts";

// Everything here is read off a game: none of it is stored, so none of it can go stale.

export const moduleLevel = (state: Snapshot, module: ModuleId) => state.modules[module] ?? 0;

/** One job at first, one more per Habitat level. */
export const crewSlots = (state: Snapshot) => 1 + moduleLevel(state, "habitat");

export function departmentOpen(state: Snapshot, department: DepartmentId): boolean {
  const { module, level } = DEPARTMENTS[department].needs;
  return moduleLevel(state, module) >= level;
}

export const departmentLevel = (state: Snapshot, department: DepartmentId) =>
  levelOf(state.xp[department] ?? 0);

/** Whether an action is listed: its department is open, and a module level is listed only while it is next. */
export function actionShown(state: Snapshot, id: ActionId): boolean {
  const { department, result } = ACTIONS[id];
  if (!departmentOpen(state, department)) return false;
  return result.kind === "items" || moduleLevel(state, result.module) === result.level - 1;
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

/** The inputs a bar of this action still lacks, with the amount short of each. */
export function missingInputs(state: Snapshot, action: Action): Stack[] {
  return action.inputs
    .map(({ item, amount }) => ({ item, amount: amount - (state.items[item] ?? 0) }))
    .filter((stack) => stack.amount > 0);
}

export const masteryLevel = (state: Snapshot, id: ActionId) =>
  MASTERY.levelOf(state.mastery[id] ?? 0);

/** The actions of a department that repeat, which are the ones that can be mastered. */
export const masterable = (department: DepartmentId) =>
  ACTION_IDS.filter(
    (id) => ACTIONS[id].department === department && ACTIONS[id].result.kind === "items",
  );

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

/** How fast a crew member works an action: 1 is the action's own duration, and bonuses add up. */
export function speedOf(state: Snapshot, crew: CrewId, id: ActionId): number {
  const { department } = ACTIONS[id];
  const { specialty } = CREW[crew];
  const own = specialty.department === "all" || specialty.department === department;
  return (
    1 +
    (own ? specialty.bonus : 0) +
    0.02 * moduleLevel(state, "reactor") +
    poolBonus(state, department, "speed")
  );
}

/** The chance that a finished bar pays its department's mastery bonus. */
export function bonusChance(state: Snapshot, id: ActionId): number {
  const { department, result } = ACTIONS[id];
  if (DEPARTMENTS[department].mastery === null || result.kind !== "items") return 0;
  return masteryChance(masteryLevel(state, id)) + poolBonus(state, department, "chance");
}

/** Pool XP it costs to raise an item's mastery by one level, or null at the cap. */
export function poolCost(state: Snapshot, id: ActionId): number | null {
  const next = MASTERY.toReachNext(masteryLevel(state, id));
  return next === null ? null : next - (state.mastery[id] ?? 0);
}
