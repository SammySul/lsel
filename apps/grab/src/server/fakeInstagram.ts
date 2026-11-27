// A stand-in for Instagram's public pages and CDN, in the shapes seen on Nov 27, 2026, for tests.

export interface FakeItem {
  video?: boolean;
  width: number;
  height: number;
}

export interface FakePost {
  code: string;
  caption: string;
  items: FakeItem[];
  /** Unix seconds; the post embed never has it, the profile embed has it for the newest six. */
  takenAt?: number;
  /** Its embed answers 404. */
  gone?: boolean;
}

export interface FakeProfile {
  fullName: string;
  verified: boolean;
  followers: number;
  posts: FakePost[];
  /** Has a Threads profile, whose page gives the picture at 320 and 640 px; without, Threads answers 404. */
  threads?: boolean;
}

export type FakeWorld = Record<string, FakeProfile>;

const CDN = "https://scontent-fra5-1.cdninstagram.com";
// a 1×1 PNG, then the file's name, so each file's bytes differ and a browser still draws it
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

export const fileBytes = (path: string): Uint8Array<ArrayBuffer> =>
  path.endsWith(".mp4")
    ? new TextEncoder().encode(`fake mp4 ${path}`)
    : new Uint8Array([...PIXEL, ...new TextEncoder().encode(path)]);

export const cdn = (path: string) => `${CDN}/v/t51.82787-15/${path}?stp=dst-jpg&oe=6930A1B2`;

function node(code: string, n: number, item: FakeItem) {
  const base = `${code}_${n}`;
  return {
    is_video: item.video === true,
    dimensions: { width: item.width, height: item.height },
    display_url: cdn(`${base}.jpg`),
    display_resources: [item.width, 640, 480, 320].map((w) => ({
      src: cdn(`${base}_${w}.jpg`),
      config_width: w,
      config_height: Math.round((w * item.height) / item.width),
    })),
    ...(item.video ? { video_url: cdn(`${base}.mp4`), video_duration: 42.5 } : {}),
  };
}

/** An embed page whose script hands its initializer `literal`, a JS string literal of the context's JSON. */
export const embedShell = (isProfileEmbed: boolean, literal: string): string =>
  `<!DOCTYPE html><html><head><title>Instagram</title></head><body><script>requireLazy(["ServerJS"],function(ServerJS){(new ServerJS()).handle({"require":[["PolarisEmbedSimple","init",[],[{"isRichEmbed":${!isProfileEmbed},"isProfileEmbed":${isProfileEmbed},"contextJSON":${literal}}]],["NavigationMetrics","setPage",[],[{"page":"XPolarisEmbedController"}]]]});});</script></body></html>`;

/** An embed page for `context`, slashes escaped as Instagram does. */
export const embedPage = (isProfileEmbed: boolean, context: unknown): string =>
  embedShell(isProfileEmbed, JSON.stringify(JSON.stringify(context)).replaceAll("/", "\\/"));

const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\n", "<br />");

/** A single photo's embed: no JSON, just its srcset (whole sizes, then square crops) and the caption. */
function photoEmbed(post: FakePost, item: FakeItem): string {
  const base = `${post.code}_1`;
  const whole = [item.width, 720, 640, 480, 320].map(
    (w) => `${cdn(w === item.width ? `${base}.jpg` : `${base}_${w}.jpg`)} ${w}w`,
  );
  const side = Math.min(item.width, item.height);
  const [x, y] = [(item.width - side) / 2, (item.height - side) / 2];
  const crops =
    x === 0 && y === 0
      ? []
      : [1080, 480, 150].map(
          (w) =>
            `${CDN}/v/t51.82787-15/${base}_sq${w}.jpg?stp=c${x}.${y}.${side}.${side}a_dst-jpg_s${w}x${w}&oe=6930A1B2 ${w}w`,
        );
  const srcset = [...whole, ...crops].join(",").replaceAll("&", "&amp;");
  return `<!DOCTYPE html><html><body><script>requireLazy(["ServerJS"],function(ServerJS){(new ServerJS()).handle({"require":[["PolarisEmbedSimple","init",[],[{"isRichEmbed":false,"isSidecar":false,"isProfileEmbed":false,"contextJSON":null}]]]});});</script><div class="EmbeddedMedia"><img class="EmbeddedMediaImage" alt="Instagram post shared by &#064;owner" src="${cdn(`${base}.jpg`).replaceAll("&", "&amp;")}" srcset="${srcset}" /></div><div class="Caption"><a class="CaptionUsername" href="https://www.instagram.com/owner/" target="_blank">owner</a><br /><br />${escapeHtml(post.caption)}<div class="CaptionComments"></div></div></body></html>`;
}

