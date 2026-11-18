import { idsOf } from "./table.ts";

export type CrewMember = { readonly name: string };

const table = {
  "ana-petrov": { name: "Ana Petrov" },
} as const satisfies Record<string, CrewMember>;

export type CrewId = keyof typeof table;
export const CREW: Readonly<Record<CrewId, CrewMember>> = table;
export const CREW_IDS = idsOf(table);
