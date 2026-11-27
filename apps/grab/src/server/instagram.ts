// Instagram's public pages and CDN as a logged-out browser sees them, cached: a profile for 6 hours, a post for an hour.

import type { Profile } from "../shared/types.ts";
import {
  type EmbeddedPost,
  InstagramError,
  noProfile,
  type ProfileHead,
  parsePost,
  parseProfileEmbed,
  profileCodes,
} from "./parse.ts";

type Fetch = (url: string, init: RequestInit) => Promise<Response>;
type Sleep = (ms: number) => Promise<void>;

const BASE = "https://www.instagram.com";
const MINUTE = 60_000;
// a profile changes slowly and each load spends the shared budget; R on the page asks again sooner
const PROFILE_TTL = 6 * 60 * MINUTE;
const POST_TTL = 60 * MINUTE;
// Instagram's rate limit refuses some requests (a login redirect marked is_from_rle), more of them the faster
// they come, and a refused page usually loads a few seconds later; a burst of dozens blocks every page for minutes
const GAP = 1000;
const RETRY_WAIT = 5000;
const ATTEMPTS = 3;
// long enough for a profile whose posts are cached to come back whole in one answer
const SNAPSHOT_WAIT = 1500;
const PAGE_LISTS = 12;

const BROWSER = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

