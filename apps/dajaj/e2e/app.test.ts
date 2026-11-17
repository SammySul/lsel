// The built app in real browsers, served by the real server, with PUBG replaced by fakePubg over HTTP.
// Run `bun run build` first. Env: BROWSERS=chromium,firefox,webkit
import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  type Browser,
  type BrowserContext,
  chromium,
  firefox,
  type Page,
  webkit,
} from "playwright-core";
import { fakePubg, WORLD } from "../src/server/fakePubg.ts";
import { Pubg } from "../src/server/pubg.ts";
import { handler } from "../src/server/server.ts";

const DIST = join(import.meta.dir, "../dist");
const ALL = { chromium, firefox, webkit };
const names = (process.env.BROWSERS?.split(",") ?? Object.keys(ALL)) as (keyof typeof ALL)[];

let fake: ReturnType<typeof fakePubg>;
let pubgServer: ReturnType<typeof Bun.serve>;
let appServer: ReturnType<typeof Bun.serve>;
let base: string;
let clock = Date.now();

beforeAll(() => {
  if (!existsSync(join(DIST, "index.html"))) throw new Error("no dist/: run `bun run build` first");
  fake = fakePubg(WORLD);
  pubgServer = Bun.serve({ port: 0, fetch: fake.serve });
  const pubg = new Pubg({
    apiKey: "test-key",
    baseUrl: `${pubgServer.url.href}shards/steam`,
    db: new Database(":memory:"),
    now: () => clock,
  });
  appServer = Bun.serve({
    port: 0,
    fetch: handler({
      staticDir: DIST,
      players: ["AntennaTower", "Rectifier94", "Reason_ING"],
      pubg,
    }),
  });
  base = appServer.url.href.replace(/\/$/, "");
});

afterAll(() => {
  appServer?.stop(true);
  pubgServer?.stop(true);
});

for (const name of names) {
  describe(name, () => {
    let browser: Browser;
    beforeAll(async () => {
      browser = await ALL[name].launch({ headless: true });
    });
    afterAll(async () => {
      await browser?.close();
    });

    async function open(): Promise<{ ctx: BrowserContext; page: Page; problems: string[] }> {
      const ctx = await browser.newContext({
        timezoneId: "UTC",
        viewport: { width: 1280, height: 900 },
      });
      const page = await ctx.newPage();
      const problems: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error" || m.type() === "warning")
          problems.push(`${m.type()}: ${m.text()}`);
      });
      page.on("pageerror", (e) => problems.push(`uncaught: ${e.message}`));
      await page.goto(`${base}/`, { waitUntil: "networkidle" });
      return { ctx, page, problems };
    }

    const status = (page: Page) => page.locator(".status").textContent();
    const pressed = (page: Page, group: string) =>
      page.locator(`[aria-label="${group}"] button[aria-pressed="true"]`).allTextContents();

    test("everyone is chosen at first: the table of the one match all three played", async () => {
      const { ctx, page, problems } = await open();
      expect(await pressed(page, "Players")).toEqual(["AntennaTower", "Rectifier94", "Reason_ING"]);
      expect(await status(page)).toBe("1 match together since Nov 12, 9:40 PM.");
      const row = (player: string) => page.locator("tbody tr", { hasText: player }).locator("td");
      expect((await row("AntennaTower").allTextContents()).slice(0, 3)).toEqual(["5", "6", "501"]);
      expect(await page.locator("thead th").allTextContents()).toContain("Ride distance (km)");
      expect(await row("Reason_ING").nth(11).textContent()).toBe("2.5");
      await ctx.close();
      expect(problems).toEqual([]);
    });

    test("dropping a player shows the matches the rest played, including one only one list had", async () => {
      const { ctx, page, problems } = await open();
      await page.getByRole("button", { name: "Reason_ING" }).click();
      await page.waitForFunction(() =>
        document.querySelector(".status")?.textContent?.startsWith("3 "),
      );
      expect(await status(page)).toBe("3 matches together since Nov 10, 8:05 PM.");
      expect(
        await page
          .locator("tbody tr", { hasText: "Rectifier94" })
          .locator("td")
          .first()
          .textContent(),
      ).toBe("11");
      await ctx.close();
      expect(problems).toEqual([]);
    });

    test("views switch by key, charts draw on a canvas, and the stat applies to charts only", async () => {
      const { ctx, page, problems } = await open();
      expect(await page.locator("select").isDisabled()).toBe(true);
      for (const [key, view] of [
        ["2", "bar"],
        ["3", "line"],
        ["4", "pie"],
      ] as const) {
        await page.keyboard.press(key);
        await page.locator(`.chart[data-view="${view}"] canvas`).waitFor();
        expect(await pressed(page, "View")).toEqual([
          `${view[0]?.toUpperCase()}${view.slice(1)} ${key}`,
        ]);
      }
      expect(await page.locator("select").isDisabled()).toBe(false);
      await page.locator("select").selectOption("damage");
      await page.keyboard.press("1");
      await page.locator("table").waitFor();
      await ctx.close();
      expect(problems).toEqual([]);
    });

    test("choices survive a reload", async () => {
      const { ctx, page, problems } = await open();
      await page.getByRole("button", { name: "Reason_ING" }).click();
      await page.keyboard.press("3");
      await page.locator("select").selectOption("walkDistance");
      await page.reload({ waitUntil: "networkidle" });
      expect(await pressed(page, "Players")).toEqual(["AntennaTower", "Rectifier94"]);
      expect(await pressed(page, "View")).toEqual(["Line 3"]);
      expect(await page.locator("select").inputValue()).toBe("walkDistance");
      await ctx.close();
      expect(problems).toEqual([]);
    });

    test("r within 20 minutes is served from the cache; after that it asks PUBG, and a rate limit shows as a message", async () => {
      const { ctx, page } = await open();
      fake.state.calls.length = 0;
      await page.keyboard.press("r");
      await page.waitForLoadState("networkidle");
      expect(fake.state.calls).toEqual([]);
      clock += 21 * 60_000;
      fake.state.fail = 429;
      await page.keyboard.press("r");
      await page.locator(".error").waitFor();
      expect(await page.locator(".error").textContent()).toBe(
        "PUBG's rate limit was hit; try again in a minute",
      );
      expect(fake.state.calls[0]).toMatch(/^\/players\/account\.[a-z]+\/seasons\/lifetime$/);
      fake.state.fail = undefined;
      await ctx.close();
    });
  });
}
