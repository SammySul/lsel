// The JSON API the web app calls, the media it shows and downloads (through this server: the CSP allows only 'self'), and the zip.

import { json, type Routes, rateLimiter, respond } from "@sammysul/lsel/server";
import { fileName, type Media, type Profile, toUsername } from "../shared/types.ts";
import { BROWSER, type Fetch, type Instagram } from "./instagram.ts";
import { type Failure, InstagramError } from "./parse.ts";
import { type Entry, zip } from "./zip.ts";

const STATUS: Record<Failure, number> = {
  "not-found": 404,
  "rate-limited": 429,
  login: 503,
  unavailable: 502,
  unexpected: 502,
};

export interface Deps {
  instagram: Pick<Instagram, "snapshot" | "profile" | "known">;
  /** Whether this visitor may start another profile now; polling and cached profiles never count. */
  allow?: (visitor: string, now: number) => boolean;
  /** For the CDN's files. */
  fetch?: Fetch;
}

/** Only Instagram's CDN, so the proxy can't be pointed anywhere else. */
export function cdnUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const ours = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(url.hostname);
  return url.protocol === "https:" && url.port === "" && ours ? url : null;
}

const SAFE_NAME = /^[A-Za-z0-9._-]{1,120}$/;
const ZIP_AHEAD = 4;

// every new profile spends twelve's Instagram budget, which all visitors share
const NEW_PROFILES_A_MINUTE = 5;

/** Behind cloudflared the visitor is in cf-connecting-ip; on the tailnet or in tests there is one. */
const visitor = (req: Request) => req.headers.get("cf-connecting-ip") ?? "local";

