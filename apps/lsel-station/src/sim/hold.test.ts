import { describe, expect, test } from "bun:test";
import { apply } from "./commands.ts";
import { ana, game, run, station } from "./fixture.ts";
import { HOME, type SectorId } from "./map.ts";
import { holdSize } from "./rules.ts";
import { summarize } from "./summary.ts";

const RING_2 = 2 as SectorId;

describe("the hold", () => {
  test("holds 500 of each item; Hold I to V raise it to 1,000, 2,500, 5,000, 10,000 and 25,000", () => {
    expect([0, 1, 2, 3, 4, 5].map((hold) => holdSize(station({ hold })))).toEqual([
      500, 1000, 2500, 5000, 10_000, 25_000,
    ]);
  });

  test("mining stops at 500 ore and waits, then goes on by itself once some is used", () => {
    const state = game({ items: { "iron-ore": 499 } }, ana("iron-asteroid"));
    expect(run(state, 30)).toEqual([
      { kind: "action-done", crew: "ana-petrov", action: "iron-asteroid" },
      { kind: "job-waiting", crew: "ana-petrov", action: "iron-asteroid" },
    ]);
    expect([state.items, state.jobs]).toEqual([
      { "iron-ore": 500 },
      { "ana-petrov": { action: "iron-asteroid", progressMs: 0, phase: "waiting" } },
    ]);
    state.items["iron-ore"] = 499;
    run(state, 16);
    expect(state.items).toEqual({ "iron-ore": 500 });
  });

  test("a Hold I built while a job waits lets it go on to 1,000", () => {
    const state = game({ items: { "iron-ore": 500 } }, ana("iron-asteroid"));
    run(state, 30);
    state.modules.hold = 1;
    run(state, 15);
    expect(state.items).toEqual({ "iron-ore": 501 });
  });

  test("a refining job waits without taking its inputs while its output is full", () => {
    const state = game({ items: { "iron-ore": 10, "iron-plate": 500 } }, ana("iron-plate"));
    run(state, 100);
    expect([state.items, state.jobs["ana-petrov"]?.phase]).toEqual([
      { "iron-ore": 10, "iron-plate": 500 },
      "waiting",
    ]);
  });

  test("salvage waits while any of its hauls is full", () => {
    const state = station({}, { unlocks: ["salvage-tug"], items: { water: 500 } }, "cargo-wreck");
    run(state, 500);
    expect([state.items, state.jobs["ana-petrov"]?.phase]).toEqual([{ water: 500 }, "waiting"]);
  });

  test("more than the hold from before there was one is kept, and nothing is added to it", () => {
    const state = game({ items: { "iron-ore": 20_000 } }, ana("iron-asteroid"));
    run(state, 100);
    expect(state.items).toEqual({ "iron-ore": 20_000 });
  });

  test("credits have no limit", () => {
    const state = station(
      { "market-office": 1 },
      { revealed: [HOME, 7 as SectorId], items: { credits: 1_000_000, "iron-plate": 10 } },
      "sell-plate",
    );
    run(state, 150);
    expect(state.items).toEqual({ credits: 1_000_040, "iron-plate": 0 });
  });

  test("a grown bed waits for room, then is harvested", () => {
    const state = station(
      { greenhouse: 1 },
      { beds: [{ crop: "algae", progressMs: 0 }, null], items: { algae: 497 } },
    );
    expect(run(state, 1600)).toEqual([]);
    expect(state.beds).toEqual([{ crop: "algae", progressMs: 300_000 }, null]);
    state.items.algae = 496;
    expect(run(state, 1)).toEqual([{ kind: "harvested", bed: 0, crop: "algae" }]);
    expect(state.items).toEqual({ algae: 500 });
  });

  test("an outpost pauses while one of its yields is full", () => {
    const state = station(
      {},
      {
        revealed: [HOME, RING_2],
        outposts: [{ sector: RING_2, spec: "mine", modules: [], stored: 0 }],
        items: { ice: 500 },
      },
    );
    run(state, 300);
    expect([state.items, state.outposts[0]?.stored]).toEqual([{ ice: 500 }, 0]);
  });

  test("the away summary lists what is full", () => {
    const before = game({}, ana("iron-asteroid"));
    before.items["iron-ore"] = 499;
    const after = structuredClone(before);
    apply(after, { kind: "unassign", crew: "ana-petrov" });
    apply(after, ana("iron-asteroid"));
    run(after, 30);
    expect(summarize(before, after, 6000).full).toEqual(["iron-ore"]);
  });
});
