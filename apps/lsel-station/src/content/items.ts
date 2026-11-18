import { idsOf } from "./table.ts";

export type Item = { readonly name: string; readonly tier: number };

const table = {
  "iron-ore": { name: "Iron ore", tier: 1 },
  ice: { name: "Ice", tier: 1 },
  "iron-plate": { name: "Iron plate", tier: 1 },
  water: { name: "Water", tier: 1 },
  "copper-wire": { name: "Copper wire", tier: 2 },
  glass: { name: "Glass", tier: 2 },
} as const satisfies Record<string, Item>;

export type ItemId = keyof typeof table;
export const ITEMS: Readonly<Record<ItemId, Item>> = table;
export const ITEM_IDS = idsOf(table);

export type Stack = { readonly item: ItemId; readonly amount: number };
