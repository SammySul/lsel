import { json, type Routes, respond } from "@sammysul/lsel/server";
import { report } from "../shared/stats.ts";
import { type Pubg, PubgError, type PubgFailure } from "./pubg.ts";

const STATUS: Record<PubgFailure, number> = {
  "rate-limited": 429,
  "not-found": 404,
  unavailable: 502,
  unexpected: 502,
};

export interface Deps {
  players: readonly string[];
  pubg: Pick<Pubg, "players" | "recentMatches">;
}

export function api(deps: Deps): Routes {
  return (req, url) => {
    const { pathname } = url;
    if (!pathname.startsWith("/api/")) return undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      return respond("method not allowed", 405, { Allow: "GET, HEAD" });
    }
    if (pathname === "/api/players") return json({ players: deps.players });
    if (pathname === "/api/report") return reportFor(deps, url.searchParams.get("players") ?? "");
    return json({ error: "no such endpoint" }, 404);
  };
}

async function reportFor(deps: Deps, param: string): Promise<Response> {
  const names = param.split(",").filter((n) => n !== "");
  if (names.length === 0) return json({ error: "choose at least one player" }, 400);
  const unknown = names.filter((n) => !deps.players.includes(n));
  if (unknown.length > 0) return json({ error: `not a dajaj player: ${unknown.join(", ")}` }, 400);
  if (new Set(names).size !== names.length) return json({ error: "a player is listed twice" }, 400);
  try {
    const players = await deps.pubg.players(names);
    const { matches, missing } = await deps.pubg.recentMatches(players);
    return json(report(players, matches, missing));
  } catch (e) {
    if (e instanceof PubgError) {
      console.error(`pubg ${e.kind}: ${e.message}`);
      return json({ error: e.message }, STATUS[e.kind]);
    }
    throw e;
  }
}
