import { resolve, sep } from "node:path";
import { report } from "../shared/stats.ts";
import { type Pubg, PubgError, type PubgFailure } from "./pubg.ts";

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function respond(body: BodyInit | null, status: number, headers: Record<string, string> = {}) {
  return new Response(body, { status, headers: { ...SECURITY_HEADERS, ...headers } });
}

const json = (body: unknown, status = 200) =>
  respond(JSON.stringify(body), status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });

const text = (body: string, status: number) =>
  respond(body, status, { "Content-Type": "text/plain; charset=utf-8" });

const STATUS: Record<PubgFailure, number> = {
  "rate-limited": 429,
  "not-found": 404,
  unavailable: 502,
  unexpected: 502,
};

/** The file under `root` that `pathname` names, or null when it would leave `root`. */
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

export interface Deps {
  staticDir: string;
  players: readonly string[];
  pubg: Pick<Pubg, "players" | "recentMatches">;
}

export function handler(deps: Deps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return respond("method not allowed", 405, { Allow: "GET, HEAD" });
    }
    const url = new URL(req.url);
    const { pathname } = url;
    if (pathname === "/healthz") return text("ok", 200);
    if (pathname === "/api/players") return json({ players: deps.players });
    if (pathname === "/api/report") return reportFor(deps, url.searchParams.get("players") ?? "");
    if (pathname.startsWith("/api/")) return json({ error: "no such endpoint" }, 404);

    const path = resolveStatic(deps.staticDir, pathname === "/" ? "/index.html" : pathname);
    if (path === null) return text("not found", 404);
    const file = Bun.file(path);
    if (!(await file.exists())) return text("not found", 404);
    const cache = pathname.startsWith("/assets/")
      ? "public, max-age=31536000, immutable"
      : "no-cache";
    return respond(req.method === "HEAD" ? null : file, 200, {
      "Content-Type": file.type,
      "Cache-Control": cache,
    });
  };
}

async function reportFor(deps: Deps, param: string): Promise<Response> {
  const names = param.split(",").filter((n) => n !== "");
  if (names.length === 0) return json({ error: "choose at least one player" }, 400);
  const unknown = names.filter((n) => !deps.players.includes(n));
  if (unknown.length > 0) return json({ error: `not a dajaj player: ${unknown.join(", ")}` }, 400);
  if (new Set(names).size !== names.length) return json({ error: "a player is listed twice" }, 400);
  try {
    const players = await deps.pubg.players(names);
    return json(report(players, await deps.pubg.recentMatches(players)));
  } catch (e) {
    if (e instanceof PubgError) {
      console.error(`pubg ${e.kind}: ${e.message}`);
      return json({ error: e.message }, STATUS[e.kind]);
    }
    throw e;
  }
}
