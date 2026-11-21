import type { ActionId } from "../../content/actions.ts";
import type { ModuleId } from "../../content/modules.ts";
import type { Color } from "./palette.ts";
import {
  CORE,
  DRONE_BAY,
  GREENHOUSE,
  HABITAT,
  HOLD,
  LAB,
  MARKET_OFFICE,
  REACTOR,
  REFINERY,
  SCANNER,
  SKIMMER_BAY,
  type Sprite,
  WORKSHOP,
} from "./sprites.ts";

// world coordinates are art pixels from the Core's center; every module has one fixed place, on the spine or under it

export type Point = { readonly x: number; readonly y: number };

/** Back to front: what hangs under the spine first, the Core over whatever joins it. */
export const DRAW_ORDER: readonly ModuleId[] = [
  "workshop",
  "greenhouse",
  "lab",
  "skimmer-bay",
  "market-office",
  "reactor",
  "refinery",
  "habitat",
  "hold",
  "scanner",
  "drone-bay",
  "core",
];

/** Where each module's sprite goes, by its top left corner. */
export const MODULE_PLACES: Readonly<Record<ModuleId, Point & { sprite: Sprite }>> = {
  core: { sprite: CORE, x: -15, y: -15 },
  "drone-bay": { sprite: DRONE_BAY, x: 15, y: -8 },
  refinery: { sprite: REFINERY, x: -32, y: -12 },
  habitat: { sprite: HABITAT, x: 30, y: -8 },
  scanner: { sprite: SCANNER, x: 45, y: -16 },
  reactor: { sprite: REACTOR, x: -7, y: 15 },
  greenhouse: { sprite: GREENHOUSE, x: -27, y: 3 },
  workshop: { sprite: WORKSHOP, x: 15, y: 3 },
  lab: { sprite: LAB, x: 30, y: 3 },
  "skimmer-bay": { sprite: SKIMMER_BAY, x: 45, y: 3 },
  "market-office": { sprite: MARKET_OFFICE, x: 61, y: 3 },
  hold: { sprite: HOLD, x: 61, y: -8 },
};

export type Site = Point & {
  readonly radius: number;
  /** Lit, middle and shaded. */
  readonly shades: readonly [Color, Color, Color];
  /** Where a drone stops to mine it, by the drone's top left corner; its beam goes right from there. */
  readonly drone: Point;
  /** How many pixels the beam climbs for each pixel it travels. */
  readonly climb: number;
};

/** The rock each mining action is flown to, by its center. */
export const SITES: Readonly<Partial<Record<ActionId, Site>>> = {
  "iron-asteroid": {
    x: 76,
    y: -28,
    radius: 10,
    shades: ["rockLight", "rock", "rockDark"],
    drone: { x: 57, y: -23 },
    climb: 0.6,
  },
  "ice-asteroid": {
    x: 92,
    y: 6,
    radius: 8,
    shades: ["star", "hullLight", "hull"],
    drone: { x: 75, y: 4 },
    climb: 0,
  },
};

/** Where a docked drone sits on the Drone bay, by which mining job it flies. */
export const droneHome = (slot: number): Point => ({
  x: 16 + (slot % 2) * 6,
  y: -12 - Math.floor(slot / 2) * 4,
});

/** Where the Refinery's stack lets its vapor out. */
export const VENT: Point = { x: -22, y: -13 };

/** The wreck field the tug works, by each piece's top left corner. */
export const WRECKS: readonly Point[] = [
  { x: 68, y: 40 },
  { x: 82, y: 47 },
  { x: 60, y: 52 },
];

/** A trip between two points: the tug's from under the Workshop to the wrecks, the skimmer's out of the frame. */
export const TUG_TRIP = { home: { x: 19, y: 27 }, away: { x: 60, y: 40 } };
export const SKIMMER_TRIP = { home: { x: 48, y: 27 }, away: { x: 190, y: 120 } };
/** The freighter docks under the Market office and leaves along the lane, out of the frame. */
export const FREIGHTER_TRIP = { home: { x: 61, y: 27 }, away: { x: 175, y: 64 } };

/** Where the Workshop throws sparks, the Scanner's dish pings from, and the Lab's lights are. */
export const WORKSHOP_SPARKS: Point = { x: 21, y: 15 };
export const SCANNER_DISH: Point = { x: 52, y: -15 };
export const LAB_LIGHTS: readonly Point[] = [
  { x: 33, y: 13 },
  { x: 36, y: 13 },
  { x: 39, y: 13 },
];

/** The Greenhouse's four panes, by the bottom left pixel inside each: a bed's crop grows up from there. */
export const BED_PLOTS: readonly Point[] = [
  { x: -24, y: 15 },
  { x: -19, y: 15 },
  { x: -24, y: 21 },
  { x: -19, y: 21 },
];
