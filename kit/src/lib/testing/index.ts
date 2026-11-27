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

type Rect = { x: number; y: number; width: number; height: number };
/** A layout shift as the page recorded it, its nodes already named: one may be gone by the time it is read. */
type Shift = { hadRecentInput: boolean; sources: { node: string; from: Rect; to: Rect }[] };
type ShiftLog = { shifts: Shift[]; flush(): void };

/** Runs in the page before its own scripts: every layout shift into `lselShifts`, past Chromium's buffer of 150. */
function recordShifts(): void {
  const w = window as unknown as { lselShifts?: ShiftLog };
  if (w.lselShifts !== undefined) return;
  const log: ShiftLog = { shifts: [], flush: () => undefined };
  w.lselShifts = log;
  if (!PerformanceObserver.supportedEntryTypes.includes("layout-shift")) return;
  const name = (n: Node | null | undefined): string => {
    if (!(n instanceof Element))
      return n?.parentElement ? `text in ${name(n.parentElement)}` : "text";
    const label = n.getAttribute("aria-label");
    const cls = typeof n.className === "string" ? n.className.trim().split(/\s+/)[0] : "";
    const text = n.textContent?.trim() ?? "";
    const said = text !== "" && text.length <= 24 ? ` "${text}"` : "";
    return `${n.localName}${cls ? `.${cls}` : ""}${label ? `[${label}]` : ""}${said}`;
  };
  const rect = (r: DOMRectReadOnly): Rect => ({ x: r.x, y: r.y, width: r.width, height: r.height });
  type Entry = PerformanceEntry & {
    hadRecentInput: boolean;
    sources?: { node?: Node | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[];
  };
  const record = (entries: PerformanceEntryList) => {
    for (const e of entries as Entry[]) {
      log.shifts.push({
        hadRecentInput: e.hadRecentInput,
        sources: (e.sources ?? []).map((s) => ({
          node: name(s.node),
          from: rect(s.previousRect),
          to: rect(s.currentRect),
        })),
      });
    }
  };
  const observer = new PerformanceObserver((list) => record(list.getEntries()));
  observer.observe({ type: "layout-shift", buffered: true });
  // entries not yet handed to the callback, taken at once: no timer (page.clock may have stopped them)
  log.flush = () => record(observer.takeRecords());
}

/** Console warnings, errors and uncaught exceptions, but `ignore`; `take()` returns and clears them. Call before `goto`: it also records layout shifts for lselLayout(). */
export function watchPage(page: Page, { ignore }: { ignore?: RegExp } = {}) {
  void page.addInitScript(recordShifts);
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

// Two frames, as a fitted List or Grid settles a frame after the window changes; capped, as page.clock stops frames.
const settle = (page: Page) =>
  Promise.race([
    page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    ),
    Bun.sleep(250),
  ]);

/** The recorded shifts since the last call, cleared. */
async function takeShifts(page: Page): Promise<Shift[]> {
  // watchPage()'s init script can lose the race with goto on a busy machine: installed now, its buffered observer still sees every shift since load
  await page.evaluate(recordShifts);
  return page.evaluate(() => {
    const log = (window as unknown as { lselShifts: ShiftLog }).lselShifts;
    log.flush();
    return log.shifts.splice(0);
  });
}

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

/** DESIGN.md's layout rules: where the page scrolls at LAYOUT_SIZES, and what moved by itself since load or the last call (Chromium only). */
export async function lselLayout(page: Page): Promise<{ scrolls: string[]; shifted: string[] }> {
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
  const shifts = await takeShifts(page);
  // a move the user asked for (a key, a click) is theirs; DESIGN.md forbids only what moves by itself
  const shifted = shifts
    .filter((e) => !e.hadRecentInput)
    .flatMap((e) =>
      e.sources.flatMap((source) => {
        const moved = how(source.from, source.to);
        // under a pixel every way: text redrawn in place, nothing anyone sees move
        return moved === "" ? [] : [`${source.node} ${moved}`];
      }),
    );
  const found = page.viewportSize();
  const scrolls: string[] = [];
  for (const size of LAYOUT_SIZES) {
    await page.setViewportSize(size);
    await settle(page);
    const over = await page.evaluate(() => {
      const root = document.documentElement;
      return {
        down: root.scrollHeight > root.clientHeight,
        sideways: root.scrollWidth > root.clientWidth,
      };
    });
    const at = `${size.width}×${size.height}`;
    if (over.down) scrolls.push(`${at} down`);
    if (over.sideways) scrolls.push(`${at} sideways`);
  }
  if (found !== null) await page.setViewportSize(found);
  await settle(page);
  // the resizing above moved things; the next call counts from here
  await takeShifts(page);
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
