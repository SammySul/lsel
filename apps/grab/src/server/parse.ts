// Reads Instagram's public pages: the profile page's post list and the JSON inside its embeds.

import * as v from "valibot";
import type { Media, Post } from "../shared/types.ts";

export type Failure = "not-found" | "rate-limited" | "login" | "unavailable" | "unexpected";

export class InstagramError extends Error {
  constructor(
    readonly kind: Failure,
    message: string,
  ) {
    super(message);
    this.name = "InstagramError";
  }
}

/** The JSON an embed page hands its initializer, as a string inside a script: `"contextJSON":"{\"context\":…}"`. */
export function contextJson(html: string): unknown {
  const key = '"contextJSON":"';
  const at = html.indexOf(key);
  if (at === -1) return undefined;
  let end = at + key.length;
  while (end < html.length && html[end] !== '"') end += html[end] === "\\" ? 2 : 1;
  try {
    return JSON.parse(JSON.parse(html.slice(at + key.length - 1, end + 1)));
  } catch {
    return undefined;
  }
}

/** The shortcodes of the posts and reels a profile page links to, in its grid's order (pinned first). */
export function profileCodes(html: string, username: string): string[] {
  const user = username.replaceAll(".", "\\.");
  const link = new RegExp(`href="/${user}/(?:p|reel)/([A-Za-z0-9_-]+)/"`, "gi");
  return [...new Set([...html.matchAll(link)].map((m) => m[1] as string))];
}

const Dimensions = v.object({ width: v.number(), height: v.number() });
const Resource = v.looseObject({ src: v.string(), config_width: v.number() });
const Item = {
  is_video: v.boolean(),
  display_url: v.string(),
  display_resources: v.optional(v.array(Resource), []),
  dimensions: Dimensions,
  video_url: v.optional(v.string()),
  video_duration: v.optional(v.number()),
};
const PostEmbed = v.looseObject({
  gql_data: v.looseObject({
    shortcode_media: v.looseObject({
      ...Item,
      shortcode: v.string(),
      taken_at_timestamp: v.optional(v.number()),
      edge_media_to_caption: v.optional(
        v.looseObject({
          edges: v.array(v.looseObject({ node: v.looseObject({ text: v.string() }) })),
        }),
      ),
      edge_sidecar_to_children: v.optional(
        v.looseObject({ edges: v.array(v.looseObject({ node: v.looseObject(Item) })) }),
      ),
    }),
  }),
});
const ProfileEmbed = v.looseObject({
  context: v.looseObject({
    username: v.string(),
    full_name: v.optional(v.string(), ""),
    is_verified: v.optional(v.boolean(), false),
    profile_pic_url: v.string(),
    followers_count: v.number(),
    posts_count: v.number(),
    graphql_media: v.optional(
      v.array(
        v.looseObject({
          shortcode_media: v.looseObject({
            shortcode: v.string(),
            taken_at_timestamp: v.optional(v.number()),
          }),
        }),
      ),
      [],
    ),
  }),
});

/** A changed page is Instagram's change, reported with the first field that broke. */
function parse<S extends v.GenericSchema>(schema: S, value: unknown, what: string) {
  const r = v.safeParse(schema, value);
  if (r.success) return r.output as v.InferOutput<S>;
  const issue = r.issues[0];
  throw new InstagramError(
    "unexpected",
    `Instagram's ${what} has an unexpected shape at ${v.getDotPath(issue) ?? "the top"}: ${issue.message}`,
  );
}

/** The smallest version at least 480 px wide, enough for a grid tile on a sharp screen. */
function thumbOf(item: v.InferOutput<v.ObjectSchema<typeof Item, undefined>>): string {
  const fits = item.display_resources
    .filter((r) => r.config_width >= 480)
    .toSorted((a, b) => a.config_width - b.config_width);
  return fits[0]?.src ?? item.display_url;
}

function mediaOf(
  code: string,
  n: number,
  item: v.InferOutput<v.ObjectSchema<typeof Item, undefined>>,
): Media {
  const thumb = thumbOf(item);
  const base = { id: `${code}.${n}`, ...item.dimensions, thumb };
  // a video the embed won't play (copyright) is left with its cover
  return item.is_video && item.video_url !== undefined
    ? { ...base, kind: "video", src: item.video_url, duration: item.video_duration ?? null }
    : { ...base, kind: "image", src: item.display_url, duration: null };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name.startsWith("#x") || name.startsWith("#X"))
      return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    if (name.startsWith("#")) return String.fromCodePoint(Number(name.slice(1)));
    return ENTITIES[name] ?? whole;
  });
}

