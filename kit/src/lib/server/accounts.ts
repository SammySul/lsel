// Accounts: guests and GitHub sign-in through Better Auth, and the name a player shows on boards.

import type { Database } from "bun:sqlite";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { anonymous } from "better-auth/plugins";

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

/** Board names per account, beside Better Auth's tables in the same database. */
export class Names {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
    db.run("PRAGMA journal_mode = WAL");
    db.run("CREATE TABLE IF NOT EXISTS profile (user TEXT PRIMARY KEY, name TEXT NOT NULL)");
  }

  /** The chosen name, or the GitHub username until one is chosen; empty for a guest who hasn't chosen. */
  of(user: string, login: string | null): string {
    return this.#chosen(user) ?? login ?? "";
  }

  rename(user: string, name: string): void {
    this.#db
      .query(
        "INSERT INTO profile (user, name) VALUES (?1, ?2) ON CONFLICT (user) DO UPDATE SET name = ?2",
      )
      .run(user, name);
  }

  /** A guest's name goes to the account it signed in to, unless the account has one. */
  move(from: string, to: string): void {
    const name = this.#chosen(from);
    this.#db.transaction(() => {
      if (name !== undefined && name !== "") {
        this.#db.query("INSERT OR IGNORE INTO profile (user, name) VALUES (?, ?)").run(to, name);
      }
      this.#db.query("DELETE FROM profile WHERE user = ?").run(from);
    })();
  }

  #chosen(user: string): string | undefined {
    return this.#db
      .query<{ name: string }, [string]>("SELECT name FROM profile WHERE user = ?")
      .get(user)?.name;
  }
}

export interface AuthOptions {
  db: Database;
  /** the site's own origin, which GitHub sends the player back to */
  baseURL: string;
  secret: string;
  github?: GitHub | undefined;
  /** a guest signed in to an account (`login` on GitHub): move what the app keeps per player */
  linked: (from: string, to: string, login: string) => void;
}

/** Better Auth on `/api/auth` with guests and, when configured, GitHub; its tables are made or brought up to date first. */
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
export async function playerOf(auth: Auth, names: Names, req: Request): Promise<Player | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (session === null) return null;
  const login = session.user.isAnonymous === true ? null : session.user.name;
  return { id: session.user.id, login, name: names.of(session.user.id, login) };
}
