import type { DepartmentId } from "./departments.ts";
import type { ItemId } from "./items.ts";
import { idsOf } from "./table.ts";

export type Action = {
  readonly name: string;
  readonly department: DepartmentId;
  readonly durationMs: number;
  readonly outputs: readonly { readonly item: ItemId; readonly amount: number }[];
  readonly xp: number;
};

const table = {
  "iron-asteroid": {
    name: "Iron asteroid",
    department: "mining",
    durationMs: 3000,
    outputs: [{ item: "iron-ore", amount: 1 }],
    xp: 5,
  },
} as const satisfies Record<string, Action>;

export type ActionId = keyof typeof table;
export const ACTIONS: Readonly<Record<ActionId, Action>> = table;
export const ACTION_IDS = idsOf(table);
