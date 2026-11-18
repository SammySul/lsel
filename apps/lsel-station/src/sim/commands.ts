import { ACTIONS, type ActionId } from "../content/actions.ts";
import type { CrewId } from "../content/crew.ts";
import { DEPARTMENTS } from "../content/departments.ts";
import { type GameEvent, NO_EVENTS } from "./events.ts";
import { isMasteryStep, MASTERY } from "./mastery.ts";
import { actionLock, actionShown, crewSlots, poolCost } from "./rules.ts";
import type { GameState } from "./state.ts";

export type Command =
  | { kind: "assign"; crew: CrewId; action: ActionId }
  | { kind: "unassign"; crew: CrewId }
  | { kind: "spend-pool"; action: ActionId };

/** Takes a crew member off their job: a started bar gives its inputs back, a module project keeps its progress. */
function release(state: GameState, crew: CrewId): boolean {
  const job = state.jobs[crew];
  if (job === undefined) return false;
  const action = ACTIONS[job.action];
  if (job.phase === "working") {
    if (action.result.kind === "module") state.projects[job.action] = job.progressMs;
    else {
      for (const { item, amount } of action.inputs) {
        state.items[item] = (state.items[item] ?? 0) + amount;
      }
    }
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
  // one project per crew member
  const once = ACTIONS[id].result.kind === "module";
  if (once && others.some((c) => state.jobs[c]?.action === id)) return NO_EVENTS;

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
  const { department, result } = ACTIONS[id];
  const cost = poolCost(state, id);
  const pool = state.pool[department] ?? 0;
  if (DEPARTMENTS[department].mastery === null || result.kind !== "items") return NO_EVENTS;
  if (cost === null || pool < cost) return NO_EVENTS;
  state.pool[department] = pool - cost;
  state.mastery[id] = (state.mastery[id] ?? 0) + cost;
  const level = MASTERY.levelOf(state.mastery[id] ?? 0);
  return isMasteryStep(level) ? [{ kind: "mastery-step", action: id, level }] : NO_EVENTS;
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
    default: {
      const _exhaustive: never = command;
      return NO_EVENTS;
    }
  }
}