/**
 * A single photo's embed is plain HTML (its contextJSON is null): the image's srcset, uncropped
 * sizes first, then square crops whose offsets give the height; no crop means a square photo.
 */
function parsePhotoEmbed(html: string, code: string): Post | null {
  const img = /<img class="EmbeddedMediaImage"[^>]*\ssrcset="([^"]*)"/.exec(html);
  if (img === null) return null;
  const sizes = [...decode(img[1] as string).matchAll(/(https:\/\/\S+)\s+(\d+)w/g)].map((m) => ({
    src: m[1] as string,
    width: Number(m[2]),
    crop: /[?&]stp=c(\d+)\.(\d+)\.(\d+)\.(\d+)a_/.exec(m[1] as string),
  }));
  const whole = sizes.filter((s) => s.crop === null).toSorted((a, b) => b.width - a.width);
  const full = whole[0];
  if (full === undefined) return null;
  const thumb = whole.filter((s) => s.width >= 480).at(-1) ?? full;
  const crop = sizes.find((s) => s.crop !== null)?.crop;
  const [x, y, w, h] = [1, 2, 3, 4].map((i) => Number(crop?.[i] ?? (i > 2 ? 1 : 0))) as [
    number,
    number,
    number,
    number,
  ];
  const height = Math.round((full.width * (h + 2 * y)) / (w + 2 * x));
  const caption =
    /<div class="Caption">([\s\S]*?)<div class="CaptionComments">/.exec(html)?.[1] ?? "";
  return {
    code,
    kind: "image",
    takenAt: null,
    caption: decode(
      caption
        .replace(/<a class="CaptionUsername"[\s\S]*?<\/a>/, "")
        .replace(/<br\s*\/?>/g, "\n")
        .replace(/<[^>]+>/g, ""),
    ).trim(),
    media: [
      {
        id: `${code}.1`,
        kind: "image",
        width: full.width,
        height,
        src: full.src,
        thumb: thumb.src,
        duration: null,
      },
    ],
  };
}

export function parsePost(html: string, code: string): Post {
  const json = contextJson(html);
  if (json === undefined) {
    const photo = parsePhotoEmbed(html, code);
    if (photo !== null) return photo;
    throw new InstagramError("not-found", `Instagram has no embed for ${code}`);
  }
  const node = parse(PostEmbed, json, "post embed").gql_data.shortcode_media;
  const children = node.edge_sidecar_to_children?.edges.map((e) => e.node) ?? [];
  const items = children.length > 0 ? children : [node];
  return {
    code: node.shortcode,
    kind: children.length > 0 ? "carousel" : node.is_video ? "video" : "image",
    takenAt: node.taken_at_timestamp === undefined ? null : node.taken_at_timestamp * 1000,
    caption: node.edge_media_to_caption?.edges[0]?.node.text ?? "",
    media: items.map((item, i) => mediaOf(node.shortcode, i + 1, item)),
  };
}

export interface ProfileHead {
  username: string;
  fullName: string;
  verified: boolean;
  followers: number;
  postCount: number;
  picture: Media;
  /** The newest six, with when they were posted. */
  recent: { code: string; takenAt: number | null }[];
}

export function parseProfileEmbed(html: string, username: string): ProfileHead {
  const json = contextJson(html);
  if (json === undefined) {
    throw new InstagramError("not-found", `Instagram has no public profile called ${username}`);
  }
  const c = parse(ProfileEmbed, json, "profile embed").context;
  const size = Number(/s(\d+)x\d+/.exec(c.profile_pic_url)?.[1] ?? 150);
  return {
    username: c.username,
    fullName: c.full_name,
    verified: c.is_verified,
    followers: c.followers_count,
    postCount: c.posts_count,
    picture: {
      id: "picture",
      kind: "image",
      width: size,
      height: size,
      src: c.profile_pic_url,
      thumb: c.profile_pic_url,
      duration: null,
    },
    recent: c.graphql_media.map(({ shortcode_media: m }) => ({
      code: m.shortcode,
      takenAt: m.taken_at_timestamp === undefined ? null : m.taken_at_timestamp * 1000,
    })),
  };
}
