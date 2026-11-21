import { describe, expect, test } from "bun:test";
import { exportString, importString, toDocument } from "../save/document.ts";
import { apply } from "./commands.ts";
import { ana, ines, run } from "./fixture.ts";
import { type GameState, newGame } from "./state.ts";
import { tick } from "./tick.ts";

const HOUR = 18_000;

/** Two crew, a loot table and a mid-game change of job: a game where every roll counts. */
function busy(seed: number): GameState {
  const state = newGame(seed);
  state.crew.push("ines-duarte");
  state.modules.habitat = 1;
  state.unlocks.push("salvage-tug");
  apply(state, ana("cargo-wreck"));
  apply(state, ines("iron-asteroid"));
  return state;
}

function played(seed: number): GameState {
  const state = busy(seed);
  run(state, HOUR / 2);
  apply(state, ines("iron-plate"));
  run(state, HOUR / 2);
  return state;
}

describe("the simulation", () => {
  test("gives the same game for the same seed and commands, and another for another seed", () => {
    const [first, again, other] = [played(7), played(7), played(8)];
    expect(first).toEqual(again);
    expect(other.items).not.toEqual(first.items);
  });

  test("catching up in chunks, saved and loaded between them, ends where an hour ticked live does", () => {
    const live = busy(7);
    run(live, HOUR);
    let caught = busy(7);
    for (let done = 0; done < HOUR; done += 2000) {
      for (let i = 0; i < 2000; i++) tick(caught);
      const loaded = importString(exportString(toDocument(caught, done)));
      if (!loaded.ok) throw new Error(loaded.reason);
      caught = loaded.doc.state;
    }
    expect(caught).toEqual(live);
    // and the hour did happen: wrecks were stripped and ore mined
    expect([live.ticks, Object.keys(live.items).length >= 3]).toEqual([HOUR, true]);
  });
});
