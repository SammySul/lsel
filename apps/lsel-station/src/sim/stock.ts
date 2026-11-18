import { CROPS } from "../content/crops.ts";
import type { ItemId, Stack } from "../content/items.ts";
import { bedCount, missing } from "./rules.ts";
import type { Bed, GameState } from "./state.ts";

export function give(state: GameState, item: ItemId, amount: number): void {
  state.items[item] = (state.items[item] ?? 0) + amount;
}

/** Takes a cost if all of it is there. */
export function pay(state: GameState, cost: readonly Stack[]): boolean {
  if (missing(state, cost).length > 0) return false;
  for (const { item, amount } of cost) give(state, item, -amount);
  return true;
}

/** Beds follow bedCount: new ones start empty, and fewer keep what is planted, refunding what no longer fits. */
export function fitBeds(state: GameState): void {
  const count = bedCount(state);
  if (state.beds.length <= count) {
    while (state.beds.length < count) state.beds.push(null);
    return;
  }
  const planted = state.beds.filter((bed): bed is Bed => bed !== null);
  for (const bed of planted.slice(count)) {
    for (const { item, amount } of CROPS[bed.crop].cost) give(state, item, amount);
  }
  const kept = planted.slice(0, count);
  state.beds = [...kept, ...Array<null>(count - kept.length).fill(null)];
}
