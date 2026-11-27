// Threads' public profile page, read only for the profile picture at 640 px (Instagram's embed has 150); never throws.

import * as v from "valibot";
import type { Media } from "../shared/types.ts";
import { cdnUrl, paced } from "./instagram.ts";

type Fetch = (url: string, init: RequestInit) => Promise<Response>;
type Sleep = (ms: number) => Promise<void>;

const BASE = "https://www.threads.com";
const GAP = 1000;
// a profile's first answer waits for this, so a Threads that hangs costs at most this long
const TIMEOUT = 5000;
const KEY = '"hd_profile_pic_versions":';

// the same typed-in navigation grab sends Instagram
const NAVIGATION = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

const Version = v.object({
  width: v.number(),
  height: v.number(),
  url: v.pipe(
    v.string(),
    v.check((url) => cdnUrl(url) !== null, "not on Instagram's CDN"),
  ),
});
const User = v.looseObject({
  username: v.string(),
  hd_profile_pic_versions: v.pipe(v.array(Version), v.minLength(1)),
});

/** Every object in `value` that has `key`, depth first. */
function withKey(value: unknown, key: string, found: Record<string, unknown>[] = []) {
  if (Array.isArray(value)) for (const item of value) withKey(item, key, found);
  else if (typeof value === "object" && value !== null) {
    const o = value as Record<string, unknown>;
    if (key in o) found.push(o);
    for (const item of Object.values(o)) withKey(item, key, found);
  }
  return found;
}

/**
 * The largest picture in the user object of a Threads profile page, which sits in one of its
 * `<script type="application/json" data-sjs>` blocks; throws, naming what didn't fit, when the page changed.
 */
export function parseThreadsPicture(html: string, username: string): Media {
  const at = html.indexOf(KEY);
  if (at === -1) throw new Error("Threads' page has no hd_profile_pic_versions");
  const start = html.lastIndexOf("<script", at);
  const open = html.indexOf(">", start) + 1;
  const end = html.indexOf("</script>", at);
  let json: unknown;
  try {
    json = JSON.parse(html.slice(open, end));
  } catch {
    throw new Error("Threads' hd_profile_pic_versions isn't in a JSON script");
  }
  const user = withKey(json, KEY.slice(1, -2)).find((o) => o.username === username);
  if (user === undefined) throw new Error(`Threads' page has no picture for ${username}`);
  const r = v.safeParse(User, user);
  if (!r.success) {
    const issue = r.issues[0];
    throw new Error(
      `Threads' user has an unexpected shape at ${v.getDotPath(issue) ?? "the top"}: ${issue.message}`,
    );
  }
  const sizes = r.output.hd_profile_pic_versions.toSorted((a, b) => a.width - b.width);
  const largest = sizes.at(-1) as v.InferOutput<typeof Version>;
  // as a post's: the smallest at least 480 px wide, enough for a grid tile on a sharp screen
  const thumb = sizes.find((s) => s.width >= 480) ?? largest;
  return {
    id: "picture",
    kind: "image",
    width: largest.width,
    height: largest.height,
    src: largest.url,
    thumb: thumb.url,
    duration: null,
  };
}

export interface ThreadsOptions {
  fetch?: Fetch;
  now?: () => number;
  sleep?: Sleep;
  /** Milliseconds between the starts of two requests. */
  gap?: number;
  /** Milliseconds to wait for a page before giving up on it. */
  timeout?: number;
}

export class Threads {
  readonly #fetch: Fetch;
  readonly #pace: ReturnType<typeof paced>;
  readonly #timeout: number;

  constructor(opts: ThreadsOptions = {}) {
    this.#fetch = opts.fetch ?? ((url, init) => fetch(url, init));
    this.#pace = paced(
      opts.gap ?? GAP,
      opts.now ?? Date.now,
      opts.sleep ?? ((ms) => Bun.sleep(ms)),
    );
    this.#timeout = opts.timeout ?? TIMEOUT;
  }

  /** The profile picture at its largest, or null (logged) when Threads has none or won't say. */
  async picture(username: string): Promise<Media | null> {
    try {
      return parseThreadsPicture(await this.#pace(() => this.#get(username)), username);
    } catch (e) {
      console.error(`threads @${username}: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  async #get(username: string): Promise<string> {
    const signal = AbortSignal.timeout(this.#timeout);
    const res = await this.#fetch(`${BASE}/@${username}`, {
      headers: NAVIGATION,
      redirect: "manual",
      signal,
    });
    if (res.status >= 300 && res.status < 400) {
      throw new Error(`Threads redirected to ${res.headers.get("Location") ?? "nowhere"}`);
    }
    if (!res.ok) throw new Error(`Threads answered ${res.status}`);
    return res.text();
  }
}
