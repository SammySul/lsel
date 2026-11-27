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
      profile_pic_url: `${CDN}/v/t51.82787-19/${username}_pic.jpg?stp=dst-jpg_s150x150_tt6&oe=6930A1B2`,
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
 */
export function fakeInstagram(world: FakeWorld) {
  const state = {
    calls: [] as string[],
    fail: undefined as number | undefined,
    expired: false,
    limitAfter: undefined as number | undefined,
    refuse: 0,
  };
  const handle = (url: string, headers: Headers): Response => {
    const u = new URL(url);
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
  quiet: { fullName: "", verified: false, followers: 3, posts: [] },
  patchy: {
    fullName: "Patchy",
    verified: false,
    followers: 10,
    posts: [post("Fine1", [photo]), post("Gone2", [photo], { gone: true })],
  },
};
