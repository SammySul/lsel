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
  readonly key: string;
  /** What opens it. */
  readonly needs: Requirement;
  /** Null while nothing in the department can be repeated, so nothing can be mastered. */
  readonly mastery: MasteryStyle | null;
};

const built = (module: ModuleId): Requirement => ({ kind: "module", module, level: 1 });

// in the order of the rail and of the keys 1 to 0
const table = {
  mining: { name: "Mining", key: "1", needs: built("drone-bay"), mastery: "extra-output" },
  salvage: {
    name: "Salvage",
    key: "2",
    needs: { kind: "unlock" },
    mastery: "extra-output",
  },
  skimming: { name: "Skimming", key: "3", needs: built("skimmer-bay"), mastery: "extra-output" },
  hydroponics: {
    name: "Hydroponics",
    key: "4",
    needs: built("greenhouse"),
    mastery: "extra-output",
  },
  refining: { name: "Refining", key: "5", needs: built("refinery"), mastery: "keep-input" },
  fabrication: {
    name: "Fabrication",
    key: "6",
    needs: built("workshop"),
    mastery: "extra-output",
  },
  construction: { name: "Construction", key: "7", needs: built("core"), mastery: null },
  survey: { name: "Survey", key: "8", needs: built("scanner"), mastery: "extra-output" },
  research: { name: "Research", key: "9", needs: built("lab"), mastery: null },
  trade: { name: "Trade", key: "0", needs: built("market-office"), mastery: "extra-credits" },
} as const satisfies Record<string, Department>;

export type DepartmentId = keyof typeof table;
export const DEPARTMENTS: Readonly<Record<DepartmentId, Department>> = table;
export const DEPARTMENT_IDS = idsOf(table);
