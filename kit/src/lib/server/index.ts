import { isAbsolute, resolve, sep } from "node:path";
import * as v from "valibot";

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy":
    "default-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export const respond = (
  body: BodyInit | null,
  status: number,
  headers: Record<string, string> = {},
) => new Response(body, { status, headers: { ...SECURITY_HEADERS, ...headers } });

export const text = (body: string, status: number) =>
  respond(body, status, { "Content-Type": "text/plain; charset=utf-8" });

export const json = (body: unknown, status = 200) =>
  respond(JSON.stringify(body), status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });

/** Null when `pathname` would leave `root`. */
export function resolveStatic(root: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const base = resolve(root);
  const file = resolve(base, `.${decoded}`);
  return file.startsWith(base + sep) ? file : null;
}

/** A project's API; `undefined` passes the request on to the web app. */
export type Routes = (
  req: Request,
  url: URL,
) => Response | undefined | Promise<Response | undefined>;

export function handler(staticDir: string, routes?: Routes): (req: Request) => Promise<Response> {
  return async (req) => {
    const url = new URL(req.url);
    if (url.pathname === "/healthz") return text("ok", 200);
    const own = await routes?.(req, url);
    if (own !== undefined) return own;
    if (req.method !== "GET" && req.method !== "HEAD") {
      return respond("method not allowed", 405, { Allow: "GET, HEAD" });
    }
    const path = resolveStatic(staticDir, url.pathname === "/" ? "/index.html" : url.pathname);
    const file = path === null ? null : Bun.file(path);
    if (file === null || !(await file.exists())) return text("not found", 404);
    return respond(req.method === "HEAD" ? null : file, 200, {
      "Content-Type": file.type,
      "Cache-Control": url.pathname.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    });
  };
}

export const envPrefix = (name: string) => name.toUpperCase().replaceAll("-", "_");

export type Extra<E extends v.ObjectEntries> = v.InferOutput<v.ObjectSchema<E, undefined>>;
export type Config<E extends v.ObjectEntries> = Extra<E> & {
  host: string;
  port: number;
  staticDir: string;
};

const STATIC = "an absolute path to the built web app";

/** `<PREFIX>_HOST`, `_PORT` and `_STATIC`, plus `extra` by full name; throws naming every bad one. */
export function parseEnv<E extends v.ObjectEntries>(
  name: string,
  env: Record<string, string | undefined>,
  extra: E = {} as E,
  port = 7000,
): Config<E> {
  const p = envPrefix(name);
  const schema = v.object({
    ...extra,
    [`${p}_HOST`]: v.optional(v.pipe(v.string(), v.nonEmpty()), "127.0.0.1"),
    [`${p}_PORT`]: v.optional(
      v.pipe(
        v.string(),
        v.regex(/^\d{1,5}$/, "a port number"),
        v.transform(Number),
        v.minValue(1),
        v.maxValue(65535),
      ),
      String(port),
    ),
    [`${p}_STATIC`]: v.pipe(v.string(STATIC), v.check(isAbsolute, STATIC)),
  });
  // every name present, so a missing one gets its own message rather than "Invalid key"
  const input = Object.fromEntries(Object.keys(schema.entries).map((k) => [k, env[k]]));
  const r = v.safeParse(schema, input);
  if (!r.success) {
    const lines = r.issues.map((i) => `${v.getDotPath(i)}: ${i.message}`).sort();
    throw new Error(`bad environment:\n  ${lines.join("\n  ")}`);
  }
  const out = r.output as Record<string, unknown>;
  const own = Object.fromEntries(Object.keys(extra).map((k) => [k, out[k]])) as Extra<E>;
  return {
    ...own,
    host: out[`${p}_HOST`] as string,
    port: out[`${p}_PORT`] as number,
    staticDir: out[`${p}_STATIC`] as string,
  };
}

/** The app's server; a bad environment exits 2 with every problem named. */
export function serve<E extends v.ObjectEntries>(opts: {
  name: string;
  extra?: E;
  port?: number;
  routes?: (config: Config<E>) => Routes;
}) {
  let config: Config<E>;
  try {
    config = parseEnv(opts.name, process.env, opts.extra, opts.port);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(2);
  }
  const server = Bun.serve({
    hostname: config.host,
    port: config.port,
    fetch: handler(config.staticDir, opts.routes?.(config)),
  });
  console.log(`${opts.name} listening on ${server.url}`);
  return { server, config };
}
