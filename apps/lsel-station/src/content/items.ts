import { idsOf } from "./table.ts";

/** `one` is the name of a single one, where it differs from `name`. */
export type Item = { readonly name: string; readonly one?: string; readonly tier: number };

const table = {
  credits: { name: "Credits", one: "Credit", tier: 1 },
  "iron-ore": { name: "Iron ore", tier: 1 },
  ice: { name: "Ice", tier: 1 },
  hydrogen: { name: "Hydrogen", tier: 1 },
  algae: { name: "Algae", tier: 1 },
  "iron-plate": { name: "Iron plate", tier: 1 },
  water: { name: "Water", tier: 1 },
  "fuel-cell": { name: "Fuel cells", one: "Fuel cell", tier: 1 },
  "basic-parts": { name: "Basic parts", tier: 1 },
  ration: { name: "Rations", one: "Ration", tier: 1 },
  data: { name: "Data", tier: 1 },
  "claim-beacon": { name: "Claim beacons", one: "Claim beacon", tier: 1 },
  "depot-kit": { name: "Depot kits", one: "Depot kit", tier: 1 },
  "relay-kit": { name: "Relay kits", one: "Relay kit", tier: 1 },
  "copper-wire": { name: "Copper wire", tier: 2 },
  glass: { name: "Glass", tier: 2 },
} as const satisfies Record<string, Item>;

export type ItemId = keyof typeof table;
export const ITEMS: Readonly<Record<ItemId, Item>> = table;
export const ITEM_IDS = idsOf(table);

export type Stack = { readonly item: ItemId; readonly amount: number };
