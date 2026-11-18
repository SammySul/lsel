import type { DepartmentId } from "./departments.ts";
import type { Stack } from "./items.ts";
import type { ModuleId } from "./modules.ts";
import { idsOf } from "./table.ts";

export type Action = {
  readonly name: string;
  readonly department: DepartmentId;
  /** The department level that unlocks it. */
  readonly level: number;
  readonly durationMs: number;
  /** Taken when a bar starts. */
  readonly inputs: readonly Stack[];
  readonly xp: number;
  /** Items repeat for as long as someone is assigned; a module is built once. */
  readonly result:
    | { readonly kind: "items"; readonly outputs: readonly Stack[] }
    | { readonly kind: "module"; readonly module: ModuleId; readonly level: number };
};

const MINUTE = 60_000;

const table = {
  "iron-asteroid": {
    name: "Iron asteroid",
    department: "mining",
    level: 1,
    durationMs: 3000,
    inputs: [],
    xp: 5,
    result: { kind: "items", outputs: [{ item: "iron-ore", amount: 1 }] },
  },
  "ice-asteroid": {
    name: "Ice asteroid",
    department: "mining",
    level: 1,
    durationMs: 3000,
    inputs: [],
    xp: 5,
    result: { kind: "items", outputs: [{ item: "ice", amount: 1 }] },
  },
  "iron-plate": {
    name: "Iron plate",
    department: "refining",
    level: 1,
    durationMs: 4000,
    inputs: [{ item: "iron-ore", amount: 2 }],
    xp: 8,
    result: { kind: "items", outputs: [{ item: "iron-plate", amount: 1 }] },
  },
  water: {
    name: "Water",
    department: "refining",
    level: 1,
    durationMs: 4000,
    inputs: [{ item: "ice", amount: 2 }],
    xp: 8,
    result: { kind: "items", outputs: [{ item: "water", amount: 1 }] },
  },
  "habitat-1": {
    name: "Habitat I",
    department: "construction",
    level: 1,
    durationMs: 10 * MINUTE,
    inputs: [
      { item: "iron-plate", amount: 20 },
      { item: "water", amount: 10 },
    ],
    xp: 300,
    result: { kind: "module", module: "habitat", level: 1 },
  },
  "reactor-1": {
    name: "Reactor I",
    department: "construction",
    level: 5,
    durationMs: 15 * MINUTE,
    inputs: [
      { item: "iron-plate", amount: 30 },
      { item: "water", amount: 15 },
    ],
    xp: 450,
    result: { kind: "module", module: "reactor", level: 1 },
  },
  "core-2": {
    name: "Core II",
    department: "construction",
    level: 15,
    durationMs: 120 * MINUTE,
    inputs: [
      { item: "copper-wire", amount: 60 },
      { item: "glass", amount: 30 },
    ],
    xp: 3000,
    result: { kind: "module", module: "core", level: 2 },
  },
  "habitat-2": {
    name: "Habitat II",
    department: "construction",
    level: 15,
    durationMs: 60 * MINUTE,
    inputs: [
      { item: "copper-wire", amount: 40 },
      { item: "glass", amount: 20 },
    ],
    xp: 1500,
    result: { kind: "module", module: "habitat", level: 2 },
  },
  "reactor-2": {
    name: "Reactor II",
    department: "construction",
    level: 15,
    durationMs: 90 * MINUTE,
    inputs: [
      { item: "copper-wire", amount: 50 },
      { item: "glass", amount: 25 },
    ],
    xp: 2250,
    result: { kind: "module", module: "reactor", level: 2 },
  },
} as const satisfies Record<string, Action>;

export type ActionId = keyof typeof table;
export const ACTIONS: Readonly<Record<ActionId, Action>> = table;
export const ACTION_IDS = idsOf(table);
