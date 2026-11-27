// Accounts: guests and GitHub sign-in through Better Auth, and what follows a player between devices.

import type { Database } from "bun:sqlite";
import { json, type Routes, rateLimiter, respond } from "@sammysul/lsel/server";
import {
  type Account,
  type AccountSync,
  type Best,
  type Me,
  parseAccountSync,
} from "@yank-wars/engine";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { anonymous } from "better-auth/plugins";
import type { Board } from "./daily.ts";

const LIMITS = {
  /** a sync's JSON: a few thousand bests at ~40 bytes each, with room to spare */
  bodyBytes: 512_000,
  /** syncs per minute from one address */
  perAddress: 30,
} as const;

export interface GitHub {
  clientId: string;
  clientSecret: string;
}

/** Who sent a request: the account's id, its GitHub username (null for a guest) and its board name. */
export interface Player {
  readonly id: string;
  readonly login: string | null;
  readonly name: string;
}

// fewer keys wins, then the faster time: the same order as a match and the board
const BETTER = "(excluded.keys < keys OR (excluded.keys = keys AND excluded.ms < ms))";

/** Board names, bests and dailies per account, beside Better Auth's tables in the same database. */
export class Progress {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
    db.run("PRAGMA journal_mode = WAL");
    db.run("CREATE TABLE IF NOT EXISTS profile (user TEXT PRIMARY KEY, name TEXT NOT NULL)");
    db.run(`CREATE TABLE IF NOT EXISTS best (
      user TEXT NOT NULL, puzzle TEXT NOT NULL, keys INTEGER NOT NULL, ms REAL NOT NULL,
      PRIMARY KEY (user, puzzle))`);
    db.run(`CREATE TABLE IF NOT EXISTS solved (
      user TEXT NOT NULL, day INTEGER NOT NULL, PRIMARY KEY (user, day))`);
  }

  /** The chosen name, or the GitHub username until one is chosen. */
  name(user: string, login: string | null): string {
    const row = this.#db
      .query<{ name: string }, [string]>("SELECT name FROM profile WHERE user = ?")
      .get(user);
    return row?.name ?? login ?? "";
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
    return { name: this.name(user, login), login, best, daily };
  }

  /** Keeps the better best per puzzle and every day of both sides; a name, when sent, replaces it. */
  merge(user: string, sync: AccountSync): void {
    this.#db.transaction(() => {
      if (sync.name !== undefined) {
        this.#db
          .query(
            "INSERT INTO profile (user, name) VALUES (?1, ?2) ON CONFLICT (user) DO UPDATE SET name = ?2",
          )
          .run(user, sync.name);
      }
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
    const name = this.#db
      .query<{ name: string }, [string]>("SELECT name FROM profile WHERE user = ?")
      .get(from)?.name;
    this.#db.transaction(() => {
      if (name !== undefined && name !== "") {
        this.#db.query("INSERT OR IGNORE INTO profile (user, name) VALUES (?, ?)").run(to, name);
      }
      this.merge(to, { best, daily: [...daily] });
      for (const table of ["profile", "best", "solved"]) {
        this.#db.query(`DELETE FROM ${table} WHERE user = ?`).run(from);
      }
    })();
  }
}

export interface AuthOptions {
  db: Database;
  /** the site's own origin, which GitHub sends the player back to */
  baseURL: string;
  secret: string;
  github?: GitHub | undefined;
  /** a guest signed in to an account (`login` on GitHub): their progress and runs move to it */
  linked: (from: string, to: string, login: string) => void;
}

/** Better Auth with guests and, when configured, GitHub; its tables are made or brought up to date first. */
export async function createAuth(o: AuthOptions) {
  const auth = betterAuth({
    baseURL: o.baseURL,
    basePath: "/api/auth",
    secret: o.secret,
    database: o.db,
    telemetry: { enabled: false },
    // cloudflared passes the visitor's address; Better Auth's own limits key on it
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
    rateLimit: { enabled: true },
    socialProviders:
      o.github === undefined
        ? {}
        : {
            github: {
              clientId: o.github.clientId,
              clientSecret: o.github.clientSecret,
              // the username, which a board shows, rather than the profile's display name
              mapProfileToUser: (profile) => ({ name: profile.login }),
            },
          },
    plugins: [
      anonymous({
        onLinkAccount: ({ anonymousUser, newUser }) =>
          o.linked(anonymousUser.user.id, newUser.user.id, newUser.user.name),
      }),
    ],
  });
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
  return auth;
}

export type Auth = Awaited<ReturnType<typeof createAuth>>;

/** The signed-in player behind `req`, or null. */
export async function playerOf(
  auth: Auth,
  progress: Progress,
  req: Request,
): Promise<Player | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (session === null) return null;
  const login = session.user.isAnonymous === true ? null : session.user.name;
  return { id: session.user.id, login, name: progress.name(session.user.id, login) };
}

/** `/api/auth/*` (Better Auth) and `/api/me`: GET the account, PUT one device's side of a sync. */
export function accountRoutes(deps: {
  auth: Auth;
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
    const player = await playerOf(deps.auth, deps.progress, req);
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
