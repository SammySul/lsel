// The PUBG API client: players, their recent matches and each match's stats, cached in SQLite.

import type { Database } from "bun:sqlite";
import * as v from "valibot";
import type { Match, ParticipantStats, Player } from "../shared/stats.ts";

export type PubgFailure = "rate-limited" | "refused" | "not-found" | "unavailable" | "unexpected";

export class PubgError extends Error {
  constructor(
    readonly kind: PubgFailure,
    message: string,
  ) {
    super(message);
    this.name = "PubgError";
  }
}

const Players = v.looseObject({
  data: v.array(v.looseObject({ id: v.string(), attributes: v.looseObject({ name: v.string() }) })),
});

const MatchRefs = v.optional(v.looseObject({ data: v.array(v.looseObject({ id: v.string() })) }));
const Season = v.looseObject({
  data: v.looseObject({
    relationships: v.looseObject({
      matchesSolo: MatchRefs,
      matchesSoloFPP: MatchRefs,
      matchesDuo: MatchRefs,
      matchesDuoFPP: MatchRefs,
      matchesSquad: MatchRefs,
      matchesSquadFPP: MatchRefs,
    }),
  }),
});

const n = v.number();
const Participant = v.looseObject({
  type: v.literal("participant"),
  attributes: v.looseObject({
    stats: v.looseObject({
      playerId: v.string(),
      DBNOs: n,
      assists: n,
      boosts: n,
      damageDealt: n,
      headshotKills: n,
      heals: n,
      kills: n,
      longestKill: n,
      revives: n,
      rideDistance: n,
      roadKills: n,
      swimDistance: n,
      teamKills: n,
      timeSurvived: n,
      vehicleDestroys: n,
      walkDistance: n,
      weaponsAcquired: n,
    }),
  }),
});
const MatchResponse = v.looseObject({
  data: v.looseObject({
    id: v.string(),
    attributes: v.looseObject({ createdAt: v.pipe(v.string(), v.isoTimestamp()) }),
  }),
  included: v.array(v.looseObject({ type: v.string() })),
});

/** A response that no longer matches what dajaj reads is PUBG's change, reported with the first field that broke. */
function parse<S extends v.GenericSchema>(
  schema: S,
  value: unknown,
  what: string,
): v.InferOutput<S> {
  const r = v.safeParse(schema, value);
  if (r.success) return r.output;
  const issue = r.issues[0];
  throw new PubgError(
    "unexpected",
    `PUBG's ${what} has an unexpected shape at ${v.getDotPath(issue) ?? "the top"}: ${issue.message}`,
  );
}

const MODES = [
  "matchesSolo",
  "matchesSoloFPP",
  "matchesDuo",
  "matchesDuoFPP",
  "matchesSquad",
  "matchesSquadFPP",
] as const;

const MINUTE = 60_000;
const MATCH_FETCHES = 8;
const PLAYER_TTL = 24 * 60 * MINUTE;
const RECENT_TTL = 20 * MINUTE;

export interface PubgOptions {
  apiKey: string;
  baseUrl: string;
  db: Database;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  now?: () => number;
}

/** At most `max` of the functions it is handed run at once; the rest wait their turn. */
function limiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(run: () => Promise<T>): Promise<T> => {
    if (active < max) active++;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      return await run();
    } finally {
      const next = waiting.shift();
      if (next === undefined) active--;
      else next();
    }
  };
}

/** PUBG's API with dajaj's caching: players per name for a day, recent matches for 20 minutes, matches forever. */
export class Pubg {
  readonly #opts: PubgOptions;
  readonly #fetch: NonNullable<PubgOptions["fetch"]>;
  readonly #now: () => number;
  readonly #players = new Map<string, { at: number; player: Player }>();
  readonly #recent = new Map<string, { at: number; ids: string[] }>();
  readonly #inflight = new Map<string, Promise<unknown>>();
  readonly #matchSlot = limiter(MATCH_FETCHES);

  constructor(opts: PubgOptions) {
    this.#opts = opts;
    this.#fetch = opts.fetch ?? ((url, init) => fetch(url, init));
    this.#now = opts.now ?? Date.now;
    opts.db.run("CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, json TEXT NOT NULL)");
  }

