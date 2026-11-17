import { isAbsolute } from "node:path";
import * as v from "valibot";

const Env = v.object({
  YW_HOST: v.optional(v.pipe(v.string(), v.nonEmpty()), "127.0.0.1"),
  YW_PORT: v.optional(
    v.pipe(
      v.string(),
      v.regex(/^\d{1,5}$/, "a port number"),
      v.transform(Number),
      v.minValue(1),
      v.maxValue(65535),
    ),
    "7300",
  ),
  YW_STATIC: v.pipe(v.string(), v.check(isAbsolute, "an absolute path to the built web app")),
});

export interface Config {
  host: string;
  port: number;
  staticDir: string;
}

/** Throws a readable message naming every bad variable. */
export function parseConfig(env: Record<string, string | undefined>): Config {
  const r = v.safeParse(Env, env);
  if (!r.success) {
    const lines = r.issues.map((i) => `${v.getDotPath(i) ?? "env"}: ${i.message}`);
    throw new Error(`bad environment:\n  ${lines.join("\n  ")}`);
  }
  return { host: r.output.YW_HOST, port: r.output.YW_PORT, staticDir: r.output.YW_STATIC };
}
