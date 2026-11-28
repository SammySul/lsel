// The daily board: verified runs on lsel's board, served on /api/daily.

import { Database } from "bun:sqlite";
import { json, type Routes, rateLimiter, respond } from "@sammysul/lsel/server";
import type { Player } from "@sammysul/lsel/server/accounts";
import { Board } from "@sammysul/lsel/server/board";
import { dailyPuzzle, dayOf, type KeyLog, type Puzzle, parseDailyClaim } from "@yank-wars/engine";
import type { Verdict } from "./replay.ts";

const LIMITS = {
  /** a claim's JSON: 5,000 log entries of a few characters each, with room to spare */
  bodyBytes: 64_000,
  /** claims per minute from one address */
  perAddress: 30,
} as const;

/** The board in `path`, fewest keys first; a board from before lsel's kept keys as `keys`, renamed once. */
export function openBoard(path: string): Board {
  const db = new Database(path, { create: true, strict: true });
  const columns = db.query<{ name: string }, []>("PRAGMA table_info(runs)").all();
  if (columns.some((c) => c.name === "keys"))
    db.run("ALTER TABLE runs RENAME COLUMN keys TO score");
  db.close();
  return new Board(path, { better: "lower" });
}

export interface DailyDeps {
  board: Board;
  /** the signed-in player behind a request, or null */
  player: (req: Request) => Promise<Player | null>;
  /** a verified run: the day counts toward the player's streak on every device */
  solved: (player: string, day: number) => void;
  puzzles: ReadonlyMap<string, Puzzle>;
  verify: (puzzle: Puzzle, log: KeyLog) => Promise<Verdict>;
  now?: (() => number) | undefined;
}

/** `/api/daily`: GET today's board (with the asker's rank, when signed in), POST a locked-in run. */
export function dailyRoutes(deps: DailyDeps): Routes {
  const now = deps.now ?? Date.now;
  const allowed = rateLimiter(LIMITS.perAddress);
  return async (req, url) => {
    if (url.pathname !== "/api/daily") return undefined;
    const day = dayOf(now());
    const puzzle = dailyPuzzle(deps.puzzles.values(), day);
    if (puzzle === undefined) return json({ error: "no daily today" }, 503);
    const player = await deps.player(req);
    if (req.method === "GET") return json(deps.board.board(day, puzzle.id, player?.id ?? null));
    if (req.method !== "POST") return respond("method not allowed", 405, { Allow: "GET, POST" });
    if (player === null) return json({ error: "not signed in" }, 401);
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
      player: player.id,
      name: player.name === "" ? "anonymous" : player.name,
      score: verdict.score,
      ms: claim.ms,
      at: now(),
    });
    deps.solved(player.id, day);
    return json(deps.board.board(day, puzzle.id, player.id));
  };
}
