// What the server sends the web app: a profile, its recent posts and every file in them.

export interface Media {
  /** `<shortcode>.<n>`, counting from 1, or `picture`. */
  id: string;
  kind: "image" | "video";
  width: number;
  height: number;
  /** Instagram's CDN address of the full file. */
  src: string;
  /** A smaller image for the grid: a video's cover. */
  thumb: string;
  /** Seconds, for a video. */
  duration: number | null;
}

export interface Post {
  code: string;
  /** Unix ms; Instagram gives it anonymously for the newest six only, in the profile embed. */
  takenAt: number | null;
  caption: string;
  media: Media[];
}

/** Who a profile is, from its embed. */
export interface Head {
  username: string;
  fullName: string;
  verified: boolean;
  followers: number;
  postCount: number;
  picture: Media;
}

export interface Profile extends Head {
  posts: Post[];
  /** Posts that didn't load: an embed that couldn't be read, or one never asked for after a rate limit. */
  missing: number;
  /** Posts still being asked for: the page asks again until none are. */
  pending: number;
  /** Instagram's rate limit stopped the loading; the missing posts may load on a retry. */
  limited: boolean;
}

export const USERNAME = /^[a-z0-9._]{1,30}$/;

/** A username from what people paste: `@NatGeo`, `instagram.com/natgeo/`; null if it can't be one. */
export function toUsername(input: string): string | null {
  const s = input
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "")
    .toLowerCase();
  return USERNAME.test(s) ? s : null;
}

/** A percent-decoded address part; null when its escapes are malformed (`%E0`). */
export function safeDecode(part: string): string | null {
  try {
    return decodeURIComponent(part);
  } catch {
    return null;
  }
}

/** The name a file downloads under: `natgeo_DgOT_LDGtxo_2.jpg`, `natgeo_picture.jpg`. */
export function fileName(username: string, media: Media): string {
  return `${username}_${media.id.replace(".", "_")}.${media.kind === "video" ? "mp4" : "jpg"}`;
}
