// Calls the server's API.

import { getJson } from "@sammysul/lsel";
import type { Report } from "../../shared/stats.ts";

export const fetchPlayers = (signal: AbortSignal) =>
  getJson<{ players: string[] }>("/api/players", signal, "dajaj").then((b) => b.players);

export const fetchReport = (players: readonly string[], signal: AbortSignal) =>
  getJson<Report>(
    `/api/report?players=${players.map(encodeURIComponent).join(",")}`,
    signal,
    "dajaj",
  );
