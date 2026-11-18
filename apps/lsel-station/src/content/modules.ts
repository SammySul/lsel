import { idsOf } from "./table.ts";

export type Module = { readonly name: string };

const table = {
  core: { name: "Core" },
  "drone-bay": { name: "Drone bay" },
  refinery: { name: "Refinery" },
  habitat: { name: "Habitat" },
  reactor: { name: "Reactor" },
} as const satisfies Record<string, Module>;

export type ModuleId = keyof typeof table;
export const MODULES: Readonly<Record<ModuleId, Module>> = table;
export const MODULE_IDS = idsOf(table);

/** What a new station already has. */
export const STARTING_MODULES: Readonly<Partial<Record<ModuleId, number>>> = {
  core: 1,
  "drone-bay": 1,
  refinery: 1,
};

const NUMERALS = ["I", "II", "III", "IV", "V"];

/** Module levels are written I to V. */
export const numeral = (level: number) => NUMERALS[level - 1] ?? String(level);
