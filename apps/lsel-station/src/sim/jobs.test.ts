import { describe, expect, test } from "bun:test";
import { apply } from "./commands.ts";
import { ana, FRESH, game, ines, run } from "./fixture.ts";
import { LEVELS } from "./levels.ts";
import { crewSlots, speedOf } from "./rules.ts";
import { newGame } from "./state.ts";
import { tick } from "./tick.ts";

describe("a new game", () => {
  test("starts with the Core, a Drone bay, a Refinery and Ana", () => {
    expect(newGame(7)).toEqual(FRESH);
  });

  test("with nobody assigned, time passes and nothing else changes", () => {
    const state = newGame(7);
    expect([run(state, 30), state]).toEqual([[], { ...FRESH, ticks: 30 }]);
  });
});

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
