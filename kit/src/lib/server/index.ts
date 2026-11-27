// serve(): the Bun server every app runs, with lsel's security headers, health check and WebSockets.

import { isAbsolute, resolve, sep } from "node:path";
import * as v from "valibot";

const CSP = "default-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

// a directive named twice in one policy is ignored the second time, so `extra` replaces by name
function withCsp(extra: string): string {
  const directives = new Map<string, string>();
  for (const part of `${CSP}; ${extra}`.split(";")) {
    const directive = part.trim();
    if (directive !== "") directives.set(directive.split(/\s+/)[0] ?? directive, directive);
  }
  return [...directives.values()].join("; ");
}

export const respond = (
  body: BodyInit | null,
  status: number,
  headers: Record<string, string> = {},
) => new Response(body, { status, headers: { ...SECURITY_HEADERS, ...headers } });

export const text = (body: string, status = 200) =>
  respond(body, status, { "Content-Type": "text/plain; charset=utf-8" });

export const json = (body: unknown, status = 200) =>
  respond(JSON.stringify(body), status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });

/** Counts requests per key in fixed one-minute windows. */
export function rateLimiter(limit: number) {
  const windows = new Map<string, { start: number; count: number }>();
  return (key: string, now: number): boolean => {
    const window = windows.get(key);
    if (window === undefined || now - window.start >= 60_000) {
      if (windows.size > 10_000) windows.clear();
      windows.set(key, { start: now, count: 1 });
      return true;
    }
    window.count++;
    return window.count <= limit;
  };
}

/** Null when `pathname` would leave `root`. */
function resolveStatic(root: string, pathname: string): string | null {
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

/** `csp` adds directives to the default policy, replacing ones of the same name (CodeMirror's inline styles). */
export function handler(
  staticDir: string,
  routes?: Routes,
  { csp }: { csp?: string | undefined } = {},
): (req: Request) => Promise<Response> {
  const answer = async (req: Request) => {
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
  const policy = csp === undefined ? undefined : withCsp(csp);
  return async (req) => {
    const res = await answer(req);
    if (policy !== undefined) res.headers.set("Content-Security-Policy", policy);
    return res;
  };
}

const envPrefix = (name: string) => name.toUpperCase().replaceAll("-", "_");

type Extra<E extends v.ObjectEntries> = v.InferOutput<v.ObjectSchema<E, undefined>>;
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

/** A WebSocket endpoint: `data` is the new socket's `ws.data`, or a Response refusing it. */
export interface Socket<T> {
  path: string;
  data: (req: Request) => T | Response;
  handler: Bun.WebSocketHandler<T>;
}

/** A browser always sends Origin; another site's page must not open sockets as its visitor. */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("Origin");
  if (origin === null) return true;
  try {
    return new URL(origin).host === req.headers.get("Host");
  } catch {
    return false;
  }
}

export function upgrade<T>(
  socket: Socket<T>,
  req: Request,
  server: Bun.Server<T>,
): Response | undefined {
  if (!sameOrigin(req)) return text("cross-origin socket refused", 403);
  const data = socket.data(req);
  if (data instanceof Response) return data;
  // Bun types `upgrade` by whether T is undefined, which a generic T can't satisfy.
  const upgraded = (server as Bun.Server<unknown>).upgrade(req, { data });
  return upgraded ? undefined : text("expected a WebSocket upgrade", 426);
}

/** The app's server; a bad environment exits 2 with every problem named. */
export function serve<E extends v.ObjectEntries, T = undefined>(opts: {
  name: string;
  /** The env prefix, when it isn't the name's (`YW` for yank-wars). */
  prefix?: string;
  extra?: E;
  port?: number;
  csp?: string;
  /** Seconds a request may go without a byte before Bun drops it (10 by default, 255 at most): an API that waits on a slow upstream. */
  idleTimeout?: number;
  routes?: (config: Config<E>) => Routes;
  socket?: (config: Config<E>) => Socket<T>;
}) {
  let config: Config<E>;
  try {
    config = parseEnv(opts.prefix ?? opts.name, process.env, opts.extra, opts.port);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(2);
  }
  const http = handler(config.staticDir, opts.routes?.(config), { csp: opts.csp });
  const socket = opts.socket?.(config);
  const at = {
    hostname: config.host,
    port: config.port,
    ...(opts.idleTimeout === undefined ? {} : { idleTimeout: opts.idleTimeout }),
  };
  const server =
    socket === undefined
      ? Bun.serve({ ...at, fetch: http })
      : Bun.serve<T>({
          ...at,
          fetch: (req, srv) =>
            new URL(req.url).pathname === socket.path ? upgrade(socket, req, srv) : http(req),
          websocket: socket.handler,
        });
  console.log(`${opts.name} listening on ${server.url}`);
  return { server, config };
}
