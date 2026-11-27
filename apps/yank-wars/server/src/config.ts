// The server's settings: its port, the CSP it adds to lsel's, and the environment beside serve()'s host, port and static directory.

import * as v from "valibot";
import type { GitHub } from "./accounts.ts";

export const PORT = 7300;

/** CodeMirror styles itself with <style> elements, which lsel's default CSP blocks. */
export const CSP = "style-src 'self' 'unsafe-inline'";

const optional = v.optional(v.pipe(v.string(), v.nonEmpty()));

export const ENV = {
  /** the address players use: GitHub sends them back here, and Better Auth trusts it */
  YW_ORIGIN: v.optional(v.pipe(v.string(), v.url()), `http://127.0.0.1:${PORT}`),
  /** signs sessions; at least 32 characters (openssl rand -hex 32) */
  YW_AUTH_SECRET: v.pipe(v.string("YW_AUTH_SECRET: openssl rand -hex 32"), v.minLength(32)),
  /** a GitHub OAuth app; without both, sign-in is guests only */
  YW_GITHUB_ID: optional,
  YW_GITHUB_SECRET: optional,
};

/** GitHub sign-in, when both halves of the OAuth app are set. */
export function github(config: {
  YW_GITHUB_ID?: string | undefined;
  YW_GITHUB_SECRET?: string | undefined;
}): GitHub | undefined {
  const { YW_GITHUB_ID: clientId, YW_GITHUB_SECRET: clientSecret } = config;
  return clientId === undefined || clientSecret === undefined
    ? undefined
    : { clientId, clientSecret };
}