function postEmbed(post: FakePost): string {
  const [first] = post.items;
  if (first === undefined) throw new Error(`fake post ${post.code} has no items`);
  const sidecar = post.items.length > 1;
  if (!sidecar && !first.video) return photoEmbed(post, first);
  return embedPage(false, {
    context: { type: "GraphImage", shortcode: post.code, copyright_blocked: false },
    gql_data: {
      shortcode_media: {
        __typename: sidecar ? "GraphSidecar" : first.video ? "GraphVideo" : "GraphImage",
        id: `id-${post.code}`,
        shortcode: post.code,
        ...node(post.code, 1, first),
        edge_media_to_caption: { edges: post.caption ? [{ node: { text: post.caption } }] : [] },
        owner: { id: "1", username: "owner", profile_pic_url: cdn("pic.jpg") },
        ...(sidecar
          ? {
              edge_sidecar_to_children: {
                edges: post.items.map((item, i) => ({ node: node(post.code, i + 1, item) })),
              },
            }
          : {}),
      },
    },
  });
}

function profileEmbed(username: string, p: FakeProfile): string {
  return embedPage(true, {
    context: {
      username,
      full_name: p.fullName,
      verified: p.verified,
      is_verified: p.verified,
      profile_pic_url: picture(username, 150),
      followers_count: p.followers,
      posts_count: p.posts.length * 100,
      has_public_story: true,
      graphql_media: p.posts.slice(0, 6).map((post) => ({
        shortcode_media: {
          __typename: "GraphImage",
          shortcode: post.code,
          ...(post.takenAt === undefined ? {} : { taken_at_timestamp: post.takenAt }),
          ...node(post.code, 1, post.items[0] as FakeItem),
        },
      })),
      type: "Profile",
    },
  });
}

function profilePage(username: string, p: FakeProfile): string {
  const links = p.posts.map(
    (post) =>
      `<a class="x1i10hfl" href="/${username}/${post.items[0]?.video ? "reel" : "p"}/${post.code}/" role="link" tabindex="0"><img src="${cdn(`${post.code}_1_640.jpg`)}"></a>`,
  );
  // a suggested account's post, which isn't this profile's
  const other = `<a href="/someoneelse/p/NOTOURS123/" role="link">`;
  return `<!DOCTYPE html><html><head><title>${p.fullName} (&#064;${username})</title></head><body><img alt="${username}&#x27;s profile picture">${links.join("")}${other}</body></html>`;
}

export const picture = (username: string, size: number | null) =>
  `${CDN}/v/t51.82787-19/${username}_pic.jpg?${size === null ? "" : `stp=dst-jpg_s${size}x${size}_tt6&`}oe=6930A1B2`;

/**
 * A Threads profile page: the user object in a Relay preload inside one of many JSON scripts,
 * slashes escaped, its picture at each of `sizes` (in Threads' order) and its largest without a size.
 */
export function threadsPage(username: string, p: FakeProfile, sizes = [320, 640]): string {
  const largest = Math.max(...sizes);
  const user = {
    profile_pic_url: picture(username, 150),
    friendship_status: null,
    has_onboarded_to_text_post_app: true,
    pk: "63269174602",
    text_post_app_is_private: false,
    username,
    follower_count: Math.round(p.followers / 15),
    profile_context_facepile_users: [
      { profile_pic_url: picture("someoneelse", 150), username: "someoneelse", is_verified: false },
    ],
    hd_profile_pic_versions: sizes.map((size) => ({
      height: size,
      url: picture(username, size === largest ? null : size),
      width: size,
    })),
    is_verified: p.verified,
    biography: "",
    full_name: p.fullName,
    id: "63269174602",
  };
  const preload = {
    require: [
      [
        "ScheduledServerJS",
        "handle",
        null,
        [
          {
            __bbox: {
              require: [
                [
                  "RelayPrefetchedStreamCache",
                  "next",
                  [],
                  [
                    "adp_BarcelonaProfilePageDirectQueryRelayPreloader_6b09dd303de4a2d02755324",
                    {
                      __bbox: {
                        complete: true,
                        result: { data: { user }, extensions: { is_final: true } },
                        sequence_number: 0,
                      },
                    },
                  ],
                ],
                ["CometResourceScheduler", "registerHighPriHashes", null, [["g+CzcU6"]]],
              ],
            },
          },
        ],
      ],
    ],
  };
  const script = (data: unknown) => {
    const text = JSON.stringify(data).replaceAll("/", "\\/");
    return `<script type="application/json" nonce="swa12XXi"  data-content-len="${text.length}" data-sjs>${text}</script>`;
  };
  const other = script({
    require: [["ServerJSPayloadListener", "process", null, [{ r: ["or/9fVC"] }]]],
  });
  return `<!DOCTYPE html><html lang="en"><head><title>${p.fullName} (@${username}) • Threads, Say more</title></head><body>${other}${script(preload)}</body></html>`;
}

const html = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", ...headers },
  });

const NOT_FOUND =
  "<!DOCTYPE html><html><head><title>Page Not Found &bull; Instagram</title></head></html>";

/**
 * `calls` lists every path asked for; `fail` forces a status, `expired` the CDN's 403,
 * `limitAfter` lets that many more post embeds through and then redirects as Instagram's rate limit does;
 * `refuse` redirects the next that many requests for a page (Infinity: every one).
 * Threads is apart: `threadsCalls` lists its pages asked for, `threads` forces their status.
 */
