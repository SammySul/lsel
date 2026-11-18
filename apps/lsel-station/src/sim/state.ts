import type { ActionId } from "../content/actions.ts";
import { type CrewId, STARTING_CREW } from "../content/crew.ts";
import type { DepartmentId } from "../content/departments.ts";
import type { ItemId } from "../content/items.ts";
import { type ModuleId, STARTING_MODULES } from "../content/modules.ts";

export type Job = {
  action: ActionId;
  progressMs: number;
  /** `new` has not tried to start; `working` has taken its inputs; `waiting` lacks them and retries by itself. */
  phase: "new" | "working" | "waiting";
};

export type GameState = {
  seed: number;
  /** The seeded generator's state: every roll in the game comes from here. */
  rng: number;
  ticks: number;
  /** A missing key is zero. */
  items: Partial<Record<ItemId, number>>;
  /** Department XP. A missing key is zero. */
  xp: Partial<Record<DepartmentId, number>>;
  /** Mastery XP per item. A missing key is zero. */
  mastery: Partial<Record<ActionId, number>>;
  /** Mastery pool XP per department. A missing key is zero. */
  pool: Partial<Record<DepartmentId, number>>;
  /** Module levels. A missing key is not built. */
  modules: Partial<Record<ModuleId, number>>;
  /** The roster, in the order they joined. */
  crew: CrewId[];
  jobs: Partial<Record<CrewId, Job>>;
  /** Progress of module projects that are paid for and have nobody on them. */
  projects: Partial<Record<ActionId, number>>;
};

type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

/** What the interface and the scene read; only `tick` and `apply` change a game. */
export type Snapshot = DeepReadonly<GameState>;

export function newGame(seed: number): GameState {
  return {
    seed,
    rng: seed | 0,
    ticks: 0,
    items: {},
    xp: {},
    mastery: {},
    pool: {},
    modules: { ...STARTING_MODULES },
    crew: [STARTING_CREW],
    jobs: {},
    projects: {},
  };
}
