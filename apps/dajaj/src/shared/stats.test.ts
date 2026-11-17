import { expect, test } from "bun:test";
import {
  type Match,
  type ParticipantStats,
  report,
  sharedMatches,
  statsOf,
  total,
} from "./stats.ts";

function p(playerId: string, kills: number, longestKill = 0): ParticipantStats {
  return {
    playerId,
    DBNOs: kills + 1,
    assists: 1,
    boosts: 2,
    damageDealt: 100.5 * kills,
    headshotKills: 0,
    heals: 3,
    kills,
    longestKill,
    revives: 0,
    rideDistance: 1000,
    roadKills: 0,
    swimDistance: 0,
    teamKills: 0,
    timeSurvived: 600,
    vehicleDestroys: 0,
    walkDistance: 500,
    weaponsAcquired: 4,
  };
}

const ada = { id: "account.ada", name: "Ada" };
const bo = { id: "account.bo", name: "Bo" };

const m1: Match = {
  id: "m1",
  createdAt: "2026-11-02T20:00:00Z",
  participants: [p("account.ada", 2, 120), p("account.bo", 1, 40), p("account.x", 9)],
};
const m2: Match = {
  id: "m2",
  createdAt: "2026-11-01T20:00:00Z",
  participants: [p("account.ada", 3, 300), p("account.bo", 0, 0)],
};
const soloAda: Match = {
  id: "m3",
  createdAt: "2026-11-03T20:00:00Z",
  participants: [p("account.ada", 7, 900)],
};

test("shared matches are the ones every player was in, oldest first, each once", () => {
  expect(sharedMatches([m1, soloAda, m2, m1], [ada, bo]).map((m) => m.id)).toEqual(["m2", "m1"]);
});

test("a match only the second player listed still counts (the old app read only the first player's list)", () => {
  expect(sharedMatches([m2], [ada, bo]).map((m) => m.id)).toEqual(["m2"]);
});

test("totals add up, except the longest kill, which is the longest of any match", () => {
  const t = total([m1, m2].map((m) => statsOf(m.participants[0] as ParticipantStats)));
  expect([t.kills, t.knockouts, t.damage, t.longestKill, t.timeSurvived]).toEqual([
    5, 7, 502.5, 300, 1200,
  ]);
});

test("the report covers only shared matches, with totals and each match per player", () => {
  const r = report([ada, bo], [m1, m2, soloAda]);
  expect([r.players, r.matchCount, r.earliest]).toEqual([["Ada", "Bo"], 2, "2026-11-01T20:00:00Z"]);
  expect([r.totals.Ada?.kills, r.totals.Ada?.longestKill, r.totals.Bo?.kills]).toEqual([5, 300, 1]);
  expect(r.perMatch.map((m) => [m.createdAt, m.stats.Ada?.kills, m.stats.Bo?.kills])).toEqual([
    ["2026-11-01T20:00:00Z", 3, 0],
    ["2026-11-02T20:00:00Z", 2, 1],
  ]);
});

test("no shared matches is an empty report, not an error", () => {
  const r = report([ada, bo], [soloAda]);
  expect([r.matchCount, r.earliest, r.totals.Bo?.kills, r.perMatch]).toEqual([0, null, 0, []]);
});
