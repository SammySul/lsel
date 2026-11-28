// What follows a player between devices (bests, dailies solved, the board name) and /api/me, on lsel's accounts.

import type { Database } from "bun:sqlite";
import { json, type Routes, rateLimiter, respond } from "@sammysul/lsel/server";
import { type Auth, type Names, type Player, playerOf } from "@sammysul/lsel/server/accounts";
import type { Board } from "@sammysul/lsel/server/board";
import {
  type Account,
  type AccountSync,
  type Best,
  type Me,
  parseAccountSync,
} from "@yank-wars/engine";

const LIMITS = {
  /** a sync's JSON: a few thousand bests at ~40 bytes each, with room to spare */
  bodyBytes: 512_000,
  /** syncs per minute from one address */
  perAddress: 30,
} as const;

// fewer keys wins, then the faster time: the same order as a match and the board
const BETTER = "(excluded.keys < keys OR (excluded.keys = keys AND excluded.ms < ms))";

/** Bests and dailies per account, beside Better Auth's tables and the names in the same database. */
export class Progress {
  readonly #db: Database;
  readonly #names: Names;

  constructor(db: Database, names: Names) {
    this.#db = db;
    this.#names = names;
    db.run(`CREATE TABLE IF NOT EXISTS best (
      user TEXT NOT NULL, puzzle TEXT NOT NULL, keys INTEGER NOT NULL, ms REAL NOT NULL,
      PRIMARY KEY (user, puzzle))`);
    db.run(`CREATE TABLE IF NOT EXISTS solved (
      user TEXT NOT NULL, day INTEGER NOT NULL, PRIMARY KEY (user, day))`);
  }

  account(user: string, login: string | null): Account {
    const best: Record<string, Best> = {};
    for (const r of this.#db
      .query<{ puzzle: string } & Best, [string]>(
        "SELECT puzzle, keys, ms FROM best WHERE user = ? ORDER BY puzzle",
      )
      .all(user)) {
      best[r.puzzle] = { keys: r.keys, ms: r.ms };
    }
    const daily = this.#db
      .query<{ day: number }, [string]>("SELECT day FROM solved WHERE user = ? ORDER BY day")
      .all(user)
      .map((r) => r.day);
    return { name: this.#names.of(user, login), login, best, daily };
  }

  /** Keeps the better best per puzzle and every day of both sides; a name, when sent, replaces it. */
  merge(user: string, sync: AccountSync): void {
    this.#db.transaction(() => {
      if (sync.name !== undefined) this.#names.rename(user, sync.name);
      const best = this.#db.query(
        `INSERT INTO best (user, puzzle, keys, ms) VALUES (?, ?, ?, ?)
         ON CONFLICT (user, puzzle) DO UPDATE SET
           keys = CASE WHEN ${BETTER} THEN excluded.keys ELSE keys END,
           ms = CASE WHEN ${BETTER} THEN excluded.ms ELSE ms END`,
      );
      for (const [puzzle, b] of Object.entries(sync.best ?? {}))
        best.run(user, puzzle, b.keys, b.ms);
      const day = this.#db.query("INSERT OR IGNORE INTO solved (user, day) VALUES (?, ?)");
      for (const d of sync.daily ?? []) day.run(user, d);
    })();
  }

  /** A guest's progress joins the account it signed in to; the account keeps its name, if it has one. */
  move(from: string, to: string): void {
    const { best, daily } = this.account(from, null);
    this.#db.transaction(() => {
      this.#names.move(from, to);
      this.merge(to, { best, daily: [...daily] });
      for (const table of ["best", "solved"]) {
        this.#db.query(`DELETE FROM ${table} WHERE user = ?`).run(from);
      }
    })();
  }
}

/** `/api/auth/*` (Better Auth) and `/api/me`: GET the account, PUT one device's side of a sync. */
export function accountRoutes(deps: {
  auth: Auth;
  names: Names;
  progress: Progress;
  board: Board;
  /** whether a GitHub OAuth app is set, so the page offers sign-in */
  github: boolean;
  now?: (() => number) | undefined;
}): Routes {
  const now = deps.now ?? Date.now;
  const allowed = rateLimiter(LIMITS.perAddress);
  return async (req, url) => {
    if (url.pathname.startsWith("/api/auth/")) return deps.auth.handler(req);
    if (url.pathname !== "/api/me") return undefined;
    const player = await playerOf(deps.auth, deps.names, req);
    const mine = (p: Player) => deps.progress.account(p.id, p.login);
    if (req.method === "GET") {
      return json({ account: player && mine(player), github: deps.github } satisfies Me);
    }
    if (req.method !== "PUT") return respond("method not allowed", 405, { Allow: "GET, PUT" });
    if (player === null) return json({ error: "not signed in" }, 401);
    if (!allowed(req.headers.get("cf-connecting-ip") ?? "direct", now())) {
      return json({ error: "too many requests" }, 429);
    }
    const body = await req.text();
    if (body.length > LIMITS.bodyBytes) return json({ error: "too much to sync" }, 413);
    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch {
      return json({ error: "not JSON" }, 400);
    }
    const sync = parseAccountSync(raw);
    if (sync === null) return json({ error: "not a sync" }, 400);
    deps.progress.merge(player.id, sync);
    if (sync.name !== undefined) deps.board.rename(player.id, sync.name || "anonymous");
    return json(mine(player) satisfies Account);
  };
}
