// The station's modules and what each level costs.

import { idsOf } from "./table.ts";

export type Module = {
  readonly name: string;
  /** What each level adds. */
  readonly does: string;
};

const table = {
  core: { name: "Core", does: "Each level lets every other module go one level higher" },
  "drone-bay": { name: "Drone bay", does: "Opens Mining" },
  refinery: { name: "Refinery", does: "Opens Refining" },
  habitat: { name: "Habitat", does: "One more job at a time, and a new crew member to work it" },
  reactor: { name: "Reactor", does: "Every job 2% faster" },
  workshop: { name: "Workshop", does: "Opens Fabrication" },
  greenhouse: { name: "Greenhouse", does: "Opens Hydroponics; two more grow beds" },
  scanner: { name: "Scanner", does: "Opens Survey" },
  lab: { name: "Lab", does: "Opens Research" },
  "skimmer-bay": { name: "Skimmer bay", does: "Opens Skimming" },
  "market-office": { name: "Market office", does: "Opens Trade; one more route at a time" },
  hold: { name: "Hold", does: "Room for more of each item" },
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

/** How much of each item fits, by Hold level: credits are not stored, so they have no limit. */
export const HOLD_SIZES = [500, 1000, 2500, 5000, 10_000, 25_000] as const;

const NUMERALS = ["I", "II", "III", "IV", "V"];

/** Module levels are written I to V. */
export const numeral = (level: number) => NUMERALS[level - 1] ?? String(level);
