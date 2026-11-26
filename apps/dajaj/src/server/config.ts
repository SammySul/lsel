// Reads the server's settings from the environment, naming a missing one without printing it.

import { isAbsolute } from "node:path";
import * as v from "valibot";

const DB = "an absolute path to the match cache (an SQLite file)";
const PLAYERS = "a comma-separated list of PUBG names";
const KEY = "the PUBG API key";

/** Beside `DAJAJ_HOST`, `_PORT` and `_STATIC`; a bad one is named, never printed: one is a key. */
export const ENV = {
  DAJAJ_DB: v.pipe(v.string(DB), v.check(isAbsolute, DB)),
  DAJAJ_PLAYERS: v.pipe(
    v.string(PLAYERS),
    v.transform((s) =>
      s
        .split(",")
        .map((x) => x.trim())
        .filter((x) => x !== ""),
    ),
    v.minLength(1, PLAYERS),
    v.maxLength(10, "at most 10 names (one PUBG lookup)"),
  ),
  PUBG_API_KEY: v.pipe(v.string(KEY), v.nonEmpty(KEY)),
  PUBG_API_URL: v.optional(v.pipe(v.string(), v.url()), "https://api.pubg.com/shards/steam"),
};

export const PORT = 7310;