export function fakeInstagram(world: FakeWorld) {
  const state = {
    calls: [] as string[],
    fail: undefined as number | undefined,
    expired: false,
    limitAfter: undefined as number | undefined,
    refuse: 0,
    threadsCalls: [] as string[],
    threads: undefined as number | undefined,
  };
  const handle = (url: string, headers: Headers): Response => {
    const u = new URL(url);
    if (u.hostname === "www.threads.com") return threads(u);
    state.calls.push(u.hostname.endsWith("cdninstagram.com") ? `cdn${u.pathname}` : u.pathname);
    if (state.fail !== undefined) return html(NOT_FOUND, state.fail);
    if (u.hostname.endsWith("cdninstagram.com")) {
      if (state.expired) return new Response("URL signature expired", { status: 403 });
      const bytes = fileBytes(u.pathname);
      const type = u.pathname.endsWith(".mp4") ? "video/mp4" : "image/jpeg";
      const range = /^bytes=(\d+)-(\d*)$/.exec(headers.get("Range") ?? "");
      if (range === null) {
        return new Response(bytes, { headers: { "Content-Type": type, "Accept-Ranges": "bytes" } });
      }
      const from = Number(range[1]);
      const to = range[2] === "" ? bytes.length - 1 : Math.min(Number(range[2]), bytes.length - 1);
      return new Response(bytes.slice(from, to + 1), {
        status: 206,
        headers: { "Content-Type": type, "Content-Range": `bytes ${from}-${to}/${bytes.length}` },
      });
    }
    const login = { Location: "https://www.instagram.com/accounts/login/" };
    if (state.refuse > 0) {
      state.refuse--;
      return html("", 302, { Location: `${login.Location}?is_from_rle` });
    }
    const post = /^\/p\/([A-Za-z0-9_-]+)\/embed\/captioned\/$/.exec(u.pathname);
    if (post) {
      if (state.limitAfter !== undefined && state.limitAfter-- <= 0) {
        const next = encodeURIComponent(u.href);
        return html("", 302, {
          Location: `https://www.instagram.com/accounts/login/?next=${next}&is_from_rle`,
        });
      }
      const found = Object.values(world)
        .flatMap((p) => p.posts)
        .find((p) => p.code === post[1]);
      return found === undefined || found.gone ? html(NOT_FOUND, 404) : html(postEmbed(found));
    }
    const embed = /^\/([a-z0-9._]+)\/embed\/$/.exec(u.pathname);
    if (embed) {
      const p = world[embed[1] as string];
      return p === undefined ? html(NOT_FOUND, 404) : html(profileEmbed(embed[1] as string, p));
    }
    const page = /^\/([a-z0-9._]+)\/$/.exec(u.pathname);
    if (page) {
      if (headers.get("Sec-Fetch-Mode") !== "navigate") return html("", 302, login);
      const p = world[page[1] as string];
      return p === undefined ? html(NOT_FOUND, 404) : html(profilePage(page[1] as string, p));
    }
    return html(NOT_FOUND, 404);
  };
  const threads = (u: URL): Response => {
    state.threadsCalls.push(u.pathname);
    if (state.threads === 302) {
      return html("", 302, { Location: "https://www.threads.com/login/?show_choice_screen=false" });
    }
    if (state.threads !== undefined) return html("", state.threads);
    const name = /^\/@([a-z0-9._]+)$/.exec(u.pathname)?.[1] ?? "";
    const p = world[name];
    return p?.threads ? html(threadsPage(name, p)) : html(NOT_FOUND, 404);
  };
  return {
    state,
    fetch: async (url: string, init: RequestInit) => handle(url, new Headers(init.headers)),
  };
}

const post = (code: string, items: FakeItem[], extra: Partial<FakePost> = {}): FakePost => ({
  code,
  caption: `Caption of ${code}`,
  items,
  ...extra,
});
const photo = { width: 1080, height: 1350 };
const reel = { video: true, width: 1080, height: 1920 };

// Nov 26, 2026, 3:00 PM UTC; each older post a day before
const DAY = 86_400;
const T = 1_795_705_200;

export const WORLD: FakeWorld = {
  "nat.geo": {
    fullName: "National Geo",
    verified: true,
    followers: 267_196_027,
    threads: true,
    posts: [
      post("Pin_ned-1", [photo], { takenAt: T - 40 * DAY }),
      post("Car-ousel2", [photo, { width: 2048, height: 2560 }, reel], { takenAt: T }),
      post("Reel_3", [reel], { takenAt: T - DAY }),
      post("Photo4", [photo], { takenAt: T - 2 * DAY, caption: "Ducks & geese\nat <dawn>" }),
      post("Photo5", [photo], { takenAt: T - 3 * DAY }),
      post("Photo6", [photo], { takenAt: T - 4 * DAY }),
      post("Photo7", [{ width: 1080, height: 1080 }]),
      post("Photo8", [{ width: 1440, height: 1080 }]),
    ],
  },
  quiet: { fullName: "", verified: false, followers: 3, posts: [], threads: true },
  patchy: {
    fullName: "Patchy",
    verified: false,
    followers: 10,
    posts: [post("Fine1", [photo]), post("Gone2", [photo], { gone: true })],
  },
};
