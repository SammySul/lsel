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
import { version as playwrightVersion } from "playwright-core/package.json";
import { palettes } from "../assets/palette.ts";
import { handler, type Routes } from "../server/index.ts";

const TYPES: Readonly<Record<string, BrowserType>> = { chromium, firefox, webkit };

/** `BROWSERS=chromium,firefox` picks (lsel's `web` shell sets chromium); all three otherwise. Throws outside the dev shell. */
export function browsers(): string[] {
  const driver = process.env.PLAYWRIGHT_DRIVER_VERSION;
  if (process.env.PLAYWRIGHT_BROWSERS_PATH === undefined || driver === undefined) {
    throw new Error("browser tests need the dev shell's browsers: nix develop -c bun run test:e2e");
  }
  if (driver !== playwrightVersion) {
    throw new Error(
      `playwright-core is ${playwrightVersion}, the dev shell's browsers are ${driver}`,
    );
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
const isBrowserNoise = (m: ConsoleMessage) =>
  m.type() === "warning" && m.text().includes("scroll-linked positioning effect");

/** Console warnings, errors and uncaught exceptions, but `ignore`; `take()` returns and clears them. */
export function watchPage(page: Page, { ignore }: { ignore?: RegExp } = {}) {
  const lines: Promise<string>[] = [];
  page.on("console", (m) => {
    if ((m.type() !== "warning" && m.type() !== "error") || isBrowserNoise(m)) return;
    // logged objects arrive as handles; the browser's own messages (a CSP violation) have none
    const args = m.args();
    const text =
      args.length === 0
        ? Promise.resolve(m.text())
        : Promise.all(args.map((a) => a.jsonValue().catch(() => "?"))).then((v) =>
            v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "),
          );
    lines.push(text.then((t) => `${m.type()}: ${t}`));
  });
  page.on("pageerror", (e) => lines.push(Promise.resolve(`uncaught: ${e.message}`)));
  return {
    async take(): Promise<string[]> {
      await page.evaluate(() => 0);
      const all = await Promise.all(lines.splice(0));
      return all.filter((l) => !ignore?.test(l));
    },
  };
}

const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

/** What `lselLook()` reads on a page drawn in lsel's look, in the browser's default light scheme. */
export const LSEL_LOOK = { background: rgb(palettes.light.base), font: true } as const;
/** The same page under `emulateMedia({ colorScheme: "dark" })`. */
export const LSEL_LOOK_DARK = { background: rgb(palettes.dark.base), font: true } as const;

export async function lselLook(page: Page): Promise<{ background: string; font: boolean }> {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => ({
    background: getComputedStyle(document.body).backgroundColor,
    font:
      document.fonts.check('14px "Cantarell"') && document.fonts.check('14px "DejaVu Sans Mono"'),
  }));
}

/** Call at a test file's top level; the result gives the address once the file's tests run. */
export function serveBuilt(
  dist: string,
  routes?: Routes,
  { csp }: { csp?: string } = {},
): () => string {
  let server: ReturnType<typeof Bun.serve> | undefined;
  beforeAll(() => {
    if (!existsSync(join(dist, "index.html"))) {
      throw new Error(`no ${dist}/index.html: run \`bun run build\` first`);
    }
    server = Bun.serve({
      port: 0,
      fetch: handler(dist, routes, { csp }),
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
