import { describe, expect, test } from "bun:test";
import { apply } from "./commands.ts";
import type { GameEvent } from "./events.ts";
import { ana, game, run } from "./fixture.ts";
import { LEVELS } from "./levels.ts";
import { MASTERY, masteryChance } from "./mastery.ts";
import { bonusChance, masteryLevel, poolCap, poolShare } from "./rules.ts";
import { tick } from "./tick.ts";

describe("mastery", () => {
  test("75 mastery XP is level 10, which the 25th bar reports", () => {
    const state = game({}, ana("iron-asteroid"));
    const steps = (events: GameEvent[]) => events.filter((e) => e.kind === "mastery-step");
    expect([steps(run(state, 364)), masteryLevel(state, "iron-asteroid")]).toEqual([[], 9]);
    expect([steps(run(state, 1)), state.mastery, masteryLevel(state, "iron-asteroid")]).toEqual([
      [{ kind: "mastery-step", action: "iron-asteroid", level: 10 }],
      { "iron-asteroid": 75 },
      10,
    ]);
  });

  test("the chance grows at 10, 25, 50, 75 and 99, to 30%", () => {
    expect([9, 10, 24, 25, 50, 75, 98, 99].map(masteryChance)).toEqual([
      0, 0.05, 0.05, 0.1, 0.15, 0.2, 0.2, 0.3,
    ]);
    expect([MASTERY.total, MASTERY.levelOf(141_369), MASTERY.levelOf(141_370)]).toEqual([
      141_370, 98, 99,
    ]);
  });

  test("at mastery 99 a mined bar is doubled about 3 times in 10: 271 of 1,000 with seed 7", () => {
    const state = game({ mastery: { "iron-asteroid": 141_370 } }, ana("iron-asteroid"));
    let bars = 0;
    while (bars < 1000) bars += tick(state).filter((e) => e.kind === "action-done").length;
    expect([state.items, state.xp]).toEqual([{ "iron-ore": 1271 }, { mining: 5000 }]);
  });

  test("at mastery 99 refining keeps its ore about 3 times in 10: 2,000 ore make 1,404 plate with seed 7", () => {
    const state = game(
      { mastery: { "iron-plate": 141_370 }, items: { "iron-ore": 2000 } },
      ana("iron-plate"),
    );
    while (state.jobs["ana-petrov"]?.phase !== "waiting") tick(state);
    expect(state.items).toEqual({ "iron-ore": 0, "iron-plate": 1404 });
  });

  test("construction has nothing to master", () => {
    const state = game({ items: { "iron-plate": 20, water: 10 } }, ana("habitat-1"));
    run(state, 2913);
    expect([state.mastery, state.pool, bonusChance(state, "habitat-1")]).toEqual([{}, {}, 0]);
  });
});

describe("the mastery pool", () => {
  test("is full at half of its items' mastery to 99, and gives its bonuses as it fills", () => {
    const state = game();
    expect([poolCap("mining"), poolCap("construction")]).toEqual([141_370, 0]);
    state.pool.mining = 35_342;
    expect([poolShare(state, "mining"), bonusChance(state, "iron-asteroid")]).toEqual([
      35_342 / 141_370,
      0,
    ]);
    state.pool.mining = 35_343;
    expect(bonusChance(state, "iron-asteroid")).toBe(0.05);
  });

  test("never holds more than its cap", () => {
    const state = game({ pool: { mining: 141_369 } }, ana("iron-asteroid"));
    run(state, 15);
    expect(state.pool).toEqual({ mining: 141_370 });
  });

  test("spending it raises an item by one mastery level, for the XP that level still needs", () => {
    const state = game({ pool: { mining: 100 }, mastery: { "iron-asteroid": 4 } });
    const spend = { kind: "spend-pool", action: "iron-asteroid" } as const;
    expect([apply(state, spend), state.pool, state.mastery]).toEqual([
      [],
      { mining: 98 },
      { "iron-asteroid": 6 },
    ]);
    state.mastery["iron-asteroid"] = 70;
    expect([apply(state, spend), state.pool, masteryLevel(state, "iron-asteroid")]).toEqual([
      [{ kind: "mastery-step", action: "iron-asteroid", level: 10 }],
      { mining: 93 },
      10,
    ]);
  });

  test("cannot be spent beyond what it holds, or on a module", () => {
    const state = game({ pool: { mining: 5, construction: 500 } });
    expect([
      apply(state, { kind: "spend-pool", action: "iron-asteroid" }),
      apply(state, { kind: "spend-pool", action: "habitat-1" }),
      state.pool,
    ]).toEqual([[], [], { mining: 5, construction: 500 }]);
  });
});

describe("levels", () => {
  test("the next level costs round(60 × 1.1^(level − 1))", () => {
    expect([1, 2, 3, 4, 15, 98].map(LEVELS.forNext)).toEqual([60, 66, 73, 80, 228, 621_215]);
  });

  test("a level starts at the summed cost of the ones before it", () => {
    expect([0, 59, 60, 125, 126, 279, 1678, 1679].map(LEVELS.levelOf)).toEqual([
      1, 1, 2, 2, 3, 5, 14, 15,
    ]);
  });

  test("level 99 takes 6,832,764 XP and is the cap", () => {
    expect([
      LEVELS.levelOf(6_832_763),
      LEVELS.levelOf(6_832_764),
      LEVELS.levelOf(50_000_000),
      LEVELS.toReachNext(98),
      LEVELS.toReachNext(99),
    ]).toEqual([98, 99, 99, 6_832_764, null]);
  });
});
