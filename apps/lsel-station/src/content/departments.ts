import type { ModuleId } from "./modules.ts";
import { idsOf } from "./table.ts";

/** What mastery of an item does in a department: a chance of twice the output, or of keeping the input. */
export type MasteryStyle = "extra-output" | "keep-input";

export type Department = {
  readonly name: string;
  readonly key: string;
  /** The module that opens it. */
  readonly needs: { readonly module: ModuleId; readonly level: number };
  /** Null while nothing in the department can be repeated, so nothing can be mastered. */
  readonly mastery: MasteryStyle | null;
};

const table = {
  mining: {
    name: "Mining",
    key: "1",
    needs: { module: "drone-bay", level: 1 },
    mastery: "extra-output",
  },
  refining: {
    name: "Refining",
    key: "5",
    needs: { module: "refinery", level: 1 },
    mastery: "keep-input",
  },
  construction: {
    name: "Construction",
    key: "7",
    needs: { module: "core", level: 1 },
    mastery: null,
  },
} as const satisfies Record<string, Department>;

export type DepartmentId = keyof typeof table;
export const DEPARTMENTS: Readonly<Record<DepartmentId, Department>> = table;
export const DEPARTMENT_IDS = idsOf(table);
