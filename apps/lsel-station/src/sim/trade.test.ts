import { describe, expect, test } from "bun:test";
import { assign, run, station } from "./fixture.ts";
import { HOME, type SectorId } from "./map.ts";
import { actionShown, bonusChance, marketOpen, routes } from "./rules.ts";
import type { GameState } from "./state.ts";

// seed 7: home has lanes to Ring 1 (pirates) and Rings 2 to 4; Ring 2 on to Belt 3 (Co-op) and Belts 2 and 4 (pirates)
const [RING_1, RING_2, RING_3, BELT_3] = [1, 2, 3, 7] as SectorId[];
if (RING_1 === undefined || RING_2 === undefined || RING_3 === undefined || BELT_3 === undefined) {
  throw new Error("unreachable");
}

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
