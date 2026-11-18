import type { ActionId } from "../content/actions.ts";
import type { CrewId } from "../content/crew.ts";
import type { DepartmentId } from "../content/departments.ts";
import type { ItemId } from "../content/items.ts";

export type Job = { action: ActionId; progressMs: number };

export type GameState = {
  seed: number;
  ticks: number;
  /** A missing key is zero. */
  items: Partial<Record<ItemId, number>>;
  /** A missing key is zero. */
  xp: Partial<Record<DepartmentId, number>>;
  jobs: Partial<Record<CrewId, Job>>;
};

type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

/** What the interface and the scene read; only `tick` and `apply` change a game. */
export type Snapshot = DeepReadonly<GameState>;

export function newGame(seed: number): GameState {
  return { seed, ticks: 0, items: {}, xp: {}, jobs: {} };
}
