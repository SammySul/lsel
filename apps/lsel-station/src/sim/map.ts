import { type Owner, REGIONS } from "../content/factions.ts";
import { nextRandom } from "./rng.ts";

export type SectorId = number & { readonly __brand: "SectorId" };

export type Sector = {
  readonly id: SectorId;
  readonly name: string;
  /** 1 to 6: which resources it has and how hard it is. */
  readonly tier: number;
  /** Where it sits on the map, in art pixels from the home sector. */
  readonly x: number;
  readonly y: number;
  /** Who holds it when the game starts. */
  readonly holder: Owner;
  /** Its planet's seed. */
  readonly seed: number;
  /** The sectors a lane away. */
  readonly lanes: readonly SectorId[];
};

export type GameMap = { readonly sectors: readonly Sector[] };

export const HOME = 0 as SectorId;

const COLUMN = 26;
const ROW = 20;

/**
 * The 36 sectors of a game: home, then one column per tier with that region's holders in a shuffled order, then
 * the Foundry alone at the far end. Every sector has a lane back toward home, so all of it can be reached.
 */
export function generateMap(seed: number): GameMap {
  // the map has its own generator, so drawing it never moves the game's
  let rng = (seed ^ 0x5ec70a) | 0;
  const random = () => {
    const next = nextRandom(rng);
    rng = next.rng;
    return next.value;
  };
  const jitter = (reach: number) => Math.round((random() * 2 - 1) * reach);

  type Draft = {
    name: string;
    tier: number;
    x: number;
    y: number;
    holder: Owner;
    lanes: Set<number>;
  };
  const columns: Draft[][] = [
    [{ name: "Home", tier: 1, x: 0, y: 0, holder: "you", lanes: new Set() }],
  ];
  REGIONS.forEach((region, index) => {
    const holders = [...region.holders];
    for (let i = holders.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const swap = holders[i] ?? "none";
      holders[i] = holders[j] ?? "none";
      holders[j] = swap;
    }
    columns.push(
      holders.map((holder, row) => ({
        name: `${region.sector} ${row + 1}`,
        tier: index + 1,
        x: (index + 1) * COLUMN + jitter(4),
        y: Math.round((row - (holders.length - 1) / 2) * ROW) + jitter(5),
        holder,
        lanes: new Set<number>(),
      })),
    );
  });
  columns.push([
    {
      name: "The Foundry",
      tier: 6,
      x: (REGIONS.length + 1) * COLUMN,
      y: 0,
      holder: "strays",
      lanes: new Set(),
    },
  ]);

  const drafts = columns.flat();
  const idOf = (draft: Draft) => drafts.indexOf(draft);
  const join = (a: Draft, b: Draft) => {
    a.lanes.add(idOf(b));
    b.lanes.add(idOf(a));
  };
  const nearest = (to: Draft, among: readonly Draft[]) =>
    [...among].sort((a, b) => Math.abs(a.y - to.y) - Math.abs(b.y - to.y));
  for (let c = 1; c < columns.length; c++) {
    const here = columns[c] ?? [];
    const before = columns[c - 1] ?? [];
    for (const sector of here) {
      const [first, second] = nearest(sector, before);
      if (first !== undefined) join(sector, first);
      if (second !== undefined && random() < 0.4) join(sector, second);
    }
    // nothing in the column before is a dead end
    for (const sector of before) {
      const forward = here.some((other) => sector.lanes.has(idOf(other)));
      const [first] = nearest(sector, here);
      if (!forward && first !== undefined) join(sector, first);
    }
    for (let row = 1; row < here.length; row++) {
      const a = here[row - 1];
      const b = here[row];
      if (a !== undefined && b !== undefined && random() < 0.35) join(a, b);
    }
  }

  return {
    sectors: drafts.map((draft, id) => ({
      id: id as SectorId,
      name: draft.name,
      tier: draft.tier,
      x: draft.x,
      y: draft.y,
      holder: draft.holder,
      seed: Math.imul(seed ^ (id + 1), 2654435761) >>> 0,
      lanes: [...draft.lanes].sort((a, b) => a - b) as SectorId[],
    })),
  };
}

let last: { seed: number; map: GameMap } | undefined;

/** The map of the game with this seed. It is never stored: the seed is. */
export function mapOf(seed: number): GameMap {
  if (last?.seed !== seed) last = { seed, map: generateMap(seed) };
  return last.map;
}

/** A sector of a map. Ids come from the map itself, so the lookup cannot miss. */
export function sectorOf(map: GameMap, id: SectorId): Sector {
  const sector = map.sectors[id];
  if (sector === undefined) throw new Error(`no sector ${id} on this map`);
  return sector;
}
