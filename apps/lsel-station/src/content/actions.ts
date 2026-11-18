import type { DepartmentId } from "./departments.ts";
import type { ItemId, Stack } from "./items.ts";
import type { ModuleId } from "./modules.ts";
import { idsOf } from "./table.ts";
import type { UnlockId } from "./unlocks.ts";

export type Action = {
  readonly name: string;
  readonly department: DepartmentId;
  /** The department level that unlocks it. */
  readonly level: number;
  /** Unlocks that must be owned before it is listed. */
  readonly requires?: readonly UnlockId[];
  readonly durationMs: number;
  /** Taken when a bar starts. */
  readonly inputs: readonly Stack[];
  readonly xp: number;
  /** Items and loot repeat for as long as someone is assigned; a module or an unlock is made once. */
  readonly result:
    | { readonly kind: "items"; readonly outputs: readonly Stack[] }
    | { readonly kind: "loot"; readonly table: readonly (Stack & { readonly weight: number })[] }
    | { readonly kind: "module"; readonly module: ModuleId; readonly level: number }
    | { readonly kind: "unlock"; readonly unlock: UnlockId };
};

const MINUTE = 60_000;
const one = (item: ItemId): Action["result"] => ({ kind: "items", outputs: [{ item, amount: 1 }] });
const of = (...stacks: [number, ItemId][]): Stack[] =>
  stacks.map(([amount, item]) => ({ item, amount }));

function build(opts: {
  module: ModuleId;
  tier: number;
  name: string;
  level: number;
  minutes: number;
  inputs: Stack[];
}): Action {
  return {
    name: opts.name,
    department: "construction",
    level: opts.level,
    durationMs: opts.minutes * MINUTE,
    inputs: opts.inputs,
    // half an XP per second of building
    xp: opts.minutes * 30,
    result: { kind: "module", module: opts.module, level: opts.tier },
  };
}

function study(opts: {
  unlock: UnlockId;
  name: string;
  level: number;
  minutes: number;
  data: number;
  requires?: UnlockId[];
}): Action {
  return {
    name: opts.name,
    department: "research",
    level: opts.level,
    ...(opts.requires === undefined ? {} : { requires: opts.requires }),
    durationMs: opts.minutes * MINUTE,
    inputs: of([opts.data, "data"]),
    xp: opts.minutes * 30,
    result: { kind: "unlock", unlock: opts.unlock },
  };
}

