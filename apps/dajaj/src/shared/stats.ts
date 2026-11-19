/** The stats PUBG reports per player per match, in table order. */
export const STATS = [
  "kills",
  "knockouts",
  "damage",
  "assists",
  "headshotKills",
  "longestKill",
  "revives",
  "boosts",
  "heals",
  "weaponsAcquired",
  "teamKills",
  "rideDistance",
  "roadKills",
  "swimDistance",
  "timeSurvived",
  "vehicleDestroys",
  "walkDistance",
] as const;

export type Stat = (typeof STATS)[number];
export type Stats = Record<Stat, number>;

/** One player's stats in one match, as PUBG names them (DBNOs are knockouts, damageDealt is damage). */
export interface ParticipantStats {
  playerId: string;
  DBNOs: number;
  assists: number;
  boosts: number;
  damageDealt: number;
  headshotKills: number;
  heals: number;
  kills: number;
  longestKill: number;
  revives: number;
  rideDistance: number;
  roadKills: number;
  swimDistance: number;
  teamKills: number;
  timeSurvived: number;
  vehicleDestroys: number;
  walkDistance: number;
  weaponsAcquired: number;
}

/** What dajaj keeps of a match: when it started and every participant's stats. */
export interface Match {
  id: string;
  createdAt: string;
  participants: ParticipantStats[];
}

export interface Player {
  id: string;
  name: string;
}

/** Everything the page shows, for the selected players and the matches they all played. */
export interface Report {
  players: string[];
  matchCount: number;
  /** Recent matches PUBG didn't hand over, so the numbers may be short. */
  missing: number;
  earliest: string | null;
  totals: Record<string, Stats>;
  perMatch: { createdAt: string; stats: Record<string, Stats> }[];
}

export function statsOf(p: ParticipantStats): Stats {
  return {
    kills: p.kills,
    knockouts: p.DBNOs,
    damage: p.damageDealt,
    assists: p.assists,
    headshotKills: p.headshotKills,
    longestKill: p.longestKill,
    revives: p.revives,
    boosts: p.boosts,
    heals: p.heals,
    weaponsAcquired: p.weaponsAcquired,
    teamKills: p.teamKills,
    rideDistance: p.rideDistance,
    roadKills: p.roadKills,
    swimDistance: p.swimDistance,
    timeSurvived: p.timeSurvived,
    vehicleDestroys: p.vehicleDestroys,
    walkDistance: p.walkDistance,
  };
}

/** Totals across matches; the longest kill is the longest of any match. */
export function total(all: readonly Stats[]): Stats {
  const sum = Object.fromEntries(STATS.map((s) => [s, 0])) as Stats;
  for (const stats of all) {
    for (const s of STATS)
      sum[s] = s === "longestKill" ? Math.max(sum[s], stats[s]) : sum[s] + stats[s];
  }
  return sum;
}

/** The matches every player in `players` took part in, oldest first, each once. */
export function sharedMatches(matches: readonly Match[], players: readonly Player[]): Match[] {
  const byId = new Map<string, Match>();
  for (const m of matches) {
    const ids = new Set(m.participants.map((p) => p.playerId));
    if (players.every((p) => ids.has(p.id))) byId.set(m.id, m);
  }
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function report(
  players: readonly Player[],
  matches: readonly Match[],
  missing: number,
): Report {
  const shared = sharedMatches(matches, players);
  const statsIn = (m: Match, player: Player): Stats => {
    const p = m.participants.find((x) => x.playerId === player.id);
    if (p === undefined) throw new Error(`${player.name} is not in match ${m.id}`);
    return statsOf(p);
  };
  return {
    players: players.map((p) => p.name),
    matchCount: shared.length,
    missing,
    earliest: shared[0]?.createdAt ?? null,
    totals: Object.fromEntries(
      players.map((p) => [p.name, total(shared.map((m) => statsIn(m, p)))]),
    ),
    perMatch: shared.map((m) => ({
      createdAt: m.createdAt,
      stats: Object.fromEntries(players.map((p) => [p.name, statsIn(m, p)])),
    })),
  };
}
