// Calls the server's API and builds the addresses of the files it serves.

import { getJson } from "@sammysul/lsel";
import type { Profile } from "../../shared/types.ts";

/** With `reload`, Instagram is asked again rather than the server's cache; it counts as a new profile. */
export const fetchProfile = (username: string, signal: AbortSignal, reload = false) =>
  getJson<Profile>(
    `/api/profile/${encodeURIComponent(username)}${reload ? "?reload" : ""}`,
    signal,
    "grab's server",
  );

/** A CDN file through the server; with a name, it downloads under it. */
export function mediaUrl(src: string, name?: string): string {
  const params = new URLSearchParams({ src });
  if (name !== undefined) params.set("name", name);
  return `/api/media?${params}`;
}

export const zipUrl = (username: string, ids: Iterable<string>) =>
  `/api/zip/${encodeURIComponent(username)}?ids=${[...ids].map(encodeURIComponent).join(",")}`;

/** The server names the file (Content-Disposition), so the page stays where it is. */
export function download(url: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  document.body.append(a);
  a.click();
  a.remove();
}
