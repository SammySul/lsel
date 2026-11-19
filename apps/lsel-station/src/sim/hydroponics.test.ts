import { describe, expect, test } from "bun:test";
import { apply } from "./commands.ts";
import { run, station } from "./fixture.ts";
import { bedCount, growthSpeed } from "./rules.ts";

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
    const state = station({ hold: 5 }, { items: { ration: 2 } }, "iron-asteroid");
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
