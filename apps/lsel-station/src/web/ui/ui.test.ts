import { describe, expect, test } from "bun:test";
import { count, duration, percent, stacks } from "./format.ts";
import { noticeFor } from "./notices.ts";

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
    ]).toEqual(["12,480", "5%", "3.0 s", "10:00", "1:30:00", "20 iron plate, 1,000 water"]);
  });
});

describe("notices", () => {
  test("say what was reached, built or who joined", () => {
    expect([
      noticeFor({ kind: "level-up", department: "construction", level: 5 }),
      noticeFor({ kind: "mastery-step", action: "iron-asteroid", level: 10 }),
      noticeFor({ kind: "module-built", module: "habitat", level: 1 }),
      noticeFor({ kind: "crew-joined", crew: "ines-duarte" }),
    ]).toEqual([
      "Construction level 5",
      "Iron asteroid mastery 10",
      "Habitat I built",
      "Ines Duarte joined the crew",
    ]);
  });

  test("stay quiet for what happens every few seconds", () => {
    expect([
      noticeFor({ kind: "action-done", crew: "ana-petrov", action: "iron-asteroid" }),
      noticeFor({ kind: "job-started", crew: "ana-petrov", action: "iron-asteroid" }),
      noticeFor({ kind: "job-stopped", crew: "ana-petrov" }),
      noticeFor({ kind: "job-waiting", crew: "ana-petrov", action: "iron-plate" }),
    ]).toEqual([null, null, null, null]);
  });
});
