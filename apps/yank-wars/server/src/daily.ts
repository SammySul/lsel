// The daily board: verified runs in SQLite, served on /api/daily.

import { Database } from "bun:sqlite";
import { json, type Routes, rateLimiter, respond } from "@sammysul/lsel/server";
import {
  type BoardEntry,
  DAILY,
  type DailyBoard,
  dailyPuzzle,
  dayOf,
  isPlayerId,
  type KeyLog,
  type Puzzle,
  parseDailyClaim,
} from "@yank-wars/engine";
import type { Verdict } from "./replay.ts";

const LIMITS = {
  /** a claim's JSON: 5,000 log entries of a few characters each, with room to spare */
  bodyBytes: 64_000,
  /** claims per minute from one address */
  perAddress: 30,
} as const;

interface Row {
  player: string;
  name: string;
  keys: number;
  ms: number;
}

export interface Run extends Row {
  day: number;
  puzzle: string;
  at: number;
}

/** Each player's best run per day: fewer keys, then the faster time, then whoever got there first. */
export class Board {
  readonly #db: Database;

  constructor(path: string) {
    this.#db = new Database(path, { create: true, strict: true });
    this.#db.run("PRAGMA journal_mode = WAL");
    this.#db.run(`CREATE TABLE IF NOT EXISTS runs (
      day INTEGER NOT NULL,
      player TEXT NOT NULL,
      puzzle TEXT NOT NULL,
      name TEXT NOT NULL,
      keys INTEGER NOT NULL,
      ms INTEGER NOT NULL,
      at INTEGER NOT NULL,
      PRIMARY KEY (day, player)
    )`);
  }

  /** Keeps `run` if it beats the player's run of the day (or that was another puzzle); the name always updates. */
  record(run: Run): void {
    this.#db
      .query(
        `INSERT INTO runs (day, player, puzzle, name, keys, ms, at)
         VALUES ($day, $player, $puzzle, $name, $keys, $ms, $at)
         ON CONFLICT (day, player) DO UPDATE SET
           name = excluded.name,
           puzzle = CASE WHEN ${BETTER} THEN excluded.puzzle ELSE puzzle END,
           keys = CASE WHEN ${BETTER} THEN excluded.keys ELSE keys END,
           ms = CASE WHEN ${BETTER} THEN excluded.ms ELSE ms END,
           at = CASE WHEN ${BETTER} THEN excluded.at ELSE at END`,
      )
      .run({ ...run });
  }

  board(day: number, puzzle: string, player: string | null): DailyBoard {
    const entry = (r: Row, rank: number): BoardEntry => ({
      rank,
      name: r.name,
      keys: r.keys,
      ms: r.ms,
      you: r.player === player,
    });
    const top = this.#db
      .query<Row, [number, string, number]>(
        `SELECT player, name, keys, ms FROM runs WHERE day = ? AND puzzle = ?
         ORDER BY keys, ms, at LIMIT ?`,
      )
      .all(day, puzzle, DAILY.boardSize)
      .map((r, i) => entry(r, i + 1));
    const players =
      this.#db
        .query<{ n: number }, [number, string]>(
          "SELECT count(*) AS n FROM runs WHERE day = ? AND puzzle = ?",
        )
        .get(day, puzzle)?.n ?? 0;
    let you: BoardEntry | null = null;
    if (player !== null && !top.some((e) => e.you)) {
      const mine = this.#db
        .query<Row & { at: number; ahead: number }, [number, string, string]>(
          `SELECT me.player, me.name, me.keys, me.ms, me.at,
             (SELECT count(*) FROM runs r WHERE r.day = me.day AND r.puzzle = me.puzzle AND
               (r.keys < me.keys OR (r.keys = me.keys AND (r.ms < me.ms OR (r.ms = me.ms AND r.at < me.at))))
             ) AS ahead
           FROM runs me WHERE me.day = ? AND me.puzzle = ? AND me.player = ?`,
        )
        .get(day, puzzle, player);
      if (mine !== null) you = entry(mine, mine.ahead + 1);
    }
    return { day, puzzle, players, top, you };
  }

  close(): void {
    this.#db.close();
  }
}

// the new run beats the stored one, or the stored one was on a puzzle the day no longer has
const BETTER = `(excluded.puzzle <> puzzle OR excluded.keys < keys OR
  (excluded.keys = keys AND excluded.ms < ms))`;

export interface DailyDeps {
  board: Board;
  puzzles: ReadonlyMap<string, Puzzle>;
  verify: (puzzle: Puzzle, log: KeyLog) => Promise<Verdict>;
  now?: () => number;
}

/** `/api/daily`: GET today's board (`?player=` adds the asker's rank), POST a locked-in run. */
export function dailyRoutes(deps: DailyDeps): Routes {
  const now = deps.now ?? Date.now;
  const allowed = rateLimiter(LIMITS.perAddress);
  return async (req, url) => {
    if (url.pathname !== "/api/daily") return undefined;
    const day = dayOf(now());
    const puzzle = dailyPuzzle(deps.puzzles.values(), day);
    if (req.method === "GET") {
      const player = url.searchParams.get("player");
      return json(deps.board.board(day, puzzle.id, isPlayerId(player) ? player : null));
    }
    if (req.method !== "POST") return respond("method not allowed", 405, { Allow: "GET, POST" });
    // cloudflared passes the visitor's address; without it, everyone shares one budget
    if (!allowed(req.headers.get("cf-connecting-ip") ?? "direct", now())) {
      return json({ error: "too many requests" }, 429);
    }
    const body = await req.text();
    if (body.length > LIMITS.bodyBytes) return json({ error: "run too long" }, 413);
    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch {
      return json({ error: "not JSON" }, 400);
    }
    const claim = parseDailyClaim(raw);
    if (claim === null) return json({ error: "not a daily run" }, 400);
    if (claim.day !== day) return json({ error: "that daily is over" }, 409);
    const verdict = await deps.verify(puzzle, claim.log);
    if (!verdict.ok) {
      return json(
        { error: verdict.reason === "too slow" ? "replay too slow" : "the run doesn't match" },
        422,
      );
    }
    deps.board.record({
      day,
      puzzle: puzzle.id,
      player: claim.player,
      name: claim.name === "" ? "anonymous" : claim.name,
      keys: verdict.score,
      ms: claim.ms,
      at: now(),
    });
    return json(deps.board.board(day, puzzle.id, claim.player));
  };
}
