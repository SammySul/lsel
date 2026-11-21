import { describe, expect, test } from "bun:test";
import { apply } from "./commands.ts";
import { ana, FRESH, game, run } from "./fixture.ts";
import { actionLock, actionShown, crewSlots } from "./rules.ts";

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
