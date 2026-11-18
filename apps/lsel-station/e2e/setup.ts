import { afterAll, beforeAll } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { chromium, firefox, webkit } from "playwright-core";
import { openSaves } from "../src/server/saves.ts";
import { handler } from "../src/server/server.ts";

export const BROWSERS = { chromium, firefox, webkit };
/** The browsers to run in: BROWSERS=chromium,firefox,webkit picks, all three by default. */
export const names = (process.env.BROWSERS?.split(",") ??
  Object.keys(BROWSERS)) as (keyof typeof BROWSERS)[];
export const TIMEOUT = 30_000;

const DIST = join(import.meta.dir, "../dist");

/** Serves the built game with its own empty sync service while the file's tests run; the result is its address. */
export function serveBuilt(): () => string {
  let server: ReturnType<typeof Bun.serve> | undefined;
  beforeAll(() => {
    if (!existsSync(join(DIST, "index.html")))
      throw new Error("no dist/: run `bun run build` first");
    server = Bun.serve({
      port: 0,
      fetch: handler({ staticDir: DIST, saves: openSaves(":memory:") }),
    });
  });
  afterAll(() => {
    server?.stop(true);
  });
  return () => {
    if (server === undefined) throw new Error("the server is not running");
    return server.url.href;
  };
}
