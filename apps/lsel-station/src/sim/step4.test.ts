import { describe, expect, test } from "bun:test";
import type { ActionId } from "../content/actions.ts";
import type { CrewId } from "../content/crew.ts";
import { apply } from "./commands.ts";
import type { GameEvent } from "./events.ts";
import { generateMap, HOME, mapOf, type SectorId } from "./map.ts";
import {
  actionLock,
  actionShown,
  bedCount,
  bonusChance,
  chartTarget,
  claimable,
  marketOpen,
  outputBoost,
  ownedSectors,
  ownerOf,
  routes,
} from "./rules.ts";
import { type GameState, newGame } from "./state.ts";
import { tick } from "./tick.ts";

function run(state: GameState, n: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...tick(state));
  return events;
}

function station(modules: GameState["modules"], setup: Partial<GameState> = {}): GameState {
  const fresh = newGame(7);
  return { ...fresh, ...setup, modules: { ...fresh.modules, ...modules } };
}

const assign = (state: GameState, action: ActionId, crew: CrewId = "ana-petrov") =>
  apply(state, { kind: "assign", crew, action });

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

describe("outposts", () => {
  const withOutpost = (setup: Partial<GameState> = {}) =>
    station(
      {},
      {
        revealed: [HOME, RING_2],
        outposts: [{ sector: RING_2, spec: null, modules: [], stored: 0 }],
        ...setup,
      },
    );

  test("a Mine gives 1 iron ore and 1 ice every 20 seconds with nobody assigned", () => {
    const state = withOutpost();
    expect(run(state, 200)).toEqual([]);
    expect(state.items).toEqual({});
    expect(apply(state, { kind: "specialize", sector: RING_2, spec: "mine" })).toEqual([
      { kind: "outpost-changed", sector: RING_2 },
    ]);
    run(state, 99);
    expect(state.items).toEqual({});
    run(state, 1);
    expect(state.items).toEqual({ "iron-ore": 1, ice: 1 });
  });

  test("a depot is installed from a kit and adds half again, up to three add-ons", () => {
    const state = withOutpost({ items: { "depot-kit": 4 } });
    apply(state, { kind: "specialize", sector: RING_2, spec: "mine" });
    const install = () => apply(state, { kind: "install", sector: RING_2, module: "depot" });
    expect([install().length, outputBoost(state, RING_2)]).toEqual([1, 1.5]);
    run(state, 210);
    expect(state.items).toEqual({ "depot-kit": 3, "iron-ore": 3, ice: 3 });
    expect([install().length, install().length, install(), state.items["depot-kit"]]).toEqual([
      1,
      1,
      [],
      1,
    ]);
  });

  test("a relay adds a quarter to the outposts a lane away", () => {
    const state = withOutpost({ items: { "relay-kit": 1 } });
    state.outposts.push({ sector: BELT_3, spec: null, modules: [], stored: 0 });
    apply(state, { kind: "install", sector: BELT_3, module: "relay" });
    expect([outputBoost(state, RING_2), outputBoost(state, BELT_3)]).toEqual([1.25, 1]);
  });

  test("the first set-up is free and a change costs 200 credits", () => {
    const state = withOutpost();
    const set = (spec: "mine" | "farm") =>
      apply(state, { kind: "specialize", sector: RING_2, spec });
    expect([set("mine").length, set("mine"), set("farm")]).toEqual([1, [], []]);
    state.items.credits = 250;
    expect([set("farm").length, state.items, state.outposts[0]?.spec]).toEqual([
      1,
      { credits: 50 },
      "farm",
    ]);
  });

  test("a Farm given up keeps what is planted where beds remain, and refunds what no longer fits", () => {
    const state = withOutpost({ items: { credits: 200, water: 6 } });
    state.modules.greenhouse = 1;
    apply(state, { kind: "specialize", sector: RING_2, spec: "farm" });
    for (const bed of [0, 2, 3]) apply(state, { kind: "plant", bed, crop: "algae" });
    run(state, 10);
    apply(state, { kind: "specialize", sector: RING_2, spec: "mine" });
    expect([state.beds, state.items]).toEqual([
      [
        { crop: "algae", progressMs: 2000 },
        { crop: "algae", progressMs: 2000 },
      ],
      { credits: 0, water: 2 },
    ]);
  });

  test("a Farm adds two beds to a Greenhouse, and a Trade hub a route and a trickle of credits", () => {
    const state = withOutpost({ beds: [null, null] });
    state.modules.greenhouse = 1;
    state.modules["market-office"] = 1;
    apply(state, { kind: "specialize", sector: RING_2, spec: "farm" });
    expect([bedCount(state), state.beds, routes(state)]).toEqual([4, [null, null, null, null], 1]);
    state.items.credits = 200;
    apply(state, { kind: "specialize", sector: RING_2, spec: "trade-hub" });
    run(state, 100);
    expect([bedCount(state), state.beds, routes(state), state.items]).toEqual([
      2,
      [null, null],
      2,
      { credits: 1 },
    ]);
  });
});

