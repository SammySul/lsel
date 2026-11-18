import { idsOf } from "./table.ts";

export type Item = { readonly name: string };

const table = {
  "iron-ore": { name: "Iron ore" },
} as const satisfies Record<string, Item>;

export type ItemId = keyof typeof table;
export const ITEMS: Readonly<Record<ItemId, Item>> = table;
export const ITEM_IDS = idsOf(table);
