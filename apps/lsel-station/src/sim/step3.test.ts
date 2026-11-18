import { describe, expect, test } from "bun:test";
import type { ActionId } from "../content/actions.ts";
import { apply } from "./commands.ts";
import type { GameEvent } from "./events.ts";
import {
  actionLock,
  actionShown,
  bedCount,
  departmentOpen,
  growthSpeed,
  poolCap,
  speedOf,
} from "./rules.ts";
import { type GameState, newGame } from "./state.ts";
import { tick } from "./tick.ts";

function run(state: GameState, n: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...tick(state));
  return events;
}

/** A new game with these modules built too, changed by `setup`. */
function station(
  modules: GameState["modules"],
  setup: Partial<GameState> = {},
  ...jobs: ActionId[]
): GameState {
  const fresh = newGame(7);
  const state = { ...fresh, ...setup, modules: { ...fresh.modules, ...modules } };
  for (const action of jobs) apply(state, { kind: "assign", crew: "ana-petrov", action });
  return state;
}

const ana = (action: ActionId) => ({ kind: "assign", crew: "ana-petrov", action }) as const;

// Ana works 206 ms per tick, so a 4 s bar takes 20 ticks, a 5 s bar 25 and a 6 s bar 30
describe("fabrication", () => {
  test("is closed until the Workshop is built", () => {
    const state = station({}, { items: { "iron-plate": 4 } });
    expect([departmentOpen(state, "fabrication"), apply(state, ana("basic-parts"))]).toEqual([
      false,
      [],
    ]);
  });

  test("2 plate make 1 basic parts in 5 s", () => {
    const state = station({ workshop: 1 }, { items: { "iron-plate": 4 } }, "basic-parts");
    run(state, 49);
    expect([state.items, state.xp, state.mastery, state.jobs["ana-petrov"]?.phase]).toEqual([
      { "iron-plate": 0, "basic-parts": 2 },
      { fabrication: 20 },
      { "basic-parts": 10 },
      "waiting",
    ]);
  });

  test("the salvage tug is made once, at level 3, and opens Salvage", () => {
    const state = station(
      { workshop: 1 },
      { items: { "basic-parts": 15, "iron-plate": 10 }, xp: { fabrication: 125 } },
    );
    expect([actionLock(state, "salvage-tug"), departmentOpen(state, "salvage")]).toEqual([
      { kind: "level", level: 3 },
      false,
    ]);
    state.xp.fabrication = 126;
    apply(state, ana("salvage-tug"));
    expect(run(state, 2330)).toEqual([]);
    expect(run(state, 1)).toEqual([
      { kind: "unlocked", unlock: "salvage-tug" },
      { kind: "action-done", crew: "ana-petrov", action: "salvage-tug" },
      { kind: "level-up", department: "fabrication", level: 5 },
    ]);
    expect([
      state.unlocks,
      state.jobs,
      state.items,
      departmentOpen(state, "salvage"),
      actionShown(state, "salvage-tug"),
    ]).toEqual([["salvage-tug"], {}, { "basic-parts": 0, "iron-plate": 0 }, true, false]);
  });
});

describe("salvage", () => {
  test("each bar rolls the wreck's loot table: with seed 7, ten bars give these ten things", () => {
    const state = station({}, { unlocks: ["salvage-tug"] }, "cargo-wreck");
    let bars = 0;
    while (bars < 10) bars += tick(state).filter((e) => e.kind === "action-done").length;
    expect([state.items, state.xp, state.ticks]).toEqual([
      { "iron-plate": 4, hydrogen: 1, water: 4, "basic-parts": 1 },
      { salvage: 90 },
      243,
    ]);
  });

  test("200 bars follow the weights 45, 25, 20, 10, plus 10 second rolls from mastery", () => {
    const state = station({}, { unlocks: ["salvage-tug"] }, "cargo-wreck");
    let bars = 0;
    while (bars < 200) bars += tick(state).filter((e) => e.kind === "action-done").length;
    expect(state.items).toEqual({ "iron-plate": 87, hydrogen: 23, water: 57, "basic-parts": 43 });
  });
});

describe("skimming and survey", () => {
  test("a skim is 1 hydrogen in 4 s, and 2 hydrogen refine into 1 fuel cell", () => {
    const state = station({ "skimmer-bay": 1 }, {}, "skim-hydrogen");
    run(state, 40);
    expect([state.items, state.xp]).toEqual([{ hydrogen: 2 }, { skimming: 14 }]);
    apply(state, ana("fuel-cell"));
    run(state, 20);
    expect([state.items, state.xp.refining, poolCap("refining")]).toEqual([
      { hydrogen: 0, "fuel-cell": 1 },
      8,
      212_055,
    ]);
  });

  test("a scan of the home ring is 1 data in 6 s", () => {
    const state = station({ scanner: 1 }, {}, "scan-home");
    expect([run(state, 29), state.items]).toEqual([[], {}]);
    run(state, 1);
    expect([state.items, state.xp, state.mastery]).toEqual([
      { data: 1 },
      { survey: 10 },
      { "scan-home": 6 },
    ]);
  });
});

