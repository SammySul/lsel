// Every file of a profile in the order the grid shows them (the picture, then each post's), and the words for each.

import { duration } from "@sammysul/lsel";
import type { Media, Post, Profile } from "../../shared/types.ts";

export interface Entry {
  media: Media;
  /** Null for the profile picture. */
  post: Post | null;
  /** 1-based place in its post, and how many the post has. */
  index: number;
  of: number;
}

export function entries(profile: Profile): Entry[] {
  return [
    { media: profile.picture, post: null, index: 1, of: 1 },
    ...profile.posts.flatMap((post) =>
      post.media.map((media, i) => ({ media, post, index: i + 1, of: post.media.length })),
    ),
  ];
}

export const kindLabel = (entry: Entry): string =>
  entry.post === null ? "Profile picture" : entry.media.kind === "video" ? "Video" : "Photo";

/** A video's length as `m:ss`; null for a photo or a video Instagram gave none for. */
export const runtime = (media: Media): string | null =>
  media.duration === null ? null : duration(media.duration * 1000, "m:ss");

/** The corner of a tile: `Video 0:42 · 3/3`; null for a single photo. */
export function badge(entry: Entry): string | null {
  const parts: string[] = [];
  if (entry.media.kind === "video") {
    const length = runtime(entry.media);
    parts.push(length === null ? "Video" : `Video ${length}`);
  }
  if (entry.of > 1) parts.push(`${entry.index}/${entry.of}`);
  return parts.length === 0 ? null : parts.join(" · ");
}

/** What a screen reader hears for a tile. */
export function describe(entry: Entry): string {
  const what = kindLabel(entry);
  if (entry.post === null) return what;
  return entry.of > 1
    ? `${what} ${entry.index} of ${entry.of} in post ${entry.post.code}`
    : `${what}, post ${entry.post.code}`;
}
