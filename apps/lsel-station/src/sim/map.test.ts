import { describe, expect, test } from "bun:test";
import { apply } from "./commands.ts";
import { assign, run, station } from "./fixture.ts";
import { generateMap, HOME, mapOf, type SectorId } from "./map.ts";
import { actionLock, chartTarget, claimable, ownedSectors, ownerOf } from "./rules.ts";

// seed 7: home has lanes to Ring 1 (pirates) and Rings 2 to 4; Ring 2 on to Belt 3 (Co-op) and Belts 2 and 4 (pirates)
const [RING_1, RING_2, RING_3, BELT_3] = [1, 2, 3, 7] as SectorId[];
if (RING_1 === undefined || RING_2 === undefined || RING_3 === undefined || BELT_3 === undefined) {
  throw new Error("unreachable");
}

describe("the map", () => {
  test("has the 36 sectors of the spec's table, whoever the seed gives them to", () => {
    const count = (seed: number) => {
      const holders: Record<string, number> = {};
      for (const { holder } of generateMap(seed).sectors)
        holders[holder] = (holders[holder] ?? 0) + 1;
      return holders;
    };
    const table = {
      you: 1,
      none: 3,
      pirates: 7,
      "co-op": 4,
      company: 4,
      navy: 4,
      archive: 4,
      strays: 9,
    };
    expect([count(7), count(8), count(123_456)]).toEqual([table, table, table]);
  });

  test("can be reached from home, all of it, on any seed", () => {
    const reached = (seed: number) => {
      const { sectors } = generateMap(seed);
      const seen = new Set<number>([HOME]);
      const queue: number[] = [HOME];
      for (let at = queue.pop(); at !== undefined; at = queue.pop()) {
        for (const lane of sectors[at]?.lanes ?? []) {
          if (!seen.has(lane)) {
            seen.add(lane);
            queue.push(lane);
          }
        }
      }
      return seen.size;
    };
    expect([7, 8, 9, 10, 123_456].map(reached)).toEqual([36, 36, 36, 36, 36]);
  });

  test("is the same for the same seed and different for another", () => {
    const names = (seed: number) =>
      generateMap(seed)
        .sectors.slice(0, 6)
        .map((s) => `${s.name}: ${s.holder}`);
    expect([names(7), generateMap(7), names(8)[1]]).toEqual([
      [
        "Home: you",
        "Ring 1: pirates",
        "Ring 2: none",
        "Ring 3: none",
        "Ring 4: none",
        "Belt 1: co-op",
      ],
      generateMap(7),
      "Ring 1: none",
    ]);
    expect(mapOf(7).sectors[RING_2]?.lanes.map(Number)).toEqual([0, 6, 7, 8]);
  });
});

describe("charting", () => {
  test("puts the sectors a lane from yours on the map, lowest number first, then has nothing left", () => {
    const state = station({ scanner: 1 }, { xp: { survey: 60 } });
    expect([chartTarget(state), assign(state, "chart").length]).toEqual([RING_1, 1]);
    expect(run(state, 582)).toEqual([]);
    expect(run(state, 1)).toEqual([
      { kind: "sector-revealed", sector: RING_1 },
      { kind: "action-done", crew: "ana-petrov", action: "chart" },
    ]);
    run(state, 583 * 3 + 5);
    expect([
      state.revealed.map(Number),
      state.xp,
      state.jobs["ana-petrov"]?.phase,
      chartTarget(state),
      actionLock(state, "chart"),
    ]).toEqual([[0, 1, 2, 3, 4], { survey: 300 }, "waiting", undefined, { kind: "charted" }]);
  });

  test("opens at Survey level 2", () => {
    const state = station({ scanner: 1 });
    expect([actionLock(state, "chart"), assign(state, "chart")]).toEqual([
      { kind: "level", level: 2 },
      [],
    ]);
  });
});

describe("claiming", () => {
  test("a beacon takes an unclaimed sector on the map that borders yours, and starts an outpost there", () => {
    const state = station({}, { revealed: [HOME, RING_1, RING_2], items: { "claim-beacon": 1 } });
    const claim = (sector: SectorId) => apply(state, { kind: "claim", sector });
    expect([
      claimable(state, RING_1),
      claimable(state, RING_2),
      claimable(state, RING_3),
      claim(RING_1),
      claim(RING_3),
      claim(RING_2),
      claim(RING_2),
    ]).toEqual([false, true, false, [], [], [{ kind: "sector-claimed", sector: RING_2 }], []]);
    expect([ownedSectors(state), state.outposts, state.items, ownerOf(state, RING_2)]).toEqual([
      [HOME, RING_2],
      [{ sector: RING_2, spec: null, modules: [], stored: 0 }],
      { "claim-beacon": 0 },
      "you",
    ]);
  });

  test("without a beacon nothing is taken, and a new sector lets the next ring be charted", () => {
    const state = station({}, { revealed: [HOME, RING_1, RING_2, RING_3, 4 as SectorId] });
    expect([apply(state, { kind: "claim", sector: RING_2 }), chartTarget(state)]).toEqual([
      [],
      undefined,
    ]);
    state.outposts.push({ sector: RING_2, spec: null, modules: [], stored: 0 });
    expect(chartTarget(state)).toBe(6 as SectorId);
  });
});
