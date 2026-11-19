import { expect, test } from "bun:test";
import { STATS } from "../../shared/stats.ts";
import { STAT_UNITS } from "./format.ts";

test("every stat has a label and a unit", () => {
  expect(STATS.filter((s) => STAT_UNITS[s] === undefined)).toEqual([]);
});

test("counts and damage read as whole US numbers", () => {
  expect([STAT_UNITS.kills.text(16), STAT_UNITS.damage.text(2456.37)]).toEqual(["16", "2,456"]);
});

test("distances are km with one decimal, the longest kill stays in m", () => {
  expect([
    STAT_UNITS.rideDistance.text(48512.3),
    STAT_UNITS.swimDistance.text(42),
    STAT_UNITS.longestKill.text(209.4),
  ]).toEqual(["48.5", "0.0", "209"]);
  expect([STAT_UNITS.rideDistance.label, STAT_UNITS.rideDistance.value(48512)]).toEqual([
    "Ride distance (km)",
    48.512,
  ]);
});

test("time survived is h:mm", () => {
  expect([
    STAT_UNITS.timeSurvived.text(24681),
    STAT_UNITS.timeSurvived.text(59),
    STAT_UNITS.timeSurvived.value(5400),
  ]).toEqual(["6:51", "0:00", 1.5]);
});
