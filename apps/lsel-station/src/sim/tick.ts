import { ACTION_IDS, ACTIONS, type Action, type ActionId, isOnce } from "../content/actions.ts";
import { type CrewId, HABITAT_RECRUITS } from "../content/crew.ts";
import { CROPS } from "../content/crops.ts";
import { DEPARTMENTS, type DepartmentId } from "../content/departments.ts";
import type { Stack } from "../content/items.ts";
import { SPECS, TRICKLE_TICKS } from "../content/outposts.ts";
import { type GameEvent, NO_EVENTS } from "./events.ts";
import { levelOf } from "./levels.ts";
import { isMasteryStep, MASTERY, POOL_SHARE } from "./mastery.ts";
import { nextRandom } from "./rng.ts";
import {
  bedCount,
  bonusChance,
  chartTarget,
  FED_TICKS,
  growthSpeed,
  outputBoost,
  poolCap,
  replants,
  speedOf,
} from "./rules.ts";
import type { GameState } from "./state.ts";
import { give, pay } from "./stock.ts";

export const TICK_MS = 200;

/** Each sale of a good lowers its price by this much, down to GLUT_MAX off; it recovers one step in 5 minutes. */
export const GLUT_STEP = 0.03;
export const GLUT_MAX = 0.3;
const GLUT_RECOVERY = GLUT_STEP / 1500;

/** The next roll of the game's generator, 0 to under 1. */
function random(state: GameState): number {
  const { value, rng } = nextRandom(state.rng);
  state.rng = rng;
  return value;
}

/** One stack from a loot table, by weight. */
function pick(state: GameState, table: readonly (Stack & { readonly weight: number })[]): Stack {
  const total = table.reduce((sum, entry) => sum + entry.weight, 0);
  let at = random(state) * total;
  for (const entry of table) {
    at -= entry.weight;
    if (at < 0) return entry;
  }
  return table[table.length - 1] ?? { item: "iron-ore", amount: 0 };
}

function gainXp(state: GameState, department: DepartmentId, xp: number, events: GameEvent[]): void {
  const before = state.xp[department] ?? 0;
  state.xp[department] = before + xp;
  const level = levelOf(before + xp);
  if (level > levelOf(before)) events.push({ kind: "level-up", department, level });
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
  const style = DEPARTMENTS[action.department].mastery;
  const chance = bonusChance(state, id);
  const lucky = chance > 0 && random(state) < chance;
  switch (result.kind) {
    case "items":
      for (const { item, amount } of result.outputs) {
        give(state, item, lucky && style === "extra-output" ? amount * 2 : amount);
      }
      if (lucky && style === "keep-input") {
        for (const { item, amount } of action.inputs) give(state, item, amount);
      }
      break;
    case "loot":
      for (let rolls = lucky ? 2 : 1; rolls > 0; rolls--) {
        const { item, amount } = pick(state, result.table);
        give(state, item, amount);
      }
      break;
    case "sale": {
      const glut = state.glut[id] ?? 0;
      give(state, "credits", Math.round(result.credits * (1 - glut)) * (lucky ? 2 : 1));
      state.glut[id] = Math.min(glut + GLUT_STEP, GLUT_MAX);
      break;
    }
    case "reveal": {
      const sector = chartTarget(state);
      if (sector !== undefined) {
        state.revealed.push(sector);
        events.push({ kind: "sector-revealed", sector });
      }
      break;
    }
    case "module": {
      state.modules[result.module] = result.level;
      events.push({ kind: "module-built", module: result.module, level: result.level });
      while (state.beds.length < bedCount(state)) state.beds.push(null);
      const recruit = result.module === "habitat" ? HABITAT_RECRUITS[result.level - 1] : undefined;
      if (recruit !== undefined && !state.crew.includes(recruit)) {
        state.crew.push(recruit);
        events.push({ kind: "crew-joined", crew: recruit });
      }
      break;
    }
    case "unlock":
      state.unlocks.push(result.unlock);
      events.push({ kind: "unlocked", unlock: result.unlock });
      break;
    default: {
      const _exhaustive: never = result;
    }
  }
  if (style !== null && !isOnce(action)) gainMastery(state, id, action, events);
  events.push({ kind: "action-done", crew, action: id });
  gainXp(state, action.department, action.xp, events);
}

/** Beds grow on their own timers, with nobody assigned. */
function grow(state: GameState, events: GameEvent[]): void {
  const step = Math.round(TICK_MS * growthSpeed(state));
  state.beds.forEach((bed, index) => {
    if (bed === null) return;
    const crop = CROPS[bed.crop];
    bed.progressMs += step;
    if (bed.progressMs < crop.growMs) return;
    give(state, crop.item, crop.amount);
    events.push({ kind: "harvested", bed: index, crop: bed.crop });
    gainXp(state, "hydroponics", crop.xp, events);
    if (replants(state) && pay(state, crop.cost)) bed.progressMs = 0;
    else state.beds[index] = null;
  });
}

/** Whether a bar can start: there is something left to chart, and its inputs are taken. */
function begin(state: GameState, action: Action): boolean {
  if (action.result.kind === "reveal" && chartTarget(state) === undefined) return false;
  return pay(state, action.inputs);
}

/** Outposts trickle with nobody assigned, and prices recover. */
function idle(state: GameState): void {
  for (const sector of state.owned) {
    const outpost = state.outposts[sector];
    if (outpost === undefined || outpost.spec === null) continue;
    if (SPECS[outpost.spec].yields.length === 0) continue;
    outpost.stored += outputBoost(state, sector) / TRICKLE_TICKS;
    while (outpost.stored >= 1) {
      outpost.stored -= 1;
      for (const item of SPECS[outpost.spec].yields) give(state, item, 1);
    }
  }
  for (const id of ACTION_IDS) {
    const glut = state.glut[id];
    if (glut === undefined) continue;
    if (glut <= GLUT_RECOVERY) delete state.glut[id];
    else state.glut[id] = glut - GLUT_RECOVERY;
  }
}

/** The only function that advances a game: one fixed step of TICK_MS. Returns what happened in it. */
export function tick(state: GameState): readonly GameEvent[] {
  const events: GameEvent[] = [];
  state.ticks++;
  // a copy of the roster: someone who joins in this tick starts with the next one
  for (const crew of [...state.crew]) {
    const job = state.jobs[crew];
    if (job === undefined) continue;
    const action = ACTIONS[job.action];
    if (job.phase !== "working") {
      if (begin(state, action)) job.phase = "working";
      else {
        if (job.phase === "new") events.push({ kind: "job-waiting", crew, action: job.action });
        job.phase = "waiting";
        continue;
      }
    }
    // a working crew member eats a ration an hour, if there is one
    if ((state.fed[crew] ?? 0) === 0 && (state.items.ration ?? 0) >= 1) {
      give(state, "ration", -1);
      state.fed[crew] = FED_TICKS;
    }
    job.progressMs += Math.round(TICK_MS * speedOf(state, crew, job.action));
    const fed = state.fed[crew] ?? 0;
    if (fed > 0) state.fed[crew] = fed - 1;

    while (job.progressMs >= action.durationMs) {
      finish(state, crew, job.action, events);
      if (isOnce(action)) {
        delete state.jobs[crew];
        break;
      }
      job.progressMs -= action.durationMs;
      if (!begin(state, action)) {
        job.progressMs = 0;
        job.phase = "waiting";
        events.push({ kind: "job-waiting", crew, action: job.action });
        break;
      }
    }
  }
  grow(state, events);
  idle(state);
  return events.length > 0 ? events : NO_EVENTS;
}
