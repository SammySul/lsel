import type { ActionId } from "../../content/actions.ts";
import type { ModuleId } from "../../content/modules.ts";
import type { Color } from "./palette.ts";
import { CORE, DRONE_BAY, HABITAT, REACTOR, REFINERY, type Sprite } from "./sprites.ts";

// World coordinates are art pixels with the Core's center at 0, 0. Every module has one fixed place.

/** Back to front: the Core is drawn over whatever joins it. */
export const DRAW_ORDER: readonly ModuleId[] = [
  "refinery",
  "habitat",
  "reactor",
  "drone-bay",
  "core",
];

/** Where each module's sprite goes, by its top left corner. */
export const MODULE_PLACES: Readonly<Record<ModuleId, { sprite: Sprite; x: number; y: number }>> = {
  refinery: { sprite: REFINERY, x: -32, y: -12 },
  habitat: { sprite: HABITAT, x: 30, y: -8 },
  reactor: { sprite: REACTOR, x: -7, y: 15 },
  "drone-bay": { sprite: DRONE_BAY, x: 15, y: -8 },
  core: { sprite: CORE, x: -15, y: -15 },
};

export type Site = {
  /** The rock, by its center. */
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** Lit, middle and shaded. */
  readonly shades: readonly [Color, Color, Color];
  /** Where a drone stops to mine it, by the drone's top left corner; its beam goes right from there. */
  readonly drone: { readonly x: number; readonly y: number };
  /** How many pixels the beam climbs for each pixel it travels. */
  readonly climb: number;
};

/** The rock each mining action is flown to. */
export const SITES: Readonly<Partial<Record<ActionId, Site>>> = {
  "iron-asteroid": {
    x: 58,
    y: -26,
    radius: 10,
    shades: ["rockLight", "rock", "rockDark"],
    drone: { x: 39, y: -21 },
    climb: 0.6,
  },
  "ice-asteroid": {
    x: 72,
    y: 8,
    radius: 8,
    shades: ["star", "hullLight", "hull"],
    drone: { x: 55, y: 6 },
    climb: 0,
  },
};

/** Where a docked drone sits on the Drone bay, by which mining job it flies. */
export const droneHome = (slot: number) => ({
  x: 16 + (slot % 2) * 6,
  y: -12 - Math.floor(slot / 2) * 4,
});

/** Where the Refinery's stack lets its vapor out. */
export const VENT = { x: -22, y: -13 };
