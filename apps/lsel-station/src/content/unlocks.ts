import type { DepartmentId } from "./departments.ts";
import { idsOf } from "./table.ts";

/** What owning an unlock changes. */
export type Effect =
  | { readonly kind: "open"; readonly department: DepartmentId }
  | { readonly kind: "speed"; readonly department: DepartmentId; readonly bonus: number }
  | { readonly kind: "growth"; readonly bonus: number }
  | { readonly kind: "auto-replant" };

/** Something made or researched once and kept for good. */
export type Unlock = {
  readonly name: string;
  readonly gives: string;
  readonly effects: readonly Effect[];
};

const speed = (department: DepartmentId): readonly Effect[] => [
  { kind: "speed", department, bonus: 0.05 },
];

const table = {
  "salvage-tug": {
    name: "Salvage tug",
    gives: "Opens Salvage",
    effects: [{ kind: "open", department: "salvage" }],
  },
  "drone-tuning": { name: "Drone tuning", gives: "Mining 5% faster", effects: speed("mining") },
  "furnace-lining": {
    name: "Furnace lining",
    gives: "Refining 5% faster",
    effects: speed("refining"),
  },
  jigs: { name: "Jigs", gives: "Fabrication 5% faster", effects: speed("fabrication") },
  "tug-winches": { name: "Tug winches", gives: "Salvage 5% faster", effects: speed("salvage") },
  "scan-filters": { name: "Scan filters", gives: "Survey 5% faster", effects: speed("survey") },
  "prefab-frames": {
    name: "Prefab frames",
    gives: "Construction 5% faster",
    effects: speed("construction"),
  },
  "grow-lights": {
    name: "Grow lights",
    gives: "Beds grow 10% faster",
    effects: [{ kind: "growth", bonus: 0.1 }],
  },
  "auto-replant": {
    name: "Auto-replant",
    gives: "Beds replant themselves",
    effects: [{ kind: "auto-replant" }],
  },
} as const satisfies Record<string, Unlock>;

export type UnlockId = keyof typeof table;
export const UNLOCKS: Readonly<Record<UnlockId, Unlock>> = table;
export const UNLOCK_IDS = idsOf(table);
