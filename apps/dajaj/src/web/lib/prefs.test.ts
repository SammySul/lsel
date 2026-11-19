import { expect, test } from "bun:test";
import * as v from "valibot";
import { choosePlayers, Prefs } from "./prefs.ts";

const players = ["AntennaTower", "Rectifier94", "Reason_ING"];

test("stored players come back in the configured order", () => {
  expect(choosePlayers(["Reason_ING", "AntennaTower"], players)).toEqual([
    "AntennaTower",
    "Reason_ING",
  ]);
});

test("players who left the list are dropped; with none left, everyone is chosen", () => {
  expect(choosePlayers(["Gone", "Rectifier94"], players)).toEqual(["Rectifier94"]);
  expect(choosePlayers(["Gone"], players)).toEqual(players);
  expect(choosePlayers([], players)).toEqual(players);
});

test("unreadable or stale values fall back field by field", () => {
  expect(v.parse(Prefs, { players: "x", view: "doughnut", stat: "dbnos" })).toEqual({
    players: [],
    view: "table",
    stat: "kills",
  });
  expect(v.parse(Prefs, { players: ["Gone"], view: "line", stat: "damage" })).toEqual({
    players: ["Gone"],
    view: "line",
    stat: "damage",
  });
});
