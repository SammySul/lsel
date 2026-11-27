// Instagram's public pages as a logged-out browser sees them, cached: a profile for 10 minutes, a post for an hour.

import type { Post, Profile } from "../shared/types.ts";
import {
  InstagramError,
  type ProfileHead,
  parsePost,
  parseProfileEmbed,
  profileCodes,
} from "./parse.ts";

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const MINUTE = 60_000;
const PROFILE_TTL = 10 * MINUTE;
const POST_TTL = 60 * MINUTE;
// Instagram's rate limit refuses some requests (a login redirect marked is_from_rle), more of them the faster
// they come, and a refused page usually loads a few seconds later; a burst of dozens blocks every page for minutes
const GAP = 1000;
const RETRY_WAIT = 5000;
const ATTEMPTS = 3;
// long enough for a profile whose posts are cached to come back whole in one answer
const SNAPSHOT_WAIT = 1500;

export const BROWSER = {
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
  baseUrl?: string;
  fetch?: Fetch;
  now?: () => number;
  /** Milliseconds between the starts of two requests. */
  gap?: number;
  /** Milliseconds before asking again for a page the rate limit refused. */
  retryWait?: number;
}

/** Runs what it is handed one at a time, each starting at least `gap` ms after the one before. */
function paced(gap: number) {
  let queue: Promise<unknown> = Promise.resolve();
  let last = Number.NEGATIVE_INFINITY;
  return <T>(run: () => Promise<T>): Promise<T> => {
    const next = queue.then(async () => {
      const wait = last + gap - Date.now();
      if (wait > 0) await Bun.sleep(wait);
      last = Date.now();
      return run();
    });
    queue = next.catch(() => undefined);
    return next;
  };
}

/** What a profile's load has so far; it grows as the posts come in. */
interface Progress {
  head?: ProfileHead;
  codes: string[];
  posts: Post[];
  tried: number;
  limited: boolean;
}

interface Load {
  progress: Progress;
  /** Settles once the profile and its post list are in. */
  ready: Promise<void>;
  finished: Promise<Profile>;
}

/** The profile from what has loaded; `done` counts every post not loaded as missing, not pending. */
function assemble(load: Progress, done = false): Profile {
  const head = load.head;
  if (head === undefined) throw new Error("assemble before the profile was read");
  const dates = new Map(head.recent.map((r) => [r.code, r.takenAt]));
  const tried = done ? load.codes.length : load.tried;
  return {
    username: head.username,
    fullName: head.fullName,
    verified: head.verified,
    followers: head.followers,
    postCount: head.postCount,
    picture: head.picture,
    posts: load.posts.map((p) => ({ ...p, takenAt: p.takenAt ?? dates.get(p.code) ?? null })),
    missing: tried - load.posts.length,
    pending: load.codes.length - tried,
    limited: load.limited,
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
}

export class Instagram {
  readonly #base: string;
  readonly #fetch: Fetch;
  readonly #profiles: Cache<Profile>;
  readonly #posts: Cache<Post>;
  readonly #inflight = new Map<string, Promise<unknown>>();
  readonly #loads = new Map<string, Load>();
  readonly #pace: ReturnType<typeof paced>;
  readonly #retryWait: number;

  constructor(opts: InstagramOptions = {}) {
    this.#base = opts.baseUrl ?? "https://www.instagram.com";
    this.#fetch = opts.fetch ?? ((url, init) => fetch(url, init));
    const now = opts.now ?? Date.now;
    this.#profiles = new Cache(PROFILE_TTL, now);
    this.#posts = new Cache(POST_TTL, now);
    this.#pace = paced(opts.gap ?? GAP);
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
    await load.ready;
    const done = await Promise.race([
      load.finished.then(() => true),
      Bun.sleep(wait).then(() => false),
    ]);
    return done ? load.finished : assemble(load.progress);
  }

  #load(username: string): Load {
    const running = this.#loads.get(username);
    if (running !== undefined) return running;
    const ready = Promise.withResolvers<void>();
    const load: Progress = { codes: [], posts: [], tried: 0, limited: false };
    const finished = (async () => {
      try {
        const head = await this.#head(username);
        load.codes = await this.#codes(head);
        load.head = head;
        ready.resolve();
        for (const code of load.codes) {
          try {
            load.posts.push(await this.post(code));
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
        const profile = assemble(load, true);
        // a cut-short profile isn't kept, so a retry asks only for the posts it lacks
        if (!load.limited) this.#profiles.set(username, profile);
        return profile;
      } catch (e) {
        ready.reject(e);
        throw e;
      } finally {
        this.#loads.delete(username);
      }
    })();
    // whoever reads only one of the two still sees the failure; the other mustn't go unhandled
    ready.promise.catch(() => undefined);
    finished.catch(() => undefined);
    const entry = { progress: load, ready: ready.promise, finished };
    this.#loads.set(username, entry);
    return entry;
  }

  async #head(username: string): Promise<ProfileHead> {
    const embed = await this.#page(`/${username}/embed/`).catch((e: unknown) => {
      if (e instanceof InstagramError && e.kind === "not-found") {
        throw new InstagramError("not-found", `Instagram has no public profile called ${username}`);
      }
      throw e;
    });
    return parseProfileEmbed(embed, username);
  }

  post(code: string): Promise<Post> {
    const hit = this.#posts.get(code);
    if (hit !== undefined) return Promise.resolve(hit);
    return this.#once(`post:${code}`, async () => {
      const html = await this.#page(`/p/${code}/embed/captioned/`);
      const post = parsePost(html, code);
      this.#posts.set(code, post);
      return post;
    });
  }

  /** The profile page lists twelve; if it shows none, the embed's six. */
  async #codes(head: ProfileHead): Promise<string[]> {
    if (head.postCount === 0) return [];
    const embedded = head.recent.map((r) => r.code);
    try {
      const listed = profileCodes(await this.#page(`/${head.username}/`), head.username);
      return listed.length > 0 ? listed : embedded;
    } catch (e) {
      if (e instanceof InstagramError && embedded.length > 0) return embedded;
      throw e;
    }
  }

  #once<T>(key: string, run: () => Promise<T>): Promise<T> {
    const running = this.#inflight.get(key);
    if (running !== undefined) return running as Promise<T>;
    const p = run().finally(() => this.#inflight.delete(key));
    this.#inflight.set(key, p);
    return p;
  }

  /** A page, asked for again after a pause when the rate limit refuses it. */
  async #page(path: string): Promise<string> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.#get(path);
      } catch (e) {
        if (!(e instanceof InstagramError && e.kind === "login") || attempt === ATTEMPTS) throw e;
        await Bun.sleep(this.#retryWait);
      }
    }
  }

  async #get(path: string): Promise<string> {
    let res: Response;
    try {
      res = await this.#pace(() =>
        this.#fetch(`${this.#base}${path}`, { headers: NAVIGATION, redirect: "manual" }),
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