export function api(deps: Deps): Routes {
  const allow = deps.allow ?? rateLimiter(NEW_PROFILES_A_MINUTE);
  const get: Fetch = deps.fetch ?? ((url, init) => fetch(url, init));

  async function file(src: string): Promise<Uint8Array> {
    const url = cdnUrl(src);
    if (url === null) throw new Error(`not an Instagram CDN address: ${src}`);
    const res = await get(url.href, { headers: BROWSER });
    if (!res.ok) throw new Error(`Instagram's CDN answered ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  return async (req, url) => {
    const { pathname } = url;
    if (!pathname.startsWith("/api/")) return undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      return respond("method not allowed", 405, { Allow: "GET, HEAD" });
    }
    const profileAt = /^\/api\/profile\/([^/]+)$/.exec(pathname);
    if (profileAt) {
      return profile(deps, allow, req, decodeURIComponent(profileAt[1] as string));
    }
    if (pathname === "/api/media") return media(get, req, url);
    const zipAt = /^\/api\/zip\/([^/]+)$/.exec(pathname);
    if (zipAt) return archive(deps, file, decodeURIComponent(zipAt[1] as string), url);
    return json({ error: "no such endpoint" }, 404);
  };
}

function failure(e: unknown): Response {
  if (e instanceof InstagramError) {
    console.error(`instagram ${e.kind}: ${e.message}`);
    return json({ error: e.message }, STATUS[e.kind]);
  }
  throw e;
}

const badName = (input: string) =>
  json({ error: `${input} isn't an Instagram username: letters, numbers, . and _` }, 400);

async function profile(
  deps: Deps,
  allow: NonNullable<Deps["allow"]>,
  req: Request,
  input: string,
): Promise<Response> {
  const username = toUsername(input);
  if (username === null) return badName(input);
  if (!deps.instagram.known(username) && !allow(visitor(req), Date.now())) {
    return json(
      {
        error: `That's ${NEW_PROFILES_A_MINUTE} new profiles this minute, all Instagram allows this server for one visitor; try again in a minute`,
      },
      429,
    );
  }
  try {
    return json(await deps.instagram.snapshot(username));
  } catch (e) {
    return failure(e);
  }
}

async function media(get: Fetch, req: Request, url: URL): Promise<Response> {
  const src = cdnUrl(url.searchParams.get("src") ?? "");
  if (src === null) return json({ error: "not an Instagram CDN address" }, 400);
  const name = url.searchParams.get("name");
  if (name !== null && !SAFE_NAME.test(name)) return json({ error: "not a file name" }, 400);
  const range = req.headers.get("Range");
  let res: Response;
  try {
    res = await get(src.href, { headers: range === null ? BROWSER : { ...BROWSER, Range: range } });
  } catch {
    return json({ error: "Instagram's CDN could not be reached" }, 502);
  }
  // a CDN address carries its own expiry, and an expired one answers 403
  if (res.status === 403) {
    return json({ error: "Instagram's link to this file has expired; reload the profile" }, 410);
  }
  if (!res.ok) return json({ error: `Instagram's CDN answered ${res.status}` }, 502);
  const type = res.headers.get("Content-Type") ?? "";
  if (!/^(image|video)\//.test(type)) return json({ error: `Instagram's CDN sent ${type}` }, 502);
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Cache-Control": "private, max-age=3600",
  };
  for (const h of ["Content-Length", "Content-Range", "Accept-Ranges"]) {
    const value = res.headers.get(h);
    if (value !== null) headers[h] = value;
  }
  if (name !== null) headers["Content-Disposition"] = `attachment; filename="${name}"`;
  return respond(req.method === "HEAD" ? null : res.body, res.status, headers);
}

interface Chosen {
  media: Media;
  modified: Date;
  /** The post's folder in the zip: its date when known, then its shortcode; none for the picture. */
  folder: string | null;
}

const day = (at: number) => new Date(at).toISOString().slice(0, 10);

function files(profile: Profile): Map<string, Chosen> {
  const byId = new Map<string, Chosen>([
    [profile.picture.id, { media: profile.picture, modified: new Date(), folder: null }],
  ]);
  for (const post of profile.posts) {
    for (const m of post.media) {
      byId.set(m.id, {
        media: m,
        modified: new Date(post.takenAt ?? Date.now()),
        folder: post.takenAt === null ? post.code : `${day(post.takenAt)} ${post.code}`,
      });
    }
  }
  return byId;
}

async function archive(
  deps: Deps,
  file: (src: string) => Promise<Uint8Array>,
  input: string,
  url: URL,
): Promise<Response> {
  const username = toUsername(input);
  if (username === null) return badName(input);
  const ids = (url.searchParams.get("ids") ?? "").split(",").filter((id) => id !== "");
  if (ids.length === 0) return json({ error: "choose at least one file" }, 400);
  let byId: Map<string, Chosen>;
  try {
    // what the page could tick has loaded; a file that hasn't waits for the rest
    let profile = await deps.instagram.snapshot(username, 0);
    byId = files(profile);
    if (profile.pending > 0 && ids.some((id) => !byId.has(id))) {
      profile = await deps.instagram.profile(username);
      byId = files(profile);
    }
  } catch (e) {
    return failure(e);
  }
  const unknown = ids.filter((id) => !byId.has(id));
  if (unknown.length > 0) {
    return json({ error: `not in ${username}'s recent posts: ${unknown.join(", ")}` }, 400);
  }
  const chosen = [...new Set(ids)].map((id) => byId.get(id) as Chosen);
  return respond(zip(entries(username, chosen, file)), 200, {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${username}.zip"`,
    "Cache-Control": "no-store",
  });
}

/** In order, a few fetched ahead; any the CDN refused are named in MISSING.txt rather than failing the zip. */
async function* entries(
  username: string,
  chosen: readonly Chosen[],
  file: (src: string) => Promise<Uint8Array>,
): AsyncGenerator<Entry> {
  const started: (Promise<Uint8Array | Error> | undefined)[] = [];
  const start = (i: number) => {
    const c = chosen[i];
    if (c !== undefined && started[i] === undefined) {
      started[i] = file(c.media.src).catch((e: unknown) =>
        e instanceof Error ? e : new Error(String(e)),
      );
    }
  };
  const missing: string[] = [];
  for (const [i, c] of chosen.entries()) {
    for (let k = i; k < i + ZIP_AHEAD; k++) start(k);
    const data = await started[i];
    started[i] = undefined;
    const name = `${c.folder === null ? "" : `${c.folder}/`}${fileName(username, c.media)}`;
    if (data instanceof Uint8Array) yield { name, data, modified: c.modified };
    else missing.push(`${name}: ${data?.message}`);
  }
  if (missing.length > 0) {
    const text = `Instagram didn't send these:\n${missing.join("\n")}\n`;
    yield { name: "MISSING.txt", data: new TextEncoder().encode(text), modified: new Date() };
  }
}
