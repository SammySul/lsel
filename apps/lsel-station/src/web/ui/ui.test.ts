import { describe, expect, test } from "bun:test";
import { mapOf, type SectorId } from "../../sim/map.ts";
import { count, duration, percent, stacks } from "./format.ts";
import { noticeFor as notice } from "./notices.ts";

const noticeFor = (event: Parameters<typeof notice>[0]) => notice(event, mapOf(7));

describe("formatting", () => {
  test("numbers, shares, bars and costs read as people write them", () => {
    expect([
      count(12480),
      percent(0.05),
      duration(3000),
      duration(600_000),
      duration(5_400_000),
      stacks([
        { item: "iron-plate", amount: 20 },
        { item: "water", amount: 1000 },
      ]),
      stacks([
        { item: "claim-beacon", amount: 1 },
        { item: "ration", amount: 5 },
      ]),
    ]).toEqual([
      "12,480",
      "5%",
      "3.0 s",
      "10:00",
      "1:30:00",
      "20 iron plate, 1,000 water",
      "1 claim beacon, 5 rations",
    ]);
  });
});

describe("notices", () => {
  test("say what was reached, built or who joined", () => {
    expect([
      noticeFor({ kind: "level-up", department: "construction", level: 5 }),
      noticeFor({ kind: "mastery-step", action: "iron-asteroid", level: 10 }),
      noticeFor({ kind: "module-built", module: "habitat", level: 1 }),
      noticeFor({ kind: "crew-joined", crew: "ines-duarte" }),
      noticeFor({ kind: "unlocked", unlock: "salvage-tug" }),
      noticeFor({ kind: "sector-revealed", sector: 1 as SectorId }),
      noticeFor({ kind: "sector-claimed", sector: 2 as SectorId }),
    ]).toEqual([
      "Construction level 5",
      "Iron asteroid mastery 10",
      "Habitat I built",
      "Ines Duarte joined the crew",
      "Salvage tug ready",
      "Ring 1 charted",
      "Ring 2 is yours",
    ]);
  });

  test("stay quiet for what happens every few seconds", () => {
    expect([
      noticeFor({ kind: "action-done", crew: "ana-petrov", action: "iron-asteroid" }),
      noticeFor({ kind: "job-started", crew: "ana-petrov", action: "iron-asteroid" }),
      noticeFor({ kind: "job-stopped", crew: "ana-petrov" }),
      noticeFor({ kind: "job-waiting", crew: "ana-petrov", action: "iron-plate" }),
      noticeFor({ kind: "planted", bed: 0, crop: "algae" }),
      noticeFor({ kind: "harvested", bed: 0, crop: "algae" }),
      noticeFor({ kind: "outpost-changed", sector: 2 as SectorId }),
    ]).toEqual([null, null, null, null, null, null, null]);
  });
});
