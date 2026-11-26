// The departments, what opens each, and what mastery of an item gives in it.

import type { ModuleId } from "./modules.ts";
import { idsOf } from "./table.ts";

/** What mastery of an item does in a department: a chance of twice the output, of keeping the input, or of twice a sale's credits. */
export type MasteryStyle = "extra-output" | "keep-input" | "extra-credits";

/** A module at a level, or an unlock whose effect opens the department (the unlock names it, not the reverse). */
export type Requirement =
  | { readonly kind: "module"; readonly module: ModuleId; readonly level: number }
  | { readonly kind: "unlock" };

export type Department = {
  readonly name: string;
  /** What it is for and how it works, in one line. */
  readonly about: string;
  readonly key: string;
  /** What opens it. */
  readonly needs: Requirement;
  /** Null while nothing in the department can be repeated, so nothing can be mastered. */
  readonly mastery: MasteryStyle | null;
};

const built = (module: ModuleId): Requirement => ({ kind: "module", module, level: 1 });

// in the order of the rail and of the keys 1 to 0
const table = {
  mining: {
    name: "Mining",
    about:
      "Drones pull ore and ice from nearby rock. Nothing goes in, and a job runs until you stop it.",
    key: "1",
    needs: built("drone-bay"),
    mastery: "extra-output",
  },
  salvage: {
    name: "Salvage",
    about: "Strip old wrecks. Each haul is one find, picked at random from the list.",
    key: "2",
    needs: { kind: "unlock" },
    mastery: "extra-output",
  },
  skimming: {
    name: "Skimming",
    about:
      "Skim gas from the planet's upper air. Nothing goes in, and a job runs until you stop it.",
    key: "3",
    needs: built("skimmer-bay"),
    mastery: "extra-output",
  },
  hydroponics: {
    name: "Hydroponics",
    about:
      "Beds grow crops on their own; crew turn the harvest into rations. Crew at work eat a ration an hour and work 10% faster while fed.",
    key: "4",
    needs: built("greenhouse"),
    mastery: "extra-output",
  },
  refining: {
    name: "Refining",
    about:
      "Turns ore, ice and gas into plate, water and fuel cells. Mastery here can keep the input instead of using it.",
    key: "5",
    needs: built("refinery"),
    mastery: "keep-input",
  },
  fabrication: {
    name: "Fabrication",
    about: "Makes parts and equipment from refined goods.",
    key: "6",
    needs: built("workshop"),
    mastery: "extra-output",
  },
  construction: {
    name: "Construction",
    about:
      "Builds station modules, claim beacons and outpost kits. A stopped project keeps its progress. No module goes above the Core's level.",
    key: "7",
    needs: built("core"),
    mastery: null,
  },
  survey: {
    name: "Survey",
    about: "Scans for data, and charts lanes to the next sectors on the map.",
    key: "8",
    needs: built("scanner"),
    mastery: "extra-output",
  },
  research: {
    name: "Research",
    about: "Spends data on improvements that are kept for good.",
    key: "9",
    needs: built("lab"),
    mastery: null,
  },
  trade: {
    name: "Trade",
    about:
      "Runs goods to faction markets for credits, or buys what you lack. Selling the same good again pays less; its price recovers over time.",
    key: "0",
    needs: built("market-office"),
    mastery: "extra-credits",
  },
} as const satisfies Record<string, Department>;

export type DepartmentId = keyof typeof table;
export const DEPARTMENTS: Readonly<Record<DepartmentId, Department>> = table;
export const DEPARTMENT_IDS = idsOf(table);
