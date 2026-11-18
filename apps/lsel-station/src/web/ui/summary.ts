import { CREW } from "../../content/crew.ts";
import { DEPARTMENTS } from "../../content/departments.ts";
import { MODULES, numeral } from "../../content/modules.ts";
import { UNLOCKS } from "../../content/unlocks.ts";
import { type GameMap, sectorOf } from "../../sim/map.ts";
import type { Summary } from "../../sim/summary.ts";
import { stacks } from "./format.ts";

/** The "While you were away" panel's lines, most telling first. */
export function summaryLines(summary: Summary, map: GameMap): string[] {
  const gained = summary.items.filter((i) => i.change > 0);
  const used = summary.items.filter((i) => i.change < 0);
  return [
    ...summary.modules.map(
      ({ module, level }) => `${MODULES[module].name} ${numeral(level)} built`,
    ),
    ...summary.unlocks.map((unlock) => `${UNLOCKS[unlock].name} ready`),
    ...summary.crew.map((crew) => `${CREW[crew].name} joined the crew`),
    ...summary.claimed.map((sector) => `${sectorOf(map, sector).name} is yours`),
    ...summary.charted.map((sector) => `${sectorOf(map, sector).name} charted`),
    ...summary.levels.map(
      ({ department, from, to }) => `${DEPARTMENTS[department].name} level ${from} to ${to}`,
    ),
    ...(gained.length > 0
      ? [`Made ${stacks(gained.map(({ item, change }) => ({ item, amount: change })))}`]
      : []),
    ...(used.length > 0
      ? [`Used ${stacks(used.map(({ item, change }) => ({ item, amount: -change })))}`]
      : []),
  ];
}