  async players(names: readonly string[]): Promise<Player[]> {
    const fresh = (name: string) => {
      const hit = this.#players.get(name);
      return hit !== undefined && this.#now() - hit.at < PLAYER_TTL ? hit.player : undefined;
    };
    const missing = names.filter((name) => fresh(name) === undefined);
    if (missing.length > 0) {
      const key = `players:${[...missing].sort().join(",")}`;
      await this.#once(key, async () => {
        const body = parse(
          Players,
          await this.#get(
            `/players?filter[playerNames]=${missing.join(",")}`,
            true,
            missing.length === 1
              ? `PUBG has no player called ${missing[0]}`
              : `PUBG has none of these players: ${missing.join(", ")}`,
          ),
          "player lookup",
        );
        for (const p of body.data) {
          this.#players.set(p.attributes.name, {
            at: this.#now(),
            player: { id: p.id, name: p.attributes.name },
          });
        }
      });
    }
    return names.map((name) => {
      const p = fresh(name);
      if (p === undefined) throw new PubgError("not-found", `PUBG has no player called ${name}`);
      return p;
    });
  }

  async recentMatchIds(playerId: string): Promise<string[]> {
    const hit = this.#recent.get(playerId);
    if (hit !== undefined && this.#now() - hit.at < RECENT_TTL) return hit.ids;
    return this.#once(`recent:${playerId}`, async () => {
      const body = parse(
        Season,
        await this.#get(
          `/players/${playerId}/seasons/lifetime`,
          true,
          "PUBG has no stats for one of the players",
        ),
        "lifetime stats",
      );
      const ids = MODES.flatMap(
        (mode) => body.data.relationships[mode]?.data.map((m) => m.id) ?? [],
      );
      this.#recent.set(playerId, { at: this.#now(), ids });
      return ids;
    });
  }

  async match(id: string): Promise<Match> {
    const row = this.#opts.db
      .query<{ json: string }, [string]>("SELECT json FROM matches WHERE id = ?")
      .get(id);
    if (row !== null) return JSON.parse(row.json) as Match;
    return this.#once(`match:${id}`, async () => {
      const body = parse(
        MatchResponse,
        await this.#matchSlot(() =>
          this.#get(`/matches/${encodeURIComponent(id)}`, false, "PUBG no longer has a match"),
        ),
        "match",
      );
      const participants: ParticipantStats[] = body.included
        .filter((i) => i.type === "participant")
        .map((i) => parse(Participant, i, "match participant").attributes.stats);
      const match: Match = {
        id: body.data.id,
        createdAt: body.data.attributes.createdAt,
        participants,
      };
      this.#opts.db.run("INSERT OR REPLACE INTO matches (id, json) VALUES (?, ?)", [
        id,
        JSON.stringify(match),
      ]);
      return match;
    });
  }

  /** Every recent match of any of these players, fetched once each; `missing` counts the ones that failed. */
  async recentMatches(players: readonly Player[]): Promise<{ matches: Match[]; missing: number }> {
    const ids = new Set((await Promise.all(players.map((p) => this.recentMatchIds(p.id)))).flat());
    const settled = await Promise.allSettled([...ids].map((id) => this.match(id)));
    const matches = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    const failed = settled.flatMap((r) => (r.status === "rejected" ? [r.reason] : []));
    // nothing loaded is an outage to report, not an empty result
    if (matches.length === 0 && failed.length > 0) throw failed[0];
    return { matches, missing: failed.length };
  }

  #once<T>(key: string, run: () => Promise<T>): Promise<T> {
    const running = this.#inflight.get(key);
    if (running !== undefined) return running as Promise<T>;
    const p = run().finally(() => this.#inflight.delete(key));
    this.#inflight.set(key, p);
    return p;
  }

  /** `nothing` is what a 404 says: the request's path is no sentence for the screen. */
  async #get(path: string, auth: boolean, nothing: string): Promise<unknown> {
    const headers: Record<string, string> = { Accept: "application/vnd.api+json" };
    if (auth) headers.Authorization = `Bearer ${this.#opts.apiKey}`;
    let res: Response;
    try {
      res = await this.#fetch(`${this.#opts.baseUrl}${path}`, { headers });
    } catch (e) {
      throw new PubgError(
        "unavailable",
        `PUBG could not be reached: ${e instanceof Error ? e.message : e}`,
      );
    }
    if (res.status === 429)
      throw new PubgError("rate-limited", "PUBG's rate limit was hit; try again in a minute");
    if (res.status === 401 || res.status === 403)
      throw new PubgError("refused", "PUBG refused dajaj's API key");
    if (res.status === 404) throw new PubgError("not-found", nothing);
    if (res.status >= 500) throw new PubgError("unavailable", `PUBG answered ${res.status}`);
    if (!res.ok) throw new PubgError("unexpected", `PUBG answered ${res.status}`);
    return res.json();
  }
}