const table = {
  "iron-asteroid": {
    name: "Iron asteroid",
    department: "mining",
    level: 1,
    durationMs: 3000,
    inputs: [],
    xp: 5,
    result: one("iron-ore"),
  },
  "ice-asteroid": {
    name: "Ice asteroid",
    department: "mining",
    level: 1,
    durationMs: 3000,
    inputs: [],
    xp: 5,
    result: one("ice"),
  },
  "cargo-wreck": {
    name: "Cargo wreck",
    department: "salvage",
    level: 1,
    durationMs: 5000,
    inputs: [],
    xp: 9,
    result: {
      kind: "loot",
      table: [
        { item: "iron-plate", amount: 1, weight: 45 },
        { item: "water", amount: 1, weight: 25 },
        { item: "basic-parts", amount: 1, weight: 20 },
        { item: "hydrogen", amount: 1, weight: 10 },
      ],
    },
  },
  "skim-hydrogen": {
    name: "Hydrogen",
    department: "skimming",
    level: 1,
    durationMs: 4000,
    inputs: [],
    xp: 7,
    result: one("hydrogen"),
  },
  rations: {
    name: "Rations",
    department: "hydroponics",
    level: 1,
    durationMs: 5000,
    inputs: of([2, "algae"], [1, "water"]),
    xp: 8,
    result: one("ration"),
  },
  "iron-plate": {
    name: "Iron plate",
    department: "refining",
    level: 1,
    durationMs: 4000,
    inputs: of([2, "iron-ore"]),
    xp: 8,
    result: one("iron-plate"),
  },
  water: {
    name: "Water",
    department: "refining",
    level: 1,
    durationMs: 4000,
    inputs: of([2, "ice"]),
    xp: 8,
    result: one("water"),
  },
  "fuel-cell": {
    name: "Fuel cells",
    department: "refining",
    level: 1,
    durationMs: 4000,
    inputs: of([2, "hydrogen"]),
    xp: 8,
    result: one("fuel-cell"),
  },
  "basic-parts": {
    name: "Basic parts",
    department: "fabrication",
    level: 1,
    durationMs: 5000,
    inputs: of([2, "iron-plate"]),
    xp: 10,
    result: one("basic-parts"),
  },
  "salvage-tug": {
    name: "Salvage tug",
    department: "fabrication",
    level: 3,
    durationMs: 8 * MINUTE,
    inputs: of([15, "basic-parts"], [10, "iron-plate"]),
    xp: 240,
    result: { kind: "unlock", unlock: "salvage-tug" },
  },
  "habitat-1": build({
    module: "habitat",
    tier: 1,
    name: "Habitat I",
    level: 1,
    minutes: 10,
    inputs: of([20, "iron-plate"], [10, "water"]),
  }),
  "workshop-1": build({
    module: "workshop",
    tier: 1,
    name: "Workshop I",
    level: 1,
    minutes: 12,
    inputs: of([25, "iron-plate"], [10, "water"]),
  }),
  "reactor-1": build({
    module: "reactor",
    tier: 1,
    name: "Reactor I",
    level: 5,
    minutes: 15,
    inputs: of([30, "iron-plate"], [15, "water"]),
  }),
  "greenhouse-1": build({
    module: "greenhouse",
    tier: 1,
    name: "Greenhouse I",
    level: 6,
    minutes: 15,
    inputs: of([10, "basic-parts"], [20, "iron-plate"], [20, "water"]),
  }),
  "scanner-1": build({
    module: "scanner",
    tier: 1,
    name: "Scanner I",
    level: 8,
    minutes: 20,
    inputs: of([20, "basic-parts"], [30, "iron-plate"]),
  }),
  "lab-1": build({
    module: "lab",
    tier: 1,
    name: "Lab I",
    level: 10,
    minutes: 25,
    inputs: of([30, "basic-parts"], [30, "iron-plate"], [10, "water"]),
  }),
  "skimmer-bay-1": build({
    module: "skimmer-bay",
    tier: 1,
    name: "Skimmer bay I",
    level: 12,
    minutes: 30,
    inputs: of([40, "basic-parts"], [40, "iron-plate"]),
  }),
  "core-2": build({
    module: "core",
    tier: 2,
    name: "Core II",
    level: 15,
    minutes: 120,
    inputs: of([60, "copper-wire"], [30, "glass"]),
  }),
  "habitat-2": build({
    module: "habitat",
    tier: 2,
    name: "Habitat II",
    level: 15,
    minutes: 60,
    inputs: of([40, "copper-wire"], [20, "glass"]),
  }),
  "reactor-2": build({
    module: "reactor",
    tier: 2,
    name: "Reactor II",
    level: 15,
    minutes: 90,
    inputs: of([50, "copper-wire"], [25, "glass"]),
  }),
  "scan-home": {
    name: "Home ring scan",
    department: "survey",
    level: 1,
    durationMs: 6000,
    inputs: [],
    xp: 10,
    result: one("data"),
  },
  "drone-tuning": study({
    unlock: "drone-tuning",
    name: "Drone tuning",
    level: 1,
    minutes: 4,
    data: 30,
  }),
  "furnace-lining": study({
    unlock: "furnace-lining",
    name: "Furnace lining",
    level: 1,
    minutes: 4,
    data: 30,
  }),
  "grow-lights": study({
    unlock: "grow-lights",
    name: "Grow lights",
    level: 2,
    minutes: 5,
    data: 40,
  }),
  jigs: study({ unlock: "jigs", name: "Jigs", level: 3, minutes: 5, data: 40 }),
  "scan-filters": study({
    unlock: "scan-filters",
    name: "Scan filters",
    level: 3,
    minutes: 5,
    data: 40,
  }),
  "tug-winches": study({
    unlock: "tug-winches",
    name: "Tug winches",
    level: 4,
    minutes: 6,
    data: 50,
  }),
  "auto-replant": study({
    unlock: "auto-replant",
    name: "Auto-replant",
    level: 5,
    minutes: 10,
    data: 80,
    requires: ["grow-lights"],
  }),
  "prefab-frames": study({
    unlock: "prefab-frames",
    name: "Prefab frames",
    level: 5,
    minutes: 10,
    data: 80,
    requires: ["jigs"],
  }),
} as const satisfies Record<string, Action>;

export type ActionId = keyof typeof table;
export const ACTIONS: Readonly<Record<ActionId, Action>> = table;
export const ACTION_IDS = idsOf(table);

/** Whether an action is made once (a module level, an unlock) instead of repeated. */
export const isOnce = (action: Action) =>
  action.result.kind === "module" || action.result.kind === "unlock";
