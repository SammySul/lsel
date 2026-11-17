import type { Database } from "bun:sqlite";
import * as v from "valibot";
import type { Match, ParticipantStats, Player } from "../shared/stats.ts";

export type PubgFailure = "rate-limited" | "not-found" | "unavailable" | "unexpected";

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
  data: v.looseObject({ id: v.string(), attributes: v.looseObject({ createdAt: v.string() }) }),
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
const PLAYER_TTL = 24 * 60 * MINUTE;
const RECENT_TTL = 20 * MINUTE;

export interface PubgOptions {
  apiKey: string;
  baseUrl: string;
  db: Database;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  now?: () => number;
}

/** PUBG's API with dajaj's caching: players per name for a day, recent matches for 20 minutes, matches forever. */
export class Pubg {
  readonly #opts: PubgOptions;
  readonly #fetch: NonNullable<PubgOptions["fetch"]>;
  readonly #now: () => number;
  readonly #players = new Map<string, { at: number; player: Player }>();
  readonly #recent = new Map<string, { at: number; ids: string[] }>();
  readonly #inflight = new Map<string, Promise<unknown>>();

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
          await this.#get(`/players?filter[playerNames]=${missing.join(",")}`, true),
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
        await this.#get(`/players/${playerId}/seasons/lifetime`, true),
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
        await this.#get(`/matches/${encodeURIComponent(id)}`, false),
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

  /** Every recent match of any of these players, fetched once each. */
  async recentMatches(players: readonly Player[]): Promise<Match[]> {
    const ids = new Set((await Promise.all(players.map((p) => this.recentMatchIds(p.id)))).flat());
    return Promise.all([...ids].map((id) => this.match(id)));
  }

  #once<T>(key: string, run: () => Promise<T>): Promise<T> {
    const running = this.#inflight.get(key);
    if (running !== undefined) return running as Promise<T>;
    const p = run().finally(() => this.#inflight.delete(key));
    this.#inflight.set(key, p);
    return p;
  }

  async #get(path: string, auth: boolean): Promise<unknown> {
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
    if (res.status === 404) throw new PubgError("not-found", `PUBG found nothing for ${path}`);
    if (res.status >= 500) throw new PubgError("unavailable", `PUBG answered ${res.status}`);
    if (!res.ok) throw new PubgError("unexpected", `PUBG answered ${res.status} for ${path}`);
    return res.json();
  }
}
