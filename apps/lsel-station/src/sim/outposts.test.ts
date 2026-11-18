import { describe, expect, test } from "bun:test";
import { apply } from "./commands.ts";
import { run, station } from "./fixture.ts";
import { HOME, type SectorId } from "./map.ts";
import { bedCount, outputBoost, routes } from "./rules.ts";
import type { GameState } from "./state.ts";

// seed 7: home has lanes to Ring 1 (pirates) and Rings 2 to 4; Ring 2 on to Belt 3 (Co-op) and Belts 2 and 4 (pirates)
const [RING_1, RING_2, RING_3, BELT_3] = [1, 2, 3, 7] as SectorId[];
if (RING_1 === undefined || RING_2 === undefined || RING_3 === undefined || BELT_3 === undefined) {
  throw new Error("unreachable");
}

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
