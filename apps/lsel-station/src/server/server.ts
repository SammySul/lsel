import { resolve, sep } from "node:path";
import * as v from "valibot";
import { keyId } from "../save/key.ts";
import { LIMITS, rateLimiter, type Saves } from "./saves.ts";

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function respond(body: BodyInit | null, status: number, headers: Record<string, string> = {}) {
  return new Response(body, { status, headers: { ...SECURITY_HEADERS, ...headers } });
}

const text = (body: string, status: number) =>
  respond(body, status, { "Content-Type": "text/plain; charset=utf-8" });

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

const json = (body: unknown, status: number) =>
  respond(JSON.stringify(body), status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });

const SAVE_PATH = /^\/save\/([0-9a-f]{64})$/;
const Put = v.object({ base: v.pipe(v.number(), v.integer(), v.minValue(0)), data: v.string() });

/** `/save/<id>`: GET reads a synced save, PUT stores one. The key itself comes in the Authorization header. */
async function sync(req: Request, id: string, saves: Saves, allowed: (key: string) => boolean) {
  if (req.method !== "GET" && req.method !== "PUT") {
    return respond("method not allowed", 405, { Allow: "GET, PUT" });
  }
  // cloudflared passes the visitor's address; without it, everyone shares one budget
  const address = req.headers.get("cf-connecting-ip") ?? "direct";
  if (!allowed(`address ${address}`) || !allowed(`save ${id}`)) {
    return json({ error: "too many requests" }, 429);
  }
  const key = req.headers.get("authorization")?.match(/^Bearer (\S{16,128})$/)?.[1];
  if (key === undefined || (await keyId(key)) !== id) return json({ error: "wrong key" }, 403);

  if (req.method === "GET") {
    const stored = saves.get(id);
    if (stored === null) return json({ error: "no such save" }, 404);
    // ?sent=<savedAt>: a device asks whether the save it sent as its page closed arrived
    const sent = Number(new URL(req.url).searchParams.get("sent") ?? Number.NaN);
    return json(
      Number.isInteger(sent) ? { ...stored, landed: saves.landed(id, sent) } : stored,
      200,
    );
  }
  if (Number(req.headers.get("content-length") ?? 0) > LIMITS.bytes) {
    return json({ error: "save too large" }, 413);
  }
  const body = await req.text();
  if (body.length > LIMITS.bytes) return json({ error: "save too large" }, 413);
  let parsed: v.SafeParseResult<typeof Put>;
  try {
    parsed = v.safeParse(Put, JSON.parse(body));
  } catch {
    return json({ error: "not JSON" }, 400);
  }
  if (!parsed.success) return json({ error: "expected { base, data }" }, 400);
  const result = saves.put(id, parsed.output.base, parsed.output.data, Date.now());
  if (result.ok) return json({ revision: result.revision }, 200);
  if ("current" in result) return json(result.current, 409);
  return json({ error: result.reason }, 400);
}

export function handler(opts: {
  staticDir: string;
  saves: Saves;
}): (req: Request) => Promise<Response> {
  const { staticDir, saves } = opts;
  const perSave = rateLimiter(LIMITS.perSave);
  const perAddress = rateLimiter(LIMITS.perAddress);
  const allowed = (key: string) =>
    key.startsWith("save ") ? perSave(key, Date.now()) : perAddress(key, Date.now());
  return async (req) => {
    const { pathname } = new URL(req.url);
    const save = pathname.match(SAVE_PATH);
    if (save?.[1] !== undefined) return sync(req, save[1], saves, allowed);
    if (req.method !== "GET" && req.method !== "HEAD") {
      return respond("method not allowed", 405, { Allow: "GET, HEAD" });
    }
    if (pathname === "/healthz") return text("ok", 200);
    const path = resolveStatic(staticDir, pathname === "/" ? "/index.html" : pathname);
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
