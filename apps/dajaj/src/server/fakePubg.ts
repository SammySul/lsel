// A stand-in for PUBG's API in its JSON:API shape, for tests: served directly or as an injected fetch.

export interface FakeMatch {
  id: string;
  createdAt: string;
  /** player id -> kills; every other stat is derived from it so tests can predict totals */
  kills: Record<string, number>;
}

export interface FakeWorld {
  players: Record<string, string>; // name -> account id
  recent: Record<string, string[]>; // account id -> match ids
  matches: FakeMatch[];
}

export function fakeStats(playerId: string, kills: number) {
  return {
    DBNOs: kills + 1,
    assists: 1,
    boosts: 2,
    damageDealt: 100 * kills + 0.5,
    deathType: "byplayer",
    headshotKills: Math.floor(kills / 2),
    heals: 3,
    killPlace: 10,
    killStreaks: 1,
    kills,
    longestKill: 50 * kills,
    name: playerId,
    playerId,
    revives: 1,
    rideDistance: 2500,
    roadKills: 0,
    swimDistance: 0,
    teamKills: 0,
    timeSurvived: 1500,
    vehicleDestroys: 0,
    walkDistance: 1200,
    weaponsAcquired: 5,
    winPlace: 3,
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/vnd.api+json" },
  });

/** Answers PUBG's paths under any base URL; `calls` lists every path it was asked for, `fail` forces a status. */
export function fakePubg(world: FakeWorld) {
  const state = {
    calls: [] as string[],
    fail: undefined as number | undefined,
    apiKey: "test-key",
  };
  const handle = (url: string, headers: Headers): Response => {
    const u = new URL(url);
    const path = u.pathname.replace(/^.*\/shards\/steam/, "");
    state.calls.push(path + u.search);
    if (state.fail !== undefined) return json({ errors: [{ title: "forced" }] }, state.fail);
    const authed = headers.get("Authorization") === `Bearer ${state.apiKey}`;
    if (path === "/players") {
      if (!authed) return json({ errors: [{ title: "Unauthorized" }] }, 401);
      const names = (u.searchParams.get("filter[playerNames]") ?? "").split(",");
      const found = names.filter((n) => world.players[n] !== undefined);
      if (found.length === 0) return json({ errors: [{ title: "Not Found" }] }, 404);
      return json({
        data: found.map((name) => ({
          type: "player",
          id: world.players[name],
          attributes: { name, shardId: "steam", patchVersion: "", titleId: "pubg" },
          relationships: { assets: { data: [] }, matches: { data: [] } },
        })),
        links: { self: url },
        meta: {},
      });
    }
    const season = /^\/players\/([^/]+)\/seasons\/lifetime$/.exec(path);
    if (season) {
      if (!authed) return json({ errors: [{ title: "Unauthorized" }] }, 401);
      const ids = world.recent[decodeURIComponent(season[1] as string)] ?? [];
      return json({
        data: {
          type: "playerSeason",
          attributes: { gameModeStats: {} },
          relationships: {
            matchesSolo: { data: [] },
            matchesSquadFPP: { data: ids.map((id) => ({ type: "match", id })) },
            season: { data: { type: "season", id: "lifetime" } },
          },
        },
      });
    }
    const match = /^\/matches\/([^/]+)$/.exec(path);
    if (match) {
      const m = world.matches.find((x) => x.id === decodeURIComponent(match[1] as string));
      if (m === undefined) return json({ errors: [{ title: "Not Found" }] }, 404);
      return json({
        data: {
          type: "match",
          id: m.id,
          attributes: {
            createdAt: m.createdAt,
            gameMode: "squad-fpp",
            mapName: "Baltic_Main",
            duration: 1800,
          },
          relationships: { rosters: { data: [] }, assets: { data: [{ type: "asset", id: "a1" }] } },
        },
        included: [
          { type: "roster", id: "r1", attributes: { stats: { rank: 1, teamId: 1 }, won: "true" } },
          ...Object.entries(m.kills).map(([playerId, kills]) => ({
            type: "participant",
            id: `p-${playerId}`,
            attributes: { actor: "", shardId: "steam", stats: fakeStats(playerId, kills) },
          })),
          {
            type: "asset",
            id: "a1",
            attributes: { URL: "https://example.invalid/telemetry.json" },
          },
        ],
      });
    }
    return json({ errors: [{ title: "Not Found" }] }, 404);
  };
  return {
    state,
    fetch: async (url: string, init: RequestInit) => handle(url, new Headers(init.headers)),
    serve: (req: Request) => handle(req.url, req.headers),
  };
}

export const WORLD: FakeWorld = {
  players: {
    AntennaTower: "account.antenna",
    Rectifier94: "account.rect",
    Reason_ING: "account.reason",
  },
  recent: {
    "account.antenna": ["m-1", "m-2", "m-3"],
    "account.rect": ["m-1", "m-2", "m-4"],
    "account.reason": ["m-2"],
  },
  matches: [
    {
      id: "m-1",
      createdAt: "2026-11-10T20:05:00Z",
      kills: { "account.antenna": 2, "account.rect": 4, "ai.1": 0 },
    },
    {
      id: "m-2",
      createdAt: "2026-11-12T21:40:00Z",
      kills: { "account.antenna": 5, "account.rect": 1, "account.reason": 3 },
    },
    { id: "m-3", createdAt: "2026-11-13T19:00:00Z", kills: { "account.antenna": 9 } },
    {
      id: "m-4",
      createdAt: "2026-11-14T18:30:00Z",
      kills: { "account.rect": 6, "account.antenna": 0 },
    },
  ],
};
