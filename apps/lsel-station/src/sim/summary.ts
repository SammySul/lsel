// What changed while the player was away.

import type { CrewId } from "../content/crew.ts";
import { DEPARTMENT_IDS, type DepartmentId } from "../content/departments.ts";
import { ITEM_IDS, type ItemId } from "../content/items.ts";
import { MODULE_IDS, type ModuleId } from "../content/modules.ts";
import type { UnlockId } from "../content/unlocks.ts";
import { LEVELS } from "./levels.ts";
import type { SectorId } from "./map.ts";
import { ownedSectors, room } from "./rules.ts";
import type { Snapshot } from "./state.ts";

/** What changed while the player was away: the "While you were away" panel. */
export type Summary = {
  readonly awayMs: number;
  /** Net change of each item that changed, in the order items are listed. */
  readonly items: readonly { readonly item: ItemId; readonly change: number }[];
  readonly levels: readonly {
    readonly department: DepartmentId;
    readonly from: number;
    readonly to: number;
  }[];
  readonly modules: readonly { readonly module: ModuleId; readonly level: number }[];
  readonly unlocks: readonly UnlockId[];
  readonly crew: readonly CrewId[];
  readonly charted: readonly SectorId[];
  readonly claimed: readonly SectorId[];
  /** Items with no room left at the end: what stopped being made. */
  readonly full: readonly ItemId[];
};

const added = <T>(before: readonly T[], after: readonly T[]) =>
  after.filter((x) => !before.includes(x));

export function summarize(before: Snapshot, after: Snapshot, awayMs: number): Summary {
  return {
    awayMs,
    items: ITEM_IDS.map((item) => ({
      item,
      change: Math.round((after.items[item] ?? 0) - (before.items[item] ?? 0)),
    })).filter(({ change }) => change !== 0),
    levels: DEPARTMENT_IDS.map((department) => ({
      department,
      from: LEVELS.levelOf(before.xp[department] ?? 0),
      to: LEVELS.levelOf(after.xp[department] ?? 0),
    })).filter(({ from, to }) => to > from),
    modules: MODULE_IDS.filter((m) => (after.modules[m] ?? 0) > (before.modules[m] ?? 0)).map(
      (module) => ({ module, level: after.modules[module] ?? 0 }),
    ),
    unlocks: added(before.unlocks, after.unlocks),
    crew: added(before.crew, after.crew),
    charted: added(before.revealed, after.revealed),
    claimed: added(ownedSectors(before), ownedSectors(after)),
    full: ITEM_IDS.filter((item) => room(after, item) === 0),
  };
}

/** Whether anything at all happened. */
export const eventful = (s: Summary) =>
  s.items.length +
    s.levels.length +
    s.modules.length +
    s.unlocks.length +
    s.crew.length +
    s.charted.length +
    s.claimed.length >
  0;
