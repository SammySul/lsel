import { describe, expect, test } from "bun:test";
import type { ActionId } from "../content/actions.ts";
import { apply, type Command } from "./commands.ts";
import type { GameEvent } from "./events.ts";
import { LEVELS } from "./levels.ts";
import { HOME } from "./map.ts";
import { MASTERY, masteryChance } from "./mastery.ts";
import {
  actionLock,
  actionShown,
  bonusChance,
  crewSlots,
  masteryLevel,
  poolCap,
  poolShare,
  speedOf,
} from "./rules.ts";
import { type GameState, newGame } from "./state.ts";
import { tick } from "./tick.ts";

const FRESH: GameState = {
  seed: 7,
  rng: 7,
  ticks: 0,
  items: {},
  xp: {},
  mastery: {},
  pool: {},
  modules: { core: 1, "drone-bay": 1, refinery: 1 },
  unlocks: [],
  crew: ["ana-petrov"],
  jobs: {},
  projects: {},
  beds: [],
  fed: {},
  revealed: [HOME],
  outposts: [],
  glut: {},
};

/** Ticks `n` times and returns everything that happened. */
function run(state: GameState, n: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...tick(state));
  return events;
}

/** A new game, changed by `setup`, with Ana on `action`. */
function game(setup: Partial<GameState> = {}, ...commands: Command[]): GameState {
  const state = { ...newGame(7), ...setup };
  for (const command of commands) apply(state, command);
  return state;
}

const ana = (action: ActionId) => ({ kind: "assign", crew: "ana-petrov", action }) as const;
const ines = (action: ActionId) => ({ kind: "assign", crew: "ines-duarte", action }) as const;

describe("a new game", () => {
  test("starts with the Core, a Drone bay, a Refinery and Ana", () => {
    expect(newGame(7)).toEqual(FRESH);
  });

  test("with nobody assigned, time passes and nothing else changes", () => {
    const state = newGame(7);
    expect([run(state, 30), state]).toEqual([[], { ...FRESH, ticks: 30 }]);
  });
});

// Ana is 3% faster at everything: 206 ms of work per 200 ms tick
describe("mining the iron asteroid", () => {
  test("nothing is produced before the 3 s bar fills", () => {
    const state = game({}, ana("iron-asteroid"));
    run(state, 14);
    expect(state).toEqual({
      ...FRESH,
      ticks: 14,
      jobs: { "ana-petrov": { action: "iron-asteroid", progressMs: 2884, phase: "working" } },
    });
  });

  test("a full bar gives 1 ore, 5 XP, 3 mastery XP and half of that to the pool; the job repeats", () => {
    const state = game({}, ana("iron-asteroid"));
    run(state, 15);
    expect([state.items, state.xp, state.mastery, state.pool]).toEqual([
      { "iron-ore": 1 },
      { mining: 5 },
      { "iron-asteroid": 3 },
      { mining: 1.5 },
    ]);
    run(state, 35);
    expect(state).toEqual({
      ...FRESH,
      ticks: 50,
      items: { "iron-ore": 3 },
      xp: { mining: 15 },
      mastery: { "iron-asteroid": 9 },
      pool: { mining: 4.5 },
      jobs: { "ana-petrov": { action: "iron-asteroid", progressMs: 1300, phase: "working" } },
    });
  });

  test("an hour is 1,236 bars and level 26; with seed 7, mastery doubles 116 of them", () => {
    const state = game({}, ana("iron-asteroid"));
    run(state, 18_000);
    expect([
      state.xp.mining,
      LEVELS.levelOf(state.xp.mining ?? 0),
      state.mastery,
      state.items,
    ]).toEqual([6180, 26, { "iron-asteroid": 3708 }, { "iron-ore": 1352 }]);
  });
});

