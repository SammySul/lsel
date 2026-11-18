import type { ItemId, Stack } from "../content/items.ts";
import { missing } from "./rules.ts";
import type { GameState } from "./state.ts";

export function give(state: GameState, item: ItemId, amount: number): void {
  state.items[item] = (state.items[item] ?? 0) + amount;
}

/** Takes a cost if all of it is there. */
export function pay(state: GameState, cost: readonly Stack[]): boolean {
  if (missing(state, cost).length > 0) return false;
  for (const { item, amount } of cost) give(state, item, -amount);
  return true;
}
