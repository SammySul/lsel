import { handler, parseEnv } from "@sammysul/lsel/server";

// CodeMirror styles itself with <style> elements, which the shared CSP blocks.
export const CSP =
  "default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** squares deploys this with the `YW_` prefix and port 7300. */
export const parseConfig = (env: Record<string, string | undefined>) =>
  parseEnv("yw", env, {}, 7300);

export function app(staticDir: string): (req: Request) => Promise<Response> {
  const files = handler(staticDir);
  return async (req) => {
    const res = await files(req);
    res.headers.set("Content-Security-Policy", CSP);
    return res;
  };
}