describe("refining", () => {
  test("a bar takes 2 ore as it starts and gives 1 plate; it waits when the ore runs out", () => {
    const state = game({ items: { "iron-ore": 5 } }, ana("iron-plate"));
    run(state, 1);
    expect([state.items, state.jobs["ana-petrov"]]).toEqual([
      { "iron-ore": 3 },
      { action: "iron-plate", progressMs: 206, phase: "working" },
    ]);
    const events = run(state, 38);
    expect(state).toEqual({
      ...FRESH,
      ticks: 39,
      items: { "iron-ore": 1, "iron-plate": 2 },
      xp: { refining: 16 },
      mastery: { "iron-plate": 8 },
      pool: { refining: 4 },
      jobs: { "ana-petrov": { action: "iron-plate", progressMs: 0, phase: "waiting" } },
    });
    expect(events.at(-1)).toEqual({
      kind: "job-waiting",
      crew: "ana-petrov",
      action: "iron-plate",
    });
  });

  test("a waiting job starts again by itself when its inputs return", () => {
    const state = game({}, ana("iron-plate"));
    expect([run(state, 1), run(state, 5)]).toEqual([
      [{ kind: "job-waiting", crew: "ana-petrov", action: "iron-plate" }],
      [],
    ]);
    state.items["iron-ore"] = 2;
    run(state, 1);
    expect([state.items, state.jobs["ana-petrov"]]).toEqual([
      { "iron-ore": 0 },
      { action: "iron-plate", progressMs: 206, phase: "working" },
    ]);
  });

  test("taking someone off a started bar gives its inputs back", () => {
    const state = game({ items: { "iron-ore": 5 } }, ana("iron-plate"));
    run(state, 5);
    apply(state, { kind: "unassign", crew: "ana-petrov" });
    expect([state.items, state.jobs]).toEqual([{ "iron-ore": 5 }, {}]);
  });
});

describe("construction", () => {
  const stocked = { items: { "iron-plate": 20, water: 10 } } as const;

  test("Habitat I takes 20 plate and 10 water and 10 minutes, then Ines joins and there are 2 slots", () => {
    const state = game({ items: { ...stocked.items } }, ana("habitat-1"));
    expect([run(state, 2912), state.modules.habitat, crewSlots(state)]).toEqual([[], undefined, 1]);
    expect(run(state, 1)).toEqual([
      { kind: "module-built", module: "habitat", level: 1 },
      { kind: "crew-joined", crew: "ines-duarte" },
      { kind: "action-done", crew: "ana-petrov", action: "habitat-1" },
      { kind: "level-up", department: "construction", level: 5 },
    ]);
    expect([state, crewSlots(state)]).toEqual([
      {
        ...FRESH,
        ticks: 2913,
        items: { "iron-plate": 0, water: 0 },
        xp: { construction: 300 },
        modules: { core: 1, "drone-bay": 1, refinery: 1, habitat: 1 },
        crew: ["ana-petrov", "ines-duarte"],
      },
      2,
    ]);
  });

  test("a project keeps its progress while nobody is on it, and is paid for once", () => {
    const state = game({ items: { ...stocked.items } }, ana("habitat-1"));
    run(state, 100);
    apply(state, { kind: "unassign", crew: "ana-petrov" });
    expect([state.items, state.jobs, state.projects]).toEqual([
      { "iron-plate": 0, water: 0 },
      {},
      { "habitat-1": 20_600 },
    ]);
    apply(state, ana("habitat-1"));
    run(state, 1);
    expect([state.items, state.jobs, state.projects]).toEqual([
      { "iron-plate": 0, water: 0 },
      { "ana-petrov": { action: "habitat-1", progressMs: 20_806, phase: "working" } },
      {},
    ]);
  });

  test("Reactor I opens at Construction level 5", () => {
    const state = game();
    expect([actionLock(state, "reactor-1"), apply(state, ana("reactor-1"))]).toEqual([
      { kind: "level", level: 5 },
      [],
    ]);
    state.xp.construction = 279;
    expect([actionLock(state, "reactor-1"), apply(state, ana("reactor-1"))]).toEqual([
      null,
      [{ kind: "job-started", crew: "ana-petrov", action: "reactor-1" }],
    ]);
  });

  test("a module's next level is listed once the one before is built, and needs the Core at that level", () => {
    const state = game();
    expect([actionShown(state, "habitat-1"), actionShown(state, "habitat-2")]).toEqual([
      true,
      false,
    ]);
    state.modules.habitat = 1;
    state.xp.construction = 1679;
    expect([
      actionShown(state, "habitat-1"),
      actionShown(state, "habitat-2"),
      actionLock(state, "habitat-2"),
      actionLock(state, "core-2"),
    ]).toEqual([false, true, { kind: "core", level: 2 }, null]);
  });
});

