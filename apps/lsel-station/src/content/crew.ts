// The crew members the station can hire, and the one thing each is better at.

import type { DepartmentId } from "./departments.ts";
import { idsOf } from "./table.ts";

/** Each crew member is better at one thing. */
export type Specialty = {
  readonly kind: "speed";
  readonly department: DepartmentId | "all";
  readonly bonus: number;
};

export type CrewMember = {
  readonly name: string;
  readonly bio: string;
  readonly specialty: Specialty;
};

const table = {
  "ana-petrov": {
    name: "Ana Petrov",
    bio: "Came with the station. Fixes whatever is nearest.",
    specialty: { kind: "speed", department: "all", bonus: 0.03 },
  },
  "ines-duarte": {
    name: "Ines Duarte",
    bio: "Ran drones for the Co-op until the rock ran out.",
    specialty: { kind: "speed", department: "mining", bonus: 0.1 },
  },
  "tomas-greer": {
    name: "Tomas Greer",
    bio: "Builds it once.",
    specialty: { kind: "speed", department: "construction", bonus: 0.1 },
  },
  "carla-voss": {
    name: "Carla Voss",
    bio: "Left the Company with its refinery manuals.",
    specialty: { kind: "speed", department: "refining", bonus: 0.1 },
  },
} as const satisfies Record<string, CrewMember>;

export type CrewId = keyof typeof table;
export const CREW: Readonly<Record<CrewId, CrewMember>> = table;
export const CREW_IDS = idsOf(table);

export const STARTING_CREW: CrewId = "ana-petrov";

// until hiring exists (factions, step 6), each Habitat level brings the next of these for free
export const HABITAT_RECRUITS: readonly CrewId[] = ["ines-duarte", "tomas-greer", "carla-voss"];
