import { describe, expect, test } from "bun:test";
import { apply } from "./commands.ts";
import { levelOf, xpForNext, xpToReachNext } from "./levels.ts";
import { type GameState, newGame } from "./state.ts";
import { TICK_MS, tick } from "./tick.ts";

function run(state: GameState, ms: number): void {
  for (let i = 0; i < ms / TICK_MS; i++) tick(state);
}

function mining(): GameState {
  const state = newGame(7);
  apply(state, { kind: "assign", crew: "ana-petrov", action: "iron-asteroid" });
  return state;
}

describe("mining the iron asteroid", () => {
  test("nothing is produced before the 3 s bar fills", () => {
    const state = mining();
    run(state, 2800);
    expect(state).toEqual({
      seed: 7,
      ticks: 14,
      items: {},
      xp: {},
      jobs: { "ana-petrov": { action: "iron-asteroid", progressMs: 2800 } },
    });
  });

  test("each full bar yields 1 iron ore and 5 mining XP, and the job repeats", () => {
    const state = mining();
    run(state, 3000);
    expect([state.items, state.xp]).toEqual([{ "iron-ore": 1 }, { mining: 5 }]);
    run(state, 7000);
    expect(state).toEqual({
      seed: 7,
      ticks: 50,
      items: { "iron-ore": 3 },
      xp: { mining: 15 },
      jobs: { "ana-petrov": { action: "iron-asteroid", progressMs: 1000 } },
    });
  });

  test("an hour of mining is 1,200 ore and level 26", () => {
    const state = mining();
    run(state, 3_600_000);
    expect([state.items["iron-ore"], state.xp.mining, levelOf(state.xp.mining ?? 0)]).toEqual([
      1200, 6000, 26,
    ]);
  });

  test("with nobody assigned, time passes and nothing else changes", () => {
    const state = newGame(7);
    run(state, 6000);
    expect(state).toEqual({ seed: 7, ticks: 30, items: {}, xp: {}, jobs: {} });
  });
});

describe("commands", () => {
  test("unassigning stops the job and keeps what was made", () => {
    const state = mining();
    run(state, 4000);
    apply(state, { kind: "unassign", crew: "ana-petrov" });
    run(state, 6000);
    expect(state).toEqual({
      seed: 7,
      ticks: 50,
      items: { "iron-ore": 1 },
      xp: { mining: 5 },
      jobs: {},
    });
  });

  test("assigning the job a crew member already has keeps its progress", () => {
    const state = mining();
    run(state, 2000);
    apply(state, { kind: "assign", crew: "ana-petrov", action: "iron-asteroid" });
    run(state, 1000);
    expect(state.items).toEqual({ "iron-ore": 1 });
  });
});

describe("events", () => {
  test("a tick reports the bar that finished in it, and nothing otherwise", () => {
    const state = mining();
    run(state, 2800);
    expect([tick(state), tick(state)]).toEqual([
      [{ kind: "action-done", crew: "ana-petrov", action: "iron-asteroid" }],
      [],
    ]);
  });

  test("the bar that brings mining to 60 XP also reports level 2", () => {
    const state = mining();
    run(state, 35_800);
    expect(tick(state)).toEqual([
      { kind: "action-done", crew: "ana-petrov", action: "iron-asteroid" },
      { kind: "level-up", department: "mining", level: 2 },
    ]);
  });

  test("a command reports the job it started or stopped, and nothing when it changed nothing", () => {
    const state = newGame(7);
    const assign = { kind: "assign", crew: "ana-petrov", action: "iron-asteroid" } as const;
    const unassign = { kind: "unassign", crew: "ana-petrov" } as const;
    expect([
      apply(state, unassign),
      apply(state, assign),
      apply(state, assign),
      apply(state, unassign),
    ]).toEqual([
      [],
      [{ kind: "job-started", crew: "ana-petrov", action: "iron-asteroid" }],
      [],
      [{ kind: "job-stopped", crew: "ana-petrov" }],
    ]);
  });
});

describe("levels", () => {
  test("the next level costs round(60 × 1.1^(level − 1))", () => {
    expect([1, 2, 15, 98].map(xpForNext)).toEqual([60, 66, 228, 621_215]);
  });

  test("a level starts at the summed cost of the ones before it", () => {
    expect([0, 59, 60, 125, 126, 1678, 1679].map(levelOf)).toEqual([1, 1, 2, 2, 3, 14, 15]);
  });

  test("level 99 takes 6,832,764 XP and is the cap", () => {
    expect([
      levelOf(6_832_763),
      levelOf(6_832_764),
      levelOf(50_000_000),
      xpToReachNext(98),
      xpToReachNext(99),
    ]).toEqual([98, 99, 99, 6_832_764, null]);
  });
});