describe("research", () => {
  test("a study spends data once and its bonus stays: drone tuning makes Mining 5% faster", () => {
    const state = station({ lab: 1 }, { items: { data: 30 } }, "drone-tuning");
    expect(run(state, 1165)).toEqual([]);
    expect(run(state, 1)).toEqual([
      { kind: "unlocked", unlock: "drone-tuning" },
      { kind: "action-done", crew: "ana-petrov", action: "drone-tuning" },
      { kind: "level-up", department: "research", level: 2 },
    ]);
    expect([
      state.items,
      state.unlocks,
      Math.round(speedOf(state, "ana-petrov", "iron-asteroid") * 100),
      Math.round(speedOf(state, "ana-petrov", "iron-plate") * 100),
      actionShown(state, "drone-tuning"),
    ]).toEqual([{ data: 0 }, ["drone-tuning"], 108, 103, false]);
  });

  test("a study that builds on another is listed once that one is done", () => {
    const state = station({ lab: 1 }, { xp: { research: 279 } });
    expect([actionShown(state, "auto-replant"), actionShown(state, "grow-lights")]).toEqual([
      false,
      true,
    ]);
    state.unlocks.push("grow-lights");
    expect([
      actionShown(state, "auto-replant"),
      actionShown(state, "grow-lights"),
      actionLock(state, "auto-replant"),
    ]).toEqual([true, false, null]);
  });
});

describe("hydroponics", () => {
  test("a Greenhouse comes with two empty beds", () => {
    const state = station(
      {},
      {
        items: { "basic-parts": 10, "iron-plate": 20, water: 20 },
        xp: { construction: 367 },
      },
      "greenhouse-1",
    );
    run(state, 4369);
    expect([state.modules.greenhouse, bedCount(state), state.beds]).toEqual([1, 2, [null, null]]);
  });

  test("planting takes 2 water, and only an empty bed that exists can be planted", () => {
    const state = station({ greenhouse: 1 }, { beds: [null, null], items: { water: 3 } });
    const plant = (bed: number) => apply(state, { kind: "plant", bed, crop: "algae" });
    expect([plant(0), plant(0), plant(2), plant(1), state.items, state.beds]).toEqual([
      [{ kind: "planted", bed: 0, crop: "algae" }],
      [],
      [],
      [],
      { water: 1 },
      [{ crop: "algae", progressMs: 0 }, null],
    ]);
  });

  test("algae grows in 5 minutes with nobody assigned, then the bed is empty again", () => {
    const state = station({ greenhouse: 1 }, { beds: [{ crop: "algae", progressMs: 0 }, null] });
    expect(run(state, 1499)).toEqual([]);
    expect(run(state, 1)).toEqual([{ kind: "harvested", bed: 0, crop: "algae" }]);
    expect([state.items, state.xp, state.beds]).toEqual([
      { algae: 4 },
      { hydroponics: 20 },
      [null, null],
    ]);
  });

  test("grow lights make beds 10% faster, and auto-replant plants again while there is water", () => {
    const state = station(
      { greenhouse: 1 },
      {
        beds: [{ crop: "algae", progressMs: 0 }, null],
        unlocks: ["grow-lights", "auto-replant"],
        items: { water: 2 },
      },
    );
    expect([Math.round(growthSpeed(state) * 100), run(state, 1363)]).toEqual([110, []]);
    run(state, 1);
    expect([state.items, state.beds]).toEqual([
      { water: 0, algae: 4 },
      [{ crop: "algae", progressMs: 0 }, null],
    ]);
    run(state, 1364);
    expect([state.items, state.beds]).toEqual([{ water: 0, algae: 8 }, [null, null]]);
  });

  test("the galley cooks 2 algae and 1 water into a ration in 5 s", () => {
    const state = station({ greenhouse: 1 }, { items: { algae: 2, water: 1 } }, "rations");
    run(state, 25);
    expect([state.items, state.xp]).toEqual([
      { algae: 0, water: 0, ration: 1 },
      { hydroponics: 8 },
    ]);
  });
});

describe("rations", () => {
  test("someone working eats one and is 10% faster for an hour of work", () => {
    const state = station({}, { items: { ration: 2 } }, "iron-asteroid");
    run(state, 1);
    expect([state.items, state.fed, state.jobs["ana-petrov"]?.progressMs]).toEqual([
      { ration: 1 },
      { "ana-petrov": 17_999 },
      226,
    ]);
    // 13 more ticks of 226 ms fill the 3 s bar: 14 ticks instead of 15
    run(state, 13);
    expect([state.items, state.fed]).toEqual([
      { ration: 1, "iron-ore": 1 },
      { "ana-petrov": 17_986 },
    ]);
    run(state, 17_986);
    expect([state.items.ration, state.fed]).toEqual([1, { "ana-petrov": 0 }]);
    run(state, 1);
    expect([state.items.ration, state.fed]).toEqual([0, { "ana-petrov": 17_999 }]);
  });

  test("nobody eats while idle, and without rations work goes on at its usual pace", () => {
    const idle = station({}, { items: { ration: 1 } });
    run(idle, 100);
    const hungry = station({}, {}, "iron-asteroid");
    run(hungry, 15);
    expect([idle.items, idle.fed, hungry.items, hungry.fed]).toEqual([
      { ration: 1 },
      {},
      { "iron-ore": 1 },
      {},
    ]);
  });
});
