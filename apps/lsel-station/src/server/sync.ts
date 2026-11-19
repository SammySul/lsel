import { isAbsolute } from "node:path";
import { json, type Routes, respond } from "@sammysul/lsel/server";
import * as v from "valibot";
import { keyId } from "../save/key.ts";
import { LIMITS, rateLimiter, type Saves } from "./saves.ts";

const DB = "an absolute path to the saves database";

/** The service's own variable, besides `serve()`'s host, port and static directory. */
export const ENV = { LSEL_STATION_DB: v.pipe(v.string(DB), v.check(isAbsolute, DB)) };

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
    return json(Number.isInteger(sent) ? { ...stored, landed: saves.landed(id, sent) } : stored);
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
  if (result.ok) return json({ revision: result.revision });
  if ("current" in result) return json(result.current, 409);
  return json({ error: result.reason }, 400);
}

/** The sync service's routes; everything else is the built game. */
export function syncRoutes(saves: Saves): Routes {
  const perSave = rateLimiter(LIMITS.perSave);
  const perAddress = rateLimiter(LIMITS.perAddress);
  const allowed = (key: string) =>
    key.startsWith("save ") ? perSave(key, Date.now()) : perAddress(key, Date.now());
  return (req, url) => {
    const id = url.pathname.match(SAVE_PATH)?.[1];
    return id === undefined ? undefined : sync(req, id, saves, allowed);
  };
}
