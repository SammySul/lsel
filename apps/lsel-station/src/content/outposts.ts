import type { ItemId, Stack } from "./items.ts";
import { idsOf } from "./table.ts";

/** What an outpost is set up to do. It works with nobody assigned. */
export type Specialisation = {
  readonly name: string;
  readonly gives: string;
  /** Per trickle: one of each, every 20 seconds at the base rate. */
  readonly yields: readonly ItemId[];
  /** Extra Greenhouse beds. */
  readonly beds: number;
  /** Extra Trade routes. */
  readonly routes: number;
};

const specs = {
  mine: {
    name: "Mine",
    gives: "A trickle of iron ore and ice",
    yields: ["iron-ore", "ice"],
    beds: 0,
    routes: 0,
  },
  "trade-hub": {
    name: "Trade hub",
    gives: "A trickle of credits and one more route",
    yields: ["credits"],
    beds: 0,
    routes: 1,
  },
  farm: { name: "Farm", gives: "Two more grow beds", yields: [], beds: 2, routes: 0 },
} as const satisfies Record<string, Specialisation>;

export type SpecId = keyof typeof specs;
export const SPECS: Readonly<Record<SpecId, Specialisation>> = specs;
export const SPEC_IDS = idsOf(specs);

/** An outpost add-on, installed from a kit that Construction makes. */
export type OutpostModule = {
  readonly name: string;
  readonly gives: string;
  readonly kit: ItemId;
  /** Added to this outpost's output. */
  readonly own: number;
  /** Added to the output of each owned outpost a lane away. */
  readonly neighbors: number;
};

const modules = {
  depot: {
    name: "Depot",
    gives: "Half again its output",
    kit: "depot-kit",
    own: 0.5,
    neighbors: 0,
  },
  relay: {
    name: "Relay",
    gives: "A quarter more output for neighboring outposts",
    kit: "relay-kit",
    own: 0,
    neighbors: 0.25,
  },
} as const satisfies Record<string, OutpostModule>;

export type OutpostModuleId = keyof typeof modules;
export const OUTPOST_MODULES: Readonly<Record<OutpostModuleId, OutpostModule>> = modules;
export const OUTPOST_MODULE_IDS = idsOf(modules);

export const OUTPOST_SLOTS = 3;

/** Ticks between two trickles at the base rate: 20 seconds. */
export const TRICKLE_TICKS = 100;

/** The first specialisation is free; changing it costs this. */
export const RESPEC_COST: readonly Stack[] = [{ item: "credits", amount: 200 }];
