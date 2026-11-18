import { isAbsolute } from "node:path";
import * as v from "valibot";
import { name } from "../../package.json";

/** `lsel-station` reads `LSEL_STATION_HOST`, `_PORT`, `_STATIC` and `_DB`. */
export const PREFIX = name.toUpperCase().replaceAll("-", "_");

const VARS = { host: "HOST", port: "PORT", staticDir: "STATIC", db: "DB" } as const;
const STATIC = "an absolute path to the built web app";
const DB = "an absolute path to the saves database";

const Config = v.object({
  host: v.optional(v.pipe(v.string(), v.nonEmpty()), "127.0.0.1"),
  port: v.optional(
    v.pipe(
      v.string(),
      v.regex(/^\d{1,5}$/, "a port number"),
      v.transform(Number),
      v.minValue(1),
      v.maxValue(65535),
    ),
    "7000",
  ),
  staticDir: v.pipe(v.string(STATIC), v.check(isAbsolute, STATIC)),
  db: v.pipe(v.string(DB), v.check(isAbsolute, DB)),
});

export type Config = v.InferOutput<typeof Config>;

/** Throws a readable message naming every bad variable. */
export function parseConfig(env: Record<string, string | undefined>): Config {
  const r = v.safeParse(Config, {
    host: env[`${PREFIX}_HOST`],
    port: env[`${PREFIX}_PORT`],
    staticDir: env[`${PREFIX}_STATIC`],
    db: env[`${PREFIX}_DB`],
  });
  if (!r.success) {
    const lines = r.issues.map((i) => {
      const key = v.getDotPath(i) as keyof typeof VARS;
      return `${PREFIX}_${VARS[key]}: ${i.message}`;
    });
    throw new Error(`bad environment:\n  ${lines.join("\n  ")}`);
  }
  return r.output;
}
