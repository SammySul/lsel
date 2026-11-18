import { describe, expect, test } from "bun:test";
import { apply } from "../../sim/commands.ts";
import { newGame } from "../../sim/state.ts";
import { tick } from "../../sim/tick.ts";
import { ASTEROID_RELIEF, drawAsteroid, drawPlanet } from "./bodies.ts";
import { activityOf, describeScene } from "./frame.ts";
import type { Color, Put } from "./palette.ts";
import { sprite } from "./sprites.ts";

function paint(draw: (put: Put) => void): Map<string, Color> {
  const pixels = new Map<string, Color>();
  draw((x, y, color) => pixels.set(`${x},${y}`, color));
  return pixels;
}

const distances = (pixels: Map<string, Color>) =>
  [...pixels.keys()].map((key) => {
    const [x = 0, y = 0] = key.split(",").map(Number);
    return Math.hypot(x, y);
  });

describe("a planet", () => {
  const pixels = paint((put) => drawPlanet(put, { x: 0, y: 0, radius: 10, seed: 3 }));

  test("fills its disc and stops at the rim", () => {
    let missing = 0;
    for (let y = -10; y <= 10; y++) {
      for (let x = -10; x <= 10; x++) {
        if (Math.hypot(x, y) <= 10 && !pixels.has(`${x},${y}`)) missing++;
      }
    }
    expect([missing, distances(pixels).filter((d) => d >= 11.2)]).toEqual([0, []]);
  });

  test("is lit from the upper right", () => {
    expect([pixels.get("5,-6"), pixels.get("-7,7")]).toEqual(["planet3", "planet0"]);
  });
});

describe("an asteroid", () => {
  const pixels = paint((put) => drawAsteroid(put, { x: 0, y: 0, radius: 10, seed: 4 }));

  test("is solid rock at its center, with no outline", () => {
    expect([...new Set(pixels.values())].sort()).toEqual(["rock", "rockDark", "rockLight"]);
    expect(pixels.has("0,0")).toBe(true);
  });

  test("stays within its relief", () => {
    expect(ASTEROID_RELIEF).toBe(0.32);
    expect(distances(pixels).filter((d) => d >= 13.2)).toEqual([]);
  });
});

describe("a sprite grid", () => {
  test("reads pixels, and a vertical run of w as one window", () => {
    const s = sprite(["#w.", "#w#", ".b#"]);
    expect({ ...s, pixels: s.pixels.length }).toEqual({
      width: 3,
      height: 3,
      pixels: 7,
      windows: [{ x: 1, y: 0, height: 2 }],
      beacons: [{ x: 1, y: 2 }],
    });
  });

  test("refuses a ragged row and a color outside the legend", () => {
    expect(() => sprite(["##", "#"])).toThrow("sprite row 1 is 1 wide, not 2");
    expect(() => sprite(["#x"])).toThrow('sprite row 0 has an unknown color "x"');
  });
});

describe("what the scene shows", () => {
  test("an idle station shows no job", () => {
    const state = newGame(7);
    expect([activityOf(state, 0), describeScene(state)]).toEqual([
      { drones: [], tugs: [], skimmers: [], running: [], beds: [], building: [] },
      "The station in orbit above a planet.",
    ]);
  });

  test("a mining job is a drone as far along as its bar, between ticks too", () => {
    const state = newGame(7);
    apply(state, { kind: "assign", crew: "ana-petrov", action: "iron-asteroid" });
    expect(activityOf(state, 0).drones).toEqual([{ action: "iron-asteroid", progress: null }]);
    for (let i = 0; i < 5; i++) tick(state);
    // 5 ticks of Ana's 206 ms, then half a tick more, of a 3,000 ms bar
    expect([activityOf(state, 100).drones, describeScene(state)]).toEqual([
      [{ action: "iron-asteroid", progress: 1133 / 3000 }],
      "The station in orbit above a planet. A drone is mining the iron asteroid.",
    ]);
  });

  test("refining shows only while it has ore, and a project shows being built or half built", () => {
    const state = newGame(7);
    state.crew.push("ines-duarte");
    state.modules.habitat = 1;
    state.items = { "iron-plate": 30, water: 15 };
    state.xp.construction = 279;
    apply(state, { kind: "assign", crew: "ana-petrov", action: "iron-plate" });
    apply(state, { kind: "assign", crew: "ines-duarte", action: "reactor-1" });
    tick(state);
    expect([activityOf(state, 0), describeScene(state)]).toEqual([
      {
        drones: [],
        tugs: [],
        skimmers: [],
        running: [],
        beds: [],
        building: [{ module: "reactor", active: true }],
      },
      "The station in orbit above a planet. Reactor I is being built.",
    ]);
    state.items["iron-ore"] = 2;
    apply(state, { kind: "unassign", crew: "ines-duarte" });
    tick(state);
    expect([activityOf(state, 0), describeScene(state)]).toEqual([
      {
        drones: [],
        tugs: [],
        skimmers: [],
        running: ["refinery"],
        beds: [],
        building: [{ module: "reactor", active: false }],
      },
      "The station in orbit above a planet. The refinery is running. Reactor I is half built.",
    ]);
  });

  test("the new departments each show their own thing", () => {
    const state = newGame(7);
    state.crew.push("ines-duarte", "tomas-greer", "carla-voss");
    state.modules = {
      ...state.modules,
      habitat: 3,
      workshop: 1,
      greenhouse: 1,
      scanner: 1,
      lab: 1,
    };
    state.modules["skimmer-bay"] = 1;
    state.unlocks.push("salvage-tug");
    state.items = { data: 30 };
    state.beds = [{ crop: "algae", progressMs: 150_000 }, null];
    apply(state, { kind: "assign", crew: "ana-petrov", action: "cargo-wreck" });
    apply(state, { kind: "assign", crew: "ines-duarte", action: "skim-hydrogen" });
    apply(state, { kind: "assign", crew: "tomas-greer", action: "scan-home" });
    apply(state, { kind: "assign", crew: "carla-voss", action: "drone-tuning" });
    for (let i = 0; i < 10; i++) tick(state);
    const activity = activityOf(state, 0);
    expect([
      activity.tugs.map((p) => Math.round(p * 1000)),
      activity.skimmers.map((p) => Math.round(p * 1000)),
      activity.running,
      activity.beds.map((b) => (b === null ? null : Math.round(b * 1000))),
      describeScene(state),
    ]).toEqual([
      [412],
      [500],
      ["scanner", "lab"],
      [507, null],
      "The station in orbit above a planet. A tug is hauling wreck pieces in. A skimmer is out at the gas giant. The scanner is sweeping. The lab is at work. 1 bed is growing.",
    ]);
  });
});
