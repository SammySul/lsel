import type { ActionId } from "../content/actions.ts";
import type { CrewId } from "../content/crew.ts";
import { apply, type Command } from "./commands.ts";
import type { GameEvent } from "./events.ts";
import { HOME } from "./map.ts";
import { type GameState, newGame } from "./state.ts";
import { tick } from "./tick.ts";

/** A new game on seed 7, spelled out. */
export const FRESH: GameState = {
  seed: 7,
  rng: 7,
  ticks: 0,
  items: {},
  xp: {},
  mastery: {},
  pool: {},
  modules: { core: 1, "drone-bay": 1, refinery: 1 },
  unlocks: [],
  crew: ["ana-petrov"],
  jobs: {},
  projects: {},
  beds: [],
  fed: {},
  revealed: [HOME],
  outposts: [],
  glut: {},
};

/** Ticks `n` times and returns everything that happened. */
export function run(state: GameState, n: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...tick(state));
  return events;
}

/** Ana is 3% faster at everything: 206 ms of work per tick, so a 4 s bar takes 20 ticks. */
export const ana = (action: ActionId) => ({ kind: "assign", crew: "ana-petrov", action }) as const;
export const ines = (action: ActionId) =>
  ({ kind: "assign", crew: "ines-duarte", action }) as const;

export const assign = (state: GameState, action: ActionId, crew: CrewId = "ana-petrov") =>
  apply(state, { kind: "assign", crew, action });

/** A new game on seed 7 with these modules built too, changed by `setup`, then given work: Ana's, or any command. */
export function station(
  modules: GameState["modules"] = {},
  setup: Partial<GameState> = {},
  ...work: (ActionId | Command)[]
): GameState {
  const fresh = newGame(7);
  const state = { ...fresh, ...setup, modules: { ...fresh.modules, ...setup.modules, ...modules } };
  for (const w of work) apply(state, typeof w === "string" ? ana(w) : w);
  return state;
}

/** A new game on seed 7, changed by `setup`, then given these commands. */
export const game = (setup: Partial<GameState> = {}, ...commands: Command[]) =>
  station({}, setup, ...commands);
