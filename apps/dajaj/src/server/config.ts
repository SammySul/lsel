import { isAbsolute } from "node:path";
import * as v from "valibot";

const Absolute = (what: string) =>
  v.pipe(v.string(), v.check(isAbsolute, `an absolute path to ${what}`));

const Env = v.object({
  DAJAJ_HOST: v.optional(v.pipe(v.string(), v.nonEmpty()), "127.0.0.1"),
  DAJAJ_PORT: v.optional(
    v.pipe(
      v.string(),
      v.regex(/^\d{1,5}$/, "a port number"),
      v.transform(Number),
      v.minValue(1),
      v.maxValue(65535),
    ),
    "7310",
  ),
  DAJAJ_STATIC: Absolute("the built web app"),
  DAJAJ_DB: Absolute("the match cache (an SQLite file)"),
  DAJAJ_PLAYERS: v.pipe(
    v.string(),
    v.transform((s) =>
      s
        .split(",")
        .map((x) => x.trim())
        .filter((x) => x !== ""),
    ),
    v.minLength(1, "a comma-separated list of PUBG names"),
    v.maxLength(10, "at most 10 names (one PUBG lookup)"),
  ),
  PUBG_API_KEY: v.pipe(v.string(), v.nonEmpty("the PUBG API key")),
  PUBG_API_URL: v.optional(v.pipe(v.string(), v.url()), "https://api.pubg.com/shards/steam"),
});

export interface Config {
  host: string;
  port: number;
  staticDir: string;
  db: string;
  players: string[];
  apiKey: string;
  apiUrl: string;
}

/** Throws a readable message naming every bad variable (never their values: one is a key). */
export function parseConfig(env: Record<string, string | undefined>): Config {
  const r = v.safeParse(Env, env);
  if (!r.success) {
    const lines = r.issues.map((i) => `${v.getDotPath(i) ?? "env"}: ${i.message}`);
    throw new Error(`bad environment:\n  ${lines.join("\n  ")}`);
  }
  const o = r.output;
  return {
    host: o.DAJAJ_HOST,
    port: o.DAJAJ_PORT,
    staticDir: o.DAJAJ_STATIC,
    db: o.DAJAJ_DB,
    players: o.DAJAJ_PLAYERS,
    apiKey: o.PUBG_API_KEY,
    apiUrl: o.PUBG_API_URL,
  };
}