// without the Sec-Fetch-* of a typed-in address, the profile page redirects to the login
const NAVIGATION = {
  ...BROWSER,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

export interface InstagramOptions {
  fetch?: Fetch;
  now?: () => number;
  sleep?: Sleep;
  /** Milliseconds between the starts of two requests. */
  gap?: number;
  /** Milliseconds before asking again for a page the rate limit refused. */
  retryWait?: number;
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

/** Runs what it is handed one at a time, each starting at least `gap` ms after the one before. */
function paced(gap: number, now: () => number, sleep: Sleep) {
  let queue: Promise<unknown> = Promise.resolve();
  let last = Number.NEGATIVE_INFINITY;
  return <T>(run: () => Promise<T>): Promise<T> => {
    const next = queue.then(async () => {
      const wait = last + gap - now();
      if (wait > 0) await sleep(wait);
      last = now();
      return run();
    });
    queue = next.catch(() => undefined);
    return next;
  };
}

/** The profile and the posts to ask for; `unlisted` counts those the refused profile page would have added. */
interface Listing {
  head: ProfileHead;
  codes: string[];
  unlisted: number;
}

/** One profile's loading; it grows as the posts come in. */
interface Load {
  list: Promise<Listing>;
  posts: EmbeddedPost[];
  tried: number;
  limited: boolean;
  finished: Promise<Profile>;
}

/** The profile from what has loaded; `done` counts every post not loaded as missing, not pending. */
function assemble({ head, codes, unlisted }: Listing, load: Load, done = false): Profile {
  const { recent, ...who } = head;
  const dates = new Map(recent.map((r) => [r.code, r.takenAt]));
  const tried = done ? codes.length : load.tried;
  return {
    ...who,
    posts: load.posts.map((p) => ({ ...p, takenAt: dates.get(p.code) ?? null })),
    missing: tried - load.posts.length + unlisted,
    pending: codes.length - tried,
    limited: load.limited || unlisted > 0,
  };
}

class Cache<T> {
  readonly #entries = new Map<string, { at: number; value: T }>();
  constructor(
    readonly ttl: number,
    readonly now: () => number,
  ) {}
  get(key: string): T | undefined {
    const hit = this.#entries.get(key);
    return hit !== undefined && this.now() - hit.at < this.ttl ? hit.value : undefined;
  }
  set(key: string, value: T): void {
    for (const [k, e] of this.#entries) if (this.now() - e.at >= this.ttl) this.#entries.delete(k);
    this.#entries.set(key, { at: this.now(), value });
  }
  delete(key: string): void {
    this.#entries.delete(key);
  }
}

export class Instagram {
  readonly #fetch: Fetch;
  readonly #sleep: Sleep;
  readonly #profiles: Cache<Profile>;
  readonly #posts: Cache<EmbeddedPost>;
  readonly #posting = new Map<string, Promise<EmbeddedPost>>();
  readonly #loads = new Map<string, Load>();
  readonly #pace: ReturnType<typeof paced>;
  readonly #retryWait: number;

  constructor(opts: InstagramOptions = {}) {
    this.#fetch = opts.fetch ?? ((url, init) => fetch(url, init));
    this.#sleep = opts.sleep ?? ((ms) => Bun.sleep(ms));
    const now = opts.now ?? Date.now;
    this.#profiles = new Cache(PROFILE_TTL, now);
    this.#posts = new Cache(POST_TTL, now);
    this.#pace = paced(opts.gap ?? GAP, now, this.#sleep);
    this.#retryWait = opts.retryWait ?? RETRY_WAIT;
  }

  /** Cached or loading: asking for it costs Instagram nothing more. */
  known(username: string): boolean {
    return this.#profiles.get(username) !== undefined || this.#loads.has(username);
  }

  /** The profile and its newest posts (at most 12: all Instagram lists without a login), once all are in. */
  profile(username: string): Promise<Profile> {
    const hit = this.#profiles.get(username);
    return hit !== undefined ? Promise.resolve(hit) : this.#load(username).finished;
  }

  /**
   * The profile as far as it has loaded, waiting up to `wait` ms for the rest: `pending` counts the
   * posts still to come, so the page can show the first ones while Instagram is asked for the others.
   */
  async snapshot(username: string, wait = SNAPSHOT_WAIT): Promise<Profile> {
    const hit = this.#profiles.get(username);
    if (hit !== undefined) return hit;
    const load = this.#load(username);
    const listing = await load.list;
    const done = await Promise.race([
      load.finished.then(() => true),
      this.#sleep(wait).then(() => false),
    ]);
    return done ? load.finished : assemble(listing, load);
  }

  /** A cached or loading profile, never starting a load: as far as it has loaded, and whole once in. */
  peek(username: string): { now: Promise<Profile>; whole: Promise<Profile> } | undefined {
    const hit = this.#profiles.get(username);
    if (hit !== undefined) return { now: Promise.resolve(hit), whole: Promise.resolve(hit) };
    const load = this.#loads.get(username);
    if (load === undefined) return undefined;
    return { now: load.list.then((listing) => assemble(listing, load)), whole: load.finished };
  }

  /** Drops a cached profile, so the next snapshot asks Instagram again; its posts come from their own cache. */
  forget(username: string): void {
    this.#profiles.delete(username);
  }

  /** A file on Instagram's CDN, from `range` on when given; a refusal is an InstagramError. */
  async file(src: string, range?: string): Promise<Response> {
    const url = cdnUrl(src);
    if (url === null) throw new InstagramError("not-cdn", "not an Instagram CDN address");
    let res: Response;
    try {
      res = await this.#fetch(url.href, {
        headers: range === undefined ? BROWSER : { ...BROWSER, Range: range },
      });
    } catch {
      throw new InstagramError("unavailable", "Instagram's CDN could not be reached");
    }
    // a CDN address carries its own expiry, and an expired one answers 403
    if (res.status === 403) {
      throw new InstagramError(
        "expired",
        "Instagram's link to this file has expired; reload the profile",
      );
    }
    if (!res.ok) throw new InstagramError("unavailable", `Instagram's CDN answered ${res.status}`);
    const type = res.headers.get("Content-Type") ?? "";
    if (!/^(image|video)\//.test(type)) {
      throw new InstagramError("unexpected", `Instagram's CDN sent ${type}`);
    }
    return res;
  }

  #load(username: string): Load {
    const running = this.#loads.get(username);
    if (running !== undefined) return running;
    const list = this.#list(username);
    const load: Load = {
      list,
      posts: [],
      tried: 0,
      limited: false,
      finished: list.then((listing) => this.#fill(username, listing, load)),
    };
    this.#loads.set(username, load);
    const end = () => this.#loads.delete(username);
    load.finished.then(end, end);
    return load;
  }

  /** Asks for each post in turn; a cut-short profile is cached too, so a poll after it ends isn't a new load. */
  async #fill(username: string, listing: Listing, load: Load): Promise<Profile> {
    for (const code of listing.codes) {
      try {
        load.posts.push(await this.#post(code));
      } catch (e) {
        if (!(e instanceof InstagramError)) throw e;
        console.error(`instagram post ${code} ${e.kind}: ${e.message}`);
        // refused again and again: going on would only stretch the block
        if (e.kind === "login" || e.kind === "rate-limited") {
          load.limited = true;
          // nothing loaded is an outage to report, not an empty profile
          if (load.posts.length === 0) throw e;
          break;
        }
      } finally {
        load.tried++;
      }
    }
    const profile = assemble(listing, load, true);
    this.#profiles.set(username, profile);
    return profile;
  }

  /** The profile page lists twelve; if it lists none, or is refused, the embed's six stand in. */
  async #list(username: string): Promise<Listing> {
    const embed = await this.#page(`/${username}/embed/`).catch((e: unknown) => {
      throw e instanceof InstagramError && e.kind === "not-found" ? noProfile(username) : e;
    });
    const head = parseProfileEmbed(embed, username);
    if (head.postCount === 0) return { head, codes: [], unlisted: 0 };
    const embedded = head.recent.map((r) => r.code);
    let listed: string[];
    try {
      listed = profileCodes(await this.#page(`/${head.username}/`), head.username);
    } catch (e) {
      const refused =
        e instanceof InstagramError && (e.kind === "login" || e.kind === "rate-limited");
      if (!refused || embedded.length === 0) throw e;
      const unlisted = Math.max(0, Math.min(PAGE_LISTS, head.postCount) - embedded.length);
      return { head, codes: embedded, unlisted };
    }
    return { head, codes: listed.length > 0 ? listed : embedded, unlisted: 0 };
  }

  #post(code: string): Promise<EmbeddedPost> {
    const hit = this.#posts.get(code);
    if (hit !== undefined) return Promise.resolve(hit);
    const running = this.#posting.get(code);
    if (running !== undefined) return running;
    const post = this.#page(`/p/${code}/embed/captioned/`)
      .then((html) => {
        const parsed = parsePost(html, code);
        this.#posts.set(code, parsed);
        return parsed;
      })
      .finally(() => this.#posting.delete(code));
    this.#posting.set(code, post);
    return post;
  }

  /** A page, asked for again after a pause when the rate limit refuses it. */
  async #page(path: string): Promise<string> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.#get(path);
      } catch (e) {
        if (!(e instanceof InstagramError && e.kind === "login") || attempt === ATTEMPTS) throw e;
        await this.#sleep(this.#retryWait);
      }
    }
  }

  async #get(path: string): Promise<string> {
    let res: Response;
    try {
      res = await this.#pace(() =>
        this.#fetch(`${BASE}${path}`, { headers: NAVIGATION, redirect: "manual" }),
      );
    } catch (e) {
      throw new InstagramError(
        "unavailable",
        `Instagram could not be reached: ${e instanceof Error ? e.message : e}`,
      );
    }
    if (res.status === 429) {
      throw new InstagramError(
        "rate-limited",
        "Instagram is rate limiting; try again in a few minutes",
      );
    }
    if (res.status >= 300 && res.status < 400) {
      throw new InstagramError(
        "login",
        "Instagram wants a login from this server for now; try again in a few minutes",
      );
    }
    if (res.status === 404)
      throw new InstagramError("not-found", `Instagram has nothing at ${path}`);
    if (res.status >= 500)
      throw new InstagramError("unavailable", `Instagram answered ${res.status}`);
    if (!res.ok)
      throw new InstagramError("unexpected", `Instagram answered ${res.status} for ${path}`);
    return res.text();
  }
}
