// The JSON API the page calls: one route per screen, answering with everything the screen shows.

import { json, type Routes } from "@sammysul/lsel/server";
import type { Hello } from "../shared/types.ts";

export function api(now: () => Date = () => new Date()): Routes {
  return (_req, url) => {
    if (!url.pathname.startsWith("/api/")) return undefined;
    if (url.pathname === "/api/hello") {
      return json({ greeting: "Hello from the server", at: now().toISOString() } satisfies Hello);
    }
    return json({ error: "no such endpoint" }, 404);
  };
}