describe("trade", () => {
  const market = (setup: Partial<GameState> = {}) =>
    station({ "market-office": 1 }, { revealed: [HOME, RING_2, BELT_3], ...setup });

  test("the Co-op's market is reachable once one of its sectors is on the map", () => {
    const hidden = station({ "market-office": 1 });
    const state = market();
    expect([
      marketOpen(hidden, "co-op"),
      actionShown(hidden, "sell-plate"),
      marketOpen(state, "co-op"),
      actionShown(state, "sell-plate"),
      marketOpen(state, "company"),
    ]).toEqual([false, false, true, true, false]);
  });

  test("a 30 s run sells 10 plate for 40 credits, and a little less each time it is repeated", () => {
    const state = market({ items: { "iron-plate": 30 } });
    assign(state, "sell-plate");
    run(state, 146);
    expect([state.items, state.xp]).toEqual([{ "iron-plate": 10, credits: 40 }, { trade: 40 }]);
    run(state, 146);
    expect(state.items).toEqual({ "iron-plate": 0, credits: 79 });
    run(state, 145);
    expect([state.items, state.jobs["ana-petrov"]?.phase]).toEqual([
      { "iron-plate": 0, credits: 117 },
      "waiting",
    ]);
  });

  test("the price never falls more than 30%, and recovers a step in 5 minutes", () => {
    const state = market({ items: { "iron-plate": 10 }, glut: { "sell-plate": 0.3 } });
    assign(state, "sell-plate");
    run(state, 146);
    expect(state.items).toEqual({ "iron-plate": 0, credits: 28 });
    const resting = market({ glut: { "sell-plate": 0.03 } });
    run(resting, 1400);
    expect(Object.keys(resting.glut)).toEqual(["sell-plate"]);
    run(resting, 110);
    expect(resting.glut).toEqual({});
  });

  test("tier 2 goods are bought for credits", () => {
    const state = market({ items: { credits: 100 } });
    assign(state, "buy-wire");
    run(state, 146);
    expect(state.items).toEqual({ credits: 0, "copper-wire": 5 });
  });

  test("mastery doubles a sale's credits, and never a purchase: buys cannot be mastered", () => {
    const top = 141_370;
    const selling = market({ items: { "iron-plate": 100 }, mastery: { "sell-plate": top } });
    const buying = market({ items: { credits: 1000 }, mastery: { "buy-wire": top } });
    assign(selling, "sell-plate");
    assign(buying, "buy-wire");
    run(selling, 1460);
    run(buying, 1460);
    expect([
      bonusChance(selling, "sell-plate"),
      selling.items.credits,
      bonusChance(buying, "buy-wire"),
      buying.items,
      buying.mastery,
      // ten sales are 351 credits undoubled; seed 7 doubles three of them
    ]).toEqual([0.3, 462, 0, { credits: 0, "copper-wire": 50 }, { "buy-wire": top }]);
  });

  test("one Market office level is one run at a time", () => {
    const state = market({
      crew: ["ana-petrov", "ines-duarte"],
      items: { "iron-plate": 30, credits: 100 },
    });
    state.modules.habitat = 1;
    expect([
      routes(state),
      assign(state, "sell-plate").length,
      assign(state, "buy-wire", "ines-duarte"),
    ]).toEqual([1, 1, []]);
  });
});