describe("crew", () => {
  test("only someone on the roster can be assigned, and only while a slot is free", () => {
    const state = game();
    expect(apply(state, ines("iron-asteroid"))).toEqual([]);
    state.crew.push("ines-duarte");
    apply(state, ana("iron-asteroid"));
    expect([crewSlots(state), apply(state, ines("ice-asteroid"))]).toEqual([1, []]);
    state.modules.habitat = 1;
    expect([crewSlots(state), apply(state, ines("ice-asteroid"))]).toEqual([
      2,
      [{ kind: "job-started", crew: "ines-duarte", action: "ice-asteroid" }],
    ]);
  });

  test("two crew work side by side, and Ines mines 10% faster", () => {
    const state = game(
      { crew: ["ana-petrov", "ines-duarte"], modules: { ...FRESH.modules, habitat: 1 } },
      ana("iron-asteroid"),
      ines("ice-asteroid"),
    );
    run(state, 14);
    expect([state.items, state.jobs]).toEqual([
      { ice: 1 },
      {
        "ana-petrov": { action: "iron-asteroid", progressMs: 2884, phase: "working" },
        "ines-duarte": { action: "ice-asteroid", progressMs: 80, phase: "working" },
      },
    ]);
  });

  test("a module project takes one crew member", () => {
    const state = game(
      {
        crew: ["ana-petrov", "ines-duarte"],
        modules: { ...FRESH.modules, habitat: 1 },
        xp: { construction: 279 },
      },
      ana("reactor-1"),
    );
    expect(apply(state, ines("reactor-1"))).toEqual([]);
  });

  test("speed adds up: Ana's 3%, 2% per Reactor level, 3% from a pool at 10%", () => {
    const state = game();
    const speeds = [speedOf(state, "ana-petrov", "iron-asteroid")];
    state.modules.reactor = 1;
    speeds.push(speedOf(state, "ana-petrov", "iron-asteroid"));
    state.pool.mining = 14_137;
    speeds.push(
      speedOf(state, "ana-petrov", "iron-asteroid"),
      speedOf(state, "ana-petrov", "water"),
    );
    expect(speeds.map((s) => Math.round(s * 100))).toEqual([103, 105, 108, 105]);
  });
});

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

describe("commands", () => {
  test("report the job they started or stopped, and nothing when they changed nothing", () => {
    const state = game();
    const unassign = { kind: "unassign", crew: "ana-petrov" } as const;
    expect([
      apply(state, unassign),
      apply(state, ana("iron-asteroid")),
      apply(state, ana("iron-asteroid")),
      apply(state, unassign),
    ]).toEqual([
      [],
      [{ kind: "job-started", crew: "ana-petrov", action: "iron-asteroid" }],
      [],
      [{ kind: "job-stopped", crew: "ana-petrov" }],
    ]);
  });

  test("moving someone to another job drops the bar they were on", () => {
    const state = game({ items: { "iron-ore": 2 } }, ana("iron-plate"));
    run(state, 3);
    apply(state, ana("iron-asteroid"));
    expect([state.items, state.jobs]).toEqual([
      { "iron-ore": 2 },
      { "ana-petrov": { action: "iron-asteroid", progressMs: 0, phase: "new" } },
    ]);
  });

  test("unassigning stops the job and keeps what was made", () => {
    const state = game({}, ana("iron-asteroid"));
    run(state, 20);
    apply(state, { kind: "unassign", crew: "ana-petrov" });
    run(state, 30);
    expect([state.items, state.xp, state.jobs, state.ticks]).toEqual([
      { "iron-ore": 1 },
      { mining: 5 },
      {},
      50,
    ]);
  });
});

describe("events", () => {
  test("a tick reports the bar that finished in it, and nothing otherwise", () => {
    const state = game({}, ana("iron-asteroid"));
    run(state, 14);
    expect([tick(state), tick(state)]).toEqual([
      [{ kind: "action-done", crew: "ana-petrov", action: "iron-asteroid" }],
      [],
    ]);
  });

  test("the bar that brings mining to 60 XP also reports level 2", () => {
    const state = game({}, ana("iron-asteroid"));
    run(state, 174);
    expect(tick(state)).toEqual([
      { kind: "action-done", crew: "ana-petrov", action: "iron-asteroid" },
      { kind: "level-up", department: "mining", level: 2 },
    ]);
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
