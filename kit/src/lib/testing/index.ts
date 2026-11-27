// e2e helpers every app shares: which browsers to run, launching them and the look checks.

import { afterAll, beforeAll, describe } from "bun:test";
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
import { palette } from "../assets/palette.ts";
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

/** A describe block per browser in browsers(), the browser launched once for it; `browser()` returns it. */
export function eachBrowser(body: (browser: () => Browser, name: string) => void): void {
  for (const name of browsers()) {
    describe(name, () => {
      let launched: Browser | undefined;
      // WebKit on Linux can take most of a minute to start
      beforeAll(async () => {
        launched = await launch(name);
      }, 60_000);
      afterAll(async () => {
        await launched?.close();
      });
      body(() => {
        if (launched === undefined) throw new Error(`${name} has not launched`);
        return launched;
      }, name);
    });
  }
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

/** What `lselLook()` reads on a page drawn in lsel's look. */
export const LSEL_LOOK = { background: rgb(palette.base), font: true } as const;

export async function lselLook(page: Page): Promise<{ background: string; font: boolean }> {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => ({
    background: getComputedStyle(document.body).backgroundColor,
    font:
      document.fonts.check('14px "Cantarell"') && document.fonts.check('14px "DejaVu Sans Mono"'),
  }));
}

/** The windows an app screen must fit without the page scrolling: a laptop and a phone. */
export const LAYOUT_SIZES = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
] as const;

/** What `lselLayout()` reads on a screen that keeps DESIGN.md's layout rules. */
export const LSEL_LAYOUT: { scrolls: string[]; shifted: string[] } = { scrolls: [], shifted: [] };

/**
 * Two frames: a fitted List or Grid settles one frame after the window changes. Waited for from
 * here, with a cap: a test that stopped the page's clock (page.clock) stops its frames too.
 */
const settle = (page: Page) =>
  Promise.race([
    page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    ),
    Bun.sleep(250),
  ]);

/**
 * DESIGN.md's layout rules, read off the page: `scrolls` names each of LAYOUT_SIZES where the page
 * scrolls (sideways always counts; down only on an app screen, not a `reading` Page), and `shifted`
 * names what moved by itself (not right after a key or click) since the page loaded or the last call (Chromium reports layout
 * shifts; other engines report none). Hands back the window it found.
 */
export async function lselLayout(page: Page): Promise<{ scrolls: string[]; shifted: string[] }> {
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
  const shifted = await page.evaluate(() => {
    const seen = (window as { lselLayoutSeen?: number }).lselLayoutSeen ?? 0;
    const name = (n: Node | null | undefined): string => {
      if (!(n instanceof Element))
        return n?.parentElement ? `text in ${name(n.parentElement)}` : "text";
      const label = n.getAttribute("aria-label");
      const cls = typeof n.className === "string" ? n.className.trim().split(/\s+/)[0] : "";
      const text = n.textContent?.trim() ?? "";
      const said = text !== "" && text.length <= 24 ? ` "${text}"` : "";
      return `${n.localName}${cls ? `.${cls}` : ""}${label ? `[${label}]` : ""}${said}`;
    };
    type Rect = { x: number; y: number; width: number; height: number };
    const how = (from: Rect, to: Rect) => {
      const parts: string[] = [];
      const dy = Math.round(to.y - from.y);
      const dx = Math.round(to.x - from.x);
      const dh = Math.round(to.height - from.height);
      const dw = Math.round(to.width - from.width);
      if (dy !== 0) parts.push(`${dy > 0 ? "down" : "up"} ${Math.abs(dy)}px`);
      if (dx !== 0) parts.push(`${dx > 0 ? "right" : "left"} ${Math.abs(dx)}px`);
      if (dh !== 0) parts.push(`${dh > 0 ? "taller" : "shorter"} ${Math.abs(dh)}px`);
      if (dw !== 0) parts.push(`${dw > 0 ? "wider" : "narrower"} ${Math.abs(dw)}px`);
      return parts.join(", ");
    };
    if (!PerformanceObserver.supportedEntryTypes.includes("layout-shift")) return [];
    // buffered entries are handed over at once, so no timer (which page.clock may have stopped) is needed
    const observer = new PerformanceObserver(() => undefined);
    observer.observe({ type: "layout-shift", buffered: true });
    type Shift = PerformanceEntry & {
      hadRecentInput: boolean;
      sources?: { node?: Node | null; previousRect: Rect; currentRect: Rect }[];
    };
    const entries = observer.takeRecords() as Shift[];
    observer.disconnect();
    // a move the user asked for (a key, a click) is theirs; DESIGN.md forbids only what moves by itself
    return entries
      .slice(seen)
      .filter((e) => !e.hadRecentInput)
      .flatMap((e) =>
        (e.sources ?? []).flatMap((source) => {
          const moved = how(source.previousRect, source.currentRect);
          // under a pixel every way: text redrawn in place, nothing anyone sees move
          return moved === "" ? [] : [`${name(source.node)} ${moved}`];
        }),
      );
  });
  const found = page.viewportSize();
  const scrolls: string[] = [];
  for (const size of LAYOUT_SIZES) {
    await page.setViewportSize(size);
    await settle(page);
    const over = await page.evaluate(() => {
      const root = document.documentElement;
      const reading = document.querySelector("main[data-lsel-reading]") !== null;
      return {
        down: !reading && root.scrollHeight > root.clientHeight,
        sideways: root.scrollWidth > root.clientWidth,
      };
    });
    const at = `${size.width}×${size.height}`;
    if (over.down) scrolls.push(`${at} down`);
    if (over.sideways) scrolls.push(`${at} sideways`);
  }
  if (found !== null) await page.setViewportSize(found);
  await settle(page);
  // the resizing above moved things; the next call counts from here (by count: page.clock fakes the time)
  await page.evaluate(() => {
    if (!PerformanceObserver.supportedEntryTypes.includes("layout-shift")) return;
    const observer = new PerformanceObserver(() => undefined);
    observer.observe({ type: "layout-shift", buffered: true });
    (window as { lselLayoutSeen?: number }).lselLayoutSeen = observer.takeRecords().length;
    observer.disconnect();
  });
  return { scrolls, shifted: [...new Set(shifted)] };
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
