import { afterAll, beforeAll } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  type Browser,
  type BrowserType,
  type ConsoleMessage,
  chromium,
  firefox,
  type Page,
  webkit,
} from "playwright-core";
import { handler, type Routes } from "../server/index.ts";

export { registerSvelteModules } from "./svelte.ts";

const TYPES: Readonly<Record<string, BrowserType>> = { chromium, firefox, webkit };

/** `BROWSERS=chromium,firefox` picks; all three by default. Throws outside the dev shell. */
export function browsers(): string[] {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH === undefined) {
    throw new Error("browser tests need the dev shell's browsers: nix develop -c bun run test:e2e");
  }
  const names = process.env.BROWSERS?.split(",").filter(Boolean) ?? Object.keys(TYPES);
  for (const n of names) if (!(n in TYPES)) throw new Error(`unknown browser ${n}`);
  return names;
}

export function launch(name: string): Promise<Browser> {
  const type = TYPES[name];
  if (type === undefined) throw new Error(`unknown browser ${name}`);
  return type.launch({ headless: true });
}

/** Firefox's hint whenever a scroll handler moves content, once per page: not the app's problem. */
export const isBrowserNoise = (m: ConsoleMessage) =>
  m.type() === "warning" && m.text().includes("scroll-linked positioning effect");

/** Collects console warnings and errors and uncaught exceptions; `take()` returns and clears them. */
export function watchPage(page: Page): { take(): Promise<string[]> } {
  const lines: string[] = [];
  page.on("console", (m) => {
    if ((m.type() === "warning" || m.type() === "error") && !isBrowserNoise(m)) {
      lines.push(`${m.type()}: ${m.text()}`);
    }
  });
  page.on("pageerror", (e) => lines.push(`uncaught: ${e.message}`));
  return {
    async take() {
      await page.evaluate(() => 0);
      return lines.splice(0);
    },
  };
}

export const LSEL_LOOK = { background: "rgb(18, 18, 18)", font: true } as const;

export async function lselLook(page: Page): Promise<{ background: string; font: boolean }> {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => ({
    background: getComputedStyle(document.body).backgroundColor,
    font: document.fonts.check('14px "JetBrains Mono"'),
  }));
}

/** Call at a test file's top level; the result gives the address once the file's tests run. */
export function serveBuilt(dist: string, routes?: Routes): () => string {
  let server: ReturnType<typeof Bun.serve> | undefined;
  beforeAll(() => {
    if (!existsSync(join(dist, "index.html"))) {
      throw new Error(`no ${dist}/index.html: run \`bun run build\` first`);
    }
    server = Bun.serve({
      port: 0,
      fetch: handler(dist, routes),
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
