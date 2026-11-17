import { expect, test } from "bun:test";
import { type PrefsStorage, readPrefs, writePrefs } from "./prefs.ts";

function memory(): PrefsStorage {
  const items = new Map<string, string>();
  return { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v) };
}

const players = ["AntennaTower", "Rectifier94", "Reason_ING"];

test("nothing stored means everyone, the table and kills", () => {
  expect(readPrefs(memory(), players)).toEqual({ players, view: "table", stat: "kills" });
});

test("choices survive a reload, in the configured order", () => {
  const s = memory();
  writePrefs(s, { players: ["Reason_ING", "AntennaTower"], view: "line", stat: "damage" });
  expect(readPrefs(s, players)).toEqual({
    players: ["AntennaTower", "Reason_ING"],
    view: "line",
    stat: "damage",
  });
});

test("players who left the list are dropped; with none left, everyone is chosen", () => {
  const s = memory();
  writePrefs(s, { players: ["Gone"], view: "bar", stat: "heals" });
  expect(readPrefs(s, players)).toEqual({ players, view: "bar", stat: "heals" });
});

test("unreadable or stale values fall back field by field", () => {
  const s = memory();
  s.setItem("dajaj:prefs:v1", JSON.stringify({ players: "x", view: "doughnut", stat: "dbnos" }));
  expect(readPrefs(s, players)).toEqual({ players, view: "table", stat: "kills" });
  s.setItem("dajaj:prefs:v1", "{not json");
  expect(readPrefs(s, players).view).toBe("table");
  expect(readPrefs(undefined, players).players).toEqual(players);
});
