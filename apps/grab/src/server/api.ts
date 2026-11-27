// The JSON API the web app calls, the media it shows and downloads (through this server: the CSP allows only 'self'), and the zip.

import { json, type Routes, rateLimiter, respond } from "@sammysul/lsel/server";
import { fileName, type Media, type Profile, safeDecode, toUsername } from "../shared/types.ts";
import type { Instagram } from "./instagram.ts";
import { InstagramError, type InstagramFailure } from "./parse.ts";
import { type Entry, zip } from "./zip.ts";

const STATUS: Record<InstagramFailure, number> = {
  "not-found": 404,
  "rate-limited": 429,
  login: 503,
  unavailable: 502,
  unexpected: 502,
  expired: 410,
  "not-cdn": 400,
};

export interface Deps {
  instagram: Pick<Instagram, "known" | "snapshot" | "peek" | "forget" | "file">;
  /** Whether this visitor may start another profile now; polling and cached profiles never count. */
  allow?: (visitor: string, now: number) => boolean;
}

const SAFE_NAME = /^[A-Za-z0-9._-]{1,120}$/;
const ZIP_AHEAD = 4;

// every new profile spends twelve's Instagram budget, which all visitors share
const NEW_PROFILES_A_MINUTE = 5;

/** Behind cloudflared the visitor is in cf-connecting-ip; on the tailnet or in tests there is one. */
const visitor = (req: Request) => req.headers.get("cf-connecting-ip") ?? "local";

function failure(e: unknown): Response {
  if (e instanceof InstagramError) {
    console.error(`instagram ${e.kind}: ${e.message}`);
    return json({ error: e.message }, STATUS[e.kind]);
  }
  throw e;
}

/** The username in an address part, or the 400 that says why it isn't one. */
function username(part: string): string | Response {
  const input = safeDecode(part);
  const name = input === null ? null : toUsername(input);
  return (
    name ??
    json({ error: `${input ?? part} isn't an Instagram username: letters, numbers, . and _` }, 400)
  );
}

interface Chosen {
  media: Media;
  modified: Date;
  /** The post's folder in the zip: its date when known, then its shortcode; none for the picture. */
  folder: string | null;
}

const day = (at: number) => new Date(at).toISOString().slice(0, 10);

function byId(profile: Profile): Map<string, Chosen> {
  const chosen = new Map<string, Chosen>([
    [profile.picture.id, { media: profile.picture, modified: new Date(), folder: null }],
  ]);
  for (const post of profile.posts) {
    for (const m of post.media) {
      chosen.set(m.id, {
        media: m,
        modified: new Date(post.takenAt ?? Date.now()),
        folder: post.takenAt === null ? post.code : `${day(post.takenAt)} ${post.code}`,
      });
    }
  }
  return chosen;
}

export function api({ instagram, allow = rateLimiter(NEW_PROFILES_A_MINUTE) }: Deps): Routes {
  async function profile(req: Request, part: string, url: URL): Promise<Response> {
    const name = username(part);
    if (name instanceof Response) return name;
    // R on the page asks Instagram again, as a new profile; refused, the cached one stays
    const reload = url.searchParams.has("reload");
    const fresh = !instagram.known(name) || reload;
    if (fresh && !allow(visitor(req), Date.now())) {
      return json(
        {
          error: `That's ${NEW_PROFILES_A_MINUTE} new profiles this minute, all Instagram allows this server for one visitor; try again in a minute`,
        },
        429,
      );
    }
    if (reload) instagram.forget(name);
    try {
      return json(await instagram.snapshot(name));
    } catch (e) {
      return failure(e);
    }
  }

  async function media(req: Request, url: URL): Promise<Response> {
    const name = url.searchParams.get("name");
    if (name !== null && !SAFE_NAME.test(name)) return json({ error: "not a file name" }, 400);
    let res: Response;
    try {
      res = await instagram.file(
        url.searchParams.get("src") ?? "",
        req.headers.get("Range") ?? undefined,
      );
    } catch (e) {
      return failure(e);
    }
    const headers: Record<string, string> = {
      "Content-Type": res.headers.get("Content-Type") ?? "",
      "Cache-Control": "private, max-age=3600",
    };
    for (const h of ["Content-Length", "Content-Range", "Accept-Ranges"]) {
      const value = res.headers.get(h);
      if (value !== null) headers[h] = value;
    }
    if (name !== null) headers["Content-Disposition"] = `attachment; filename="${name}"`;
    return respond(req.method === "HEAD" ? null : res.body, res.status, headers);
  }

  async function archive(part: string, url: URL): Promise<Response> {
    const name = username(part);
    if (name instanceof Response) return name;
    const ids = (url.searchParams.get("ids") ?? "").split(",").filter((id) => id !== "");
    if (ids.length === 0) return json({ error: "choose at least one file" }, 400);
    // only what the page showed: a zip never starts a load, which allow() would have to count
    const seen = instagram.peek(name);
    if (seen === undefined) return json({ error: "Reload the profile first" }, 409);
    let chosen: Map<string, Chosen>;
    try {
      // what the page could tick has loaded; a file that hasn't waits for the rest
      const now = await seen.now;
      chosen = byId(now);
      if (now.pending > 0 && ids.some((id) => !chosen.has(id))) chosen = byId(await seen.whole);
    } catch (e) {
      return failure(e);
    }
    const unknown = ids.filter((id) => !chosen.has(id));
    if (unknown.length > 0) {
      return json({ error: `not in ${name}'s recent posts: ${unknown.join(", ")}` }, 400);
    }
    const files = [...new Set(ids)].map((id) => chosen.get(id) as Chosen);
    return respond(zip(entries(name, files)), 200, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}.zip"`,
      "Cache-Control": "no-store",
    });
  }

  /** In order, a few fetched ahead; any the CDN refused are named in MISSING.txt rather than failing the zip. */
  async function* entries(name: string, files: readonly Chosen[]): AsyncGenerator<Entry> {
    const started: (Promise<Uint8Array | Error> | undefined)[] = [];
    const start = (i: number) => {
      const c = files[i];
      if (c !== undefined && started[i] === undefined) {
        started[i] = instagram
          .file(c.media.src)
          .then(async (res) => new Uint8Array(await res.arrayBuffer()))
          .catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))));
      }
    };
    const missing: string[] = [];
    for (const [i, c] of files.entries()) {
      for (let k = i; k < i + ZIP_AHEAD; k++) start(k);
      const data = await started[i];
      started[i] = undefined;
      const path = `${c.folder === null ? "" : `${c.folder}/`}${fileName(name, c.media)}`;
      if (data instanceof Uint8Array) yield { name: path, data, modified: c.modified };
      else missing.push(`${path}: ${data?.message}`);
    }
    if (missing.length > 0) {
      const text = `Instagram didn't send these:\n${missing.join("\n")}\n`;
      yield { name: "MISSING.txt", data: new TextEncoder().encode(text), modified: new Date() };
    }
  }

  return async (req, url) => {
    const { pathname } = url;
    if (!pathname.startsWith("/api/")) return undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      return respond("method not allowed", 405, { Allow: "GET, HEAD" });
    }
    const profileAt = /^\/api\/profile\/([^/]+)$/.exec(pathname);
    if (profileAt) return profile(req, profileAt[1] as string, url);
    if (pathname === "/api/media") return media(req, url);
    const zipAt = /^\/api\/zip\/([^/]+)$/.exec(pathname);
    if (zipAt) return archive(zipAt[1] as string, url);
    return json({ error: "no such endpoint" }, 404);
  };
}
