import { idsOf } from "./table.ts";

export type Department = { readonly name: string; readonly key: string };

const table = {
  mining: { name: "Mining", key: "1" },
} as const satisfies Record<string, Department>;

export type DepartmentId = keyof typeof table;
export const DEPARTMENTS: Readonly<Record<DepartmentId, Department>> = table;
export const DEPARTMENT_IDS = idsOf(table);
