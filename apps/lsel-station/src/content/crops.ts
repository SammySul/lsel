// What a Greenhouse bed can grow, and how long each takes.

import type { ItemId, Stack } from "./items.ts";
import { idsOf } from "./table.ts";

/** Grown in a Greenhouse bed on a timer, with nobody assigned. */
export type Crop = {
  readonly name: string;
  readonly growMs: number;
  /** Taken when a bed is planted. */
  readonly cost: readonly Stack[];
  readonly item: ItemId;
  readonly amount: number;
  /** Hydroponics XP per harvest. */
  readonly xp: number;
};

const table = {
  algae: {
    name: "Algae",
    growMs: 5 * 60_000,
    cost: [{ item: "water", amount: 2 }],
    item: "algae",
    amount: 4,
    xp: 20,
  },
} as const satisfies Record<string, Crop>;

export type CropId = keyof typeof table;
export const CROPS: Readonly<Record<CropId, Crop>> = table;
export const CROP_IDS = idsOf(table);

/** Grow beds per Greenhouse level. */
export const BEDS_PER_LEVEL = 2;
