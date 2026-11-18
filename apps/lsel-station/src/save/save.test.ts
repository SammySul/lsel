import { describe, expect, test } from "bun:test";
import { apply } from "../sim/commands.ts";
import { newGame } from "../sim/state.ts";
import { eventful, summarize } from "../sim/summary.ts";
import { tick } from "../sim/tick.ts";
import { exportString, importString, parseDocument, playedMs, toDocument } from "./document.ts";

/** A game a few minutes in: mining, with some ore. */
function played() {
  const state = newGame(7);
  apply(state, { kind: "assign", crew: "ana-petrov", action: "iron-asteroid" });
  for (let i = 0; i < 1000; i++) tick(state);
  return state;
}

describe("a save", () => {
  test("goes through text and comes back as the same game", () => {
    const state = played();
    const text = exportString(toDocument(state, 1_800_000_000_000));
    expect([text.startsWith("lsel-station:"), importString(text)]).toEqual([
      true,
      { ok: true, doc: { game: "lsel-station", version: 1, savedAt: 1_800_000_000_000, state } },
    ]);
  });

  test("goes through JSON and comes back as the same game", () => {
    const state = played();
    state.revealed.push(2 as never);
    state.owned.push(2 as never);
    state.outposts[2] = { spec: "mine", modules: ["depot"], stored: 0.25 };
    state.beds = [{ crop: "algae", progressMs: 1000 }, null];
    const doc = toDocument(state, 5);
    expect(parseDocument(JSON.parse(JSON.stringify(doc)))).toEqual({ ok: true, doc });
  });

  test("a game that continues from its save is the game that never stopped", () => {
    const live = played();
    const saved = importString(exportString(toDocument(structuredClone(live), 0)));
    if (!saved.ok) throw new Error(saved.reason);
    for (let i = 0; i < 5000; i++) {
      tick(live);
      tick(saved.doc.state);
    }
    expect(saved.doc.state).toEqual(live);
  });

  test("knows its play time from its ticks", () => {
    expect(playedMs(toDocument(played(), 0))).toBe(200_000);
  });

  test("anything else is refused, with the reason", () => {
    const state = played();
    const doc = toDocument(state, 0);
    const broken = (change: (d: Record<string, unknown>) => void) => {
      const copy = JSON.parse(JSON.stringify(doc));
      change(copy);
      return parseDocument(copy);
    };
    expect([
      importString("hello"),
      importString("lsel-station:%%%"),
      broken((d) => {
        d.version = 2;
      }),
      broken((d) => {
        delete d.savedAt;
      }),
      broken((d) => {
        (d.state as { items: Record<string, number> }).items.gold = 5;
      }),
      broken((d) => {
        (d.state as { items: Record<string, number> }).items["iron-ore"] = -1;
      }),
      broken((d) => {
        (d.state as { jobs: Record<string, unknown> }).jobs["tomas-greer"] = {
          action: "iron-asteroid",
          progressMs: 0,
          phase: "new",
        };
      }),
      broken((d) => {
        (d.state as { owned: number[] }).owned.push(9);
      }),
      broken((d) => {
        (d.state as { owned: number[] }).owned.push(99);
      }),
    ]).toEqual([
      { ok: false, reason: "not a Lsel save" },
      { ok: false, reason: "the text is damaged" },
      { ok: false, reason: "version: Invalid type: Expected 1 but received 2" },
      { ok: false, reason: "savedAt is missing" },
      {
        ok: false,
        reason:
          'state.items.gold: Invalid type: Expected ("credits" | "iron-ore" | "ice" | "hydrogen" | "algae" | "iron-plate" | "water" | "fuel-cell" | "basic-parts" | "ration" | "data" | "claim-beacon" | "depot-kit" | "relay-kit" | "copper-wire" | "glass") but received "gold"',
      },
      { ok: false, reason: "state.items.iron-ore: Invalid value: Expected >=0 but received -1" },
      { ok: false, reason: "state: a job belongs to someone not on the roster" },
      { ok: false, reason: "state: a sector is owned but not on the map" },
      { ok: false, reason: "state.owned.1: Invalid value: Expected <=35 but received 99" },
    ]);
  });
});

describe("the away summary", () => {
  test("lists what changed: items, levels, modules, crew and sectors", () => {
    const before = newGame(7);
    before.items = { "iron-plate": 20, water: 10 };
    before.xp.construction = 0;
    const after = structuredClone(before);
    apply(after, { kind: "assign", crew: "ana-petrov", action: "habitat-1" });
    for (let i = 0; i < 3000; i++) tick(after);
    after.revealed.push(1 as never);
    expect(summarize(before, after, 600_000)).toEqual({
      awayMs: 600_000,
      items: [
        { item: "iron-plate", change: -20 },
        { item: "water", change: -10 },
      ],
      levels: [{ department: "construction", from: 1, to: 5 }],
      modules: [{ module: "habitat", level: 1 }],
      unlocks: [],
      crew: ["ines-duarte"],
      charted: [1 as never],
      claimed: [],
    });
  });

  test("of a quiet time away has nothing to show", () => {
    const state = newGame(7);
    const later = structuredClone(state);
    for (let i = 0; i < 100; i++) tick(later);
    expect([
      eventful(summarize(state, later, 20_000)),
      eventful(summarize(state, played(), 0)),
    ]).toEqual([false, true]);
  });
});
