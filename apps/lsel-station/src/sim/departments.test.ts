import { describe, expect, test } from "bun:test";
import { apply } from "./commands.ts";
import { ana, run, station } from "./fixture.ts";
import { actionLock, actionShown, departmentOpen, poolCap, speedOf } from "./rules.ts";
import { tick } from "./tick.ts";

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
