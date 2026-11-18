import { ACTIONS, type Action, type ActionId } from "../content/actions.ts";
import { type CrewId, HABITAT_RECRUITS } from "../content/crew.ts";
import { DEPARTMENTS } from "../content/departments.ts";
import { type GameEvent, NO_EVENTS } from "./events.ts";
import { levelOf } from "./levels.ts";
import { isMasteryStep, MASTERY, POOL_SHARE } from "./mastery.ts";
import { nextRandom } from "./rng.ts";
import { bonusChance, missingInputs, poolCap, speedOf } from "./rules.ts";
import type { GameState } from "./state.ts";

export const TICK_MS = 200;

function roll(state: GameState, chance: number): boolean {
  if (chance <= 0) return false;
  const { value, rng } = nextRandom(state.rng);
  state.rng = rng;
  return value < chance;
}

/** Takes a bar's inputs if they are all there. */
function pay(state: GameState, action: Action): boolean {
  if (missingInputs(state, action).length > 0) return false;
  for (const { item, amount } of action.inputs)
    state.items[item] = (state.items[item] ?? 0) - amount;
  return true;
}

function gainMastery(state: GameState, id: ActionId, action: Action, events: GameEvent[]): void {
  const gained = action.durationMs / 1000;
  const before = state.mastery[id] ?? 0;
  state.mastery[id] = before + gained;
  const level = MASTERY.levelOf(before + gained);
  if (level > MASTERY.levelOf(before) && isMasteryStep(level)) {
    events.push({ kind: "mastery-step", action: id, level });
  }
  const pool = (state.pool[action.department] ?? 0) + gained * POOL_SHARE;
  state.pool[action.department] = Math.min(pool, poolCap(action.department));
}

/** What a full bar gives. */
function finish(state: GameState, crew: CrewId, id: ActionId, events: GameEvent[]): void {
  const action = ACTIONS[id];
  const { result } = action;
  if (result.kind === "items") {
    const style = DEPARTMENTS[action.department].mastery;
    const lucky = roll(state, bonusChance(state, id));
    for (const { item, amount } of result.outputs) {
      const made = lucky && style === "extra-output" ? amount * 2 : amount;
      state.items[item] = (state.items[item] ?? 0) + made;
    }
    if (lucky && style === "keep-input") {
      for (const { item, amount } of action.inputs) {
        state.items[item] = (state.items[item] ?? 0) + amount;
      }
    }
    if (style !== null) gainMastery(state, id, action, events);
  } else {
    state.modules[result.module] = result.level;
    events.push({ kind: "module-built", module: result.module, level: result.level });
    const recruit = result.module === "habitat" ? HABITAT_RECRUITS[result.level - 1] : undefined;
    if (recruit !== undefined && !state.crew.includes(recruit)) {
      state.crew.push(recruit);
      events.push({ kind: "crew-joined", crew: recruit });
    }
  }
  events.push({ kind: "action-done", crew, action: id });

  const before = state.xp[action.department] ?? 0;
  state.xp[action.department] = before + action.xp;
  const level = levelOf(before + action.xp);
  if (level > levelOf(before))
    events.push({ kind: "level-up", department: action.department, level });
}

/** The only function that advances a game: one fixed step of TICK_MS. Returns what happened in it. */
export function tick(state: GameState): readonly GameEvent[] {
  let events: GameEvent[] | undefined;
  state.ticks++;
  // a snapshot of the roster: someone who joins in this tick starts with the next one
  for (const crew of [...state.crew]) {
    const job = state.jobs[crew];
    if (job === undefined) continue;
    const action = ACTIONS[job.action];
    if (job.phase !== "working") {
      if (pay(state, action)) job.phase = "working";
      else {
        if (job.phase === "new") {
          events ??= [];
          events.push({ kind: "job-waiting", crew, action: job.action });
        }
        job.phase = "waiting";
        continue;
      }
    }
    job.progressMs += Math.round(TICK_MS * speedOf(state, crew, job.action));
    while (job.progressMs >= action.durationMs) {
      events ??= [];
      finish(state, crew, job.action, events);
      if (action.result.kind === "module") {
        delete state.jobs[crew];
        break;
      }
      job.progressMs -= action.durationMs;
      if (!pay(state, action)) {
        job.progressMs = 0;
        job.phase = "waiting";
        events.push({ kind: "job-waiting", crew, action: job.action });
        break;
      }
    }
  }
  return events ?? NO_EVENTS;
}
