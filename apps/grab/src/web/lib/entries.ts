// Every file of a profile in the order the grid shows them: the picture, then each post's.

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

/** What a screen reader hears for a tile. */
export function describe(entry: Entry): string {
  if (entry.post === null) return "Profile picture";
  const what = entry.media.kind === "video" ? "Video" : "Photo";
  return entry.of > 1
    ? `${what} ${entry.index} of ${entry.of} in post ${entry.post.code}`
    : `${what}, post ${entry.post.code}`;
}
