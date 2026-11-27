// Calls the server's API and builds the addresses of the files it serves.

import type { Profile } from "../../shared/types.ts";

/** With `reload`, Instagram is asked again rather than the server's cache; it counts as a new profile. */
export async function fetchProfile(
  username: string,
  signal: AbortSignal,
  reload = false,
): Promise<Profile> {
  let res: Response;
  try {
    const query = reload ? "?reload" : "";
    res = await fetch(`/api/profile/${encodeURIComponent(username)}${query}`, { signal });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new Error("grab's server could not be reached");
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? `grab's server answered ${res.status}`);
  return body as Profile;
}

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
