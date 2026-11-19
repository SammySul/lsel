// PUBG is fakePubg over HTTP. Run `bun run build` first.
import { Database } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  browsers,
  LSEL_LOOK,
  launch,
  lselLook,
  serveBuilt,
  watchPage,
} from "@sammysul/lsel/testing";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { api } from "../src/server/api.ts";
import { fakePubg, WORLD } from "../src/server/fakePubg.ts";
import { Pubg } from "../src/server/pubg.ts";

const fake = fakePubg(WORLD);
const pubgServer = Bun.serve({ port: 0, fetch: fake.serve });
let clock = Date.now();
const DIST = join(import.meta.dir, "../dist");
const url = serveBuilt(
  DIST,
  api({
    players: ["AntennaTower", "Rectifier94", "Reason_ING"],
    pubg: new Pubg({
      apiKey: "test-key",
      baseUrl: `${pubgServer.url.href}shards/steam`,
      db: new Database(":memory:"),
      now: () => clock,
    }),
  }),
);

// Lurker's one recent match is gone at PUBG, so no match has both players and one is missing
const lonely = fakePubg({
  ...WORLD,
  players: { ...WORLD.players, Lurker: "account.lurker" },
  recent: { ...WORLD.recent, "account.lurker": ["m-gone"] },
});
const lonelyUrl = serveBuilt(
  DIST,
  api({
    players: ["AntennaTower", "Lurker"],
    pubg: new Pubg({
      apiKey: "test-key",
      baseUrl: "https://pubg.test/shards/steam",
      db: new Database(":memory:"),
      fetch: lonely.fetch,
    }),
  }),
);

afterAll(() => {
  pubgServer.stop(true);
});

// a failed test must not leave PUBG failing for the next
afterEach(() => {
  fake.state.fail = undefined;
});

for (const name of browsers()) {
  describe(name, () => {
    let browser: Browser;
    beforeAll(async () => {
      browser = await launch(name);
    });
    afterAll(async () => {
      await browser?.close();
    });

    async function open(
      at = url,
      reducedMotion: "reduce" | "no-preference" = "no-preference",
    ): Promise<{
      ctx: BrowserContext;
      page: Page;
      problems: () => Promise<string[]>;
    }> {
      const ctx = await browser.newContext({
        timezoneId: "UTC",
        reducedMotion,
        viewport: { width: 1280, height: 900 },
      });
      const page = await ctx.newPage();
      const watch = watchPage(page);
      await page.goto(at(), { waitUntil: "networkidle" });
      return { ctx, page, problems: () => watch.take() };
    }

    const summary = (page: Page) => page.locator(".summary").textContent();
    // the Refresh button ignores r while busy, so each press waits for the one before to finish
    async function refresh(page: Page) {
      const answered = page.waitForResponse((r) => r.url().includes("/api/report"));
      await page.keyboard.press("r");
      await answered;
      await page.getByRole("button", { name: "Refresh", disabled: false }).waitFor();
    }

    const pressed = (page: Page, group: string) =>
      page.locator(`[aria-label="${group}"] button[aria-pressed="true"]`).allTextContents();

    test("lsel's look, under the strict CSP", async () => {
      const { ctx, page, problems } = await open();
      expect(await lselLook(page)).toEqual(LSEL_LOOK);
      expect(await problems()).toEqual([]);
      await ctx.close();
    });

    test("everyone is chosen at first: the table of the one match all three played", async () => {
      const { ctx, page, problems } = await open();
      expect(await pressed(page, "Players")).toEqual(["AntennaTower", "Rectifier94", "Reason_ING"]);
      expect(await summary(page)).toBe("1 match together since Nov 12, 9:40 PM.");
      const row = (player: string) => page.locator("tbody tr", { hasText: player }).locator("td");
      expect((await row("AntennaTower").allTextContents()).slice(0, 3)).toEqual(["5", "6", "501"]);
      expect(await page.locator("thead th").allTextContents()).toContain("Ride distance (km)");
      expect(await row("Reason_ING").nth(11).textContent()).toBe("2.5");
      expect(await problems()).toEqual([]);
      await ctx.close();
    });

    test("dropping a player shows the matches the rest played, including one only one list had", async () => {
      const { ctx, page, problems } = await open();
      await page.getByRole("button", { name: "Reason_ING" }).click();
      await page.waitForFunction(() =>
        document.querySelector(".summary")?.textContent?.startsWith("3 "),
      );
      expect(await summary(page)).toBe("3 matches together since Nov 10, 8:05 PM.");
      expect(
        await page
          .locator("tbody tr", { hasText: "Rectifier94" })
          .locator("td")
          .first()
          .textContent(),
      ).toBe("11");
      expect(await problems()).toEqual([]);
      await ctx.close();
    });

    test("views switch by key, charts draw on a canvas, and the stat applies to charts only", async () => {
      // no animation, so the canvas holds the final picture at once
      const { ctx, page, problems } = await open(url, "reduce");
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
      const drawn = () =>
        page.locator(".chart canvas").evaluate((c: HTMLCanvasElement) => c.toDataURL());
      const kills = await drawn();
      await page.locator("select").selectOption("damage");
      expect(await drawn()).not.toBe(kills);
      await page.keyboard.press("1");
      await page.locator("table").waitFor();
      expect(await problems()).toEqual([]);
      await ctx.close();
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
      expect(await problems()).toEqual([]);
      await ctx.close();
    });

    test("r within 20 minutes is served from the cache; after that it asks PUBG, and a rate limit is a message beside the last report", async () => {
      const { ctx, page } = await open();
      fake.state.calls.length = 0;
      await refresh(page);
      expect(fake.state.calls).toEqual([]);
      clock += 21 * 60_000;
      fake.state.fail = 429;
      await refresh(page);
      const alert = page.getByRole("alert");
      expect(await alert.textContent()).toMatch(
        /^PUBG's rate limit was hit; try again in a minute\. Showing results from \d{1,2}:\d{2} [AP]M\.\s*$/,
      );
      expect(await summary(page)).toBe("1 match together since Nov 12, 9:40 PM.");
      expect(await page.locator("tbody tr").count()).toBe(3);
      expect(fake.state.calls[0]).toMatch(/^\/players\/account\.[a-z]+\/seasons\/lifetime$/);
      fake.state.fail = undefined;
      await refresh(page);
      expect(await alert.count()).toBe(0);
      expect(await summary(page)).toBe("1 match together since Nov 12, 9:40 PM.");
      await ctx.close();
    });

    test("no matches together, a missing match, and no players chosen each say so", async () => {
      const { ctx, page, problems } = await open(lonelyUrl);
      const together = page.getByText("No recent matches with all of them.", { exact: false });
      const missing = page.getByText("1 match couldn't be loaded from PUBG.");
      await together.waitFor();
      expect(await together.textContent()).toBe(
        "No recent matches with all of them. Drop a player to see more.",
      );
      expect(await missing.isVisible()).toBe(true);
      await page.getByRole("button", { name: "Lurker" }).click();
      await page.locator(".summary").waitFor();
      expect(await summary(page)).toBe("3 matches together since Nov 10, 8:05 PM.");
      expect(await missing.count()).toBe(0);
      await page.getByRole("button", { name: "AntennaTower" }).click();
      const none = page.getByText("No players chosen.", { exact: false });
      await none.waitFor();
      expect(await none.textContent()).toBe("No players chosen. Choose one or more above.");
      expect(await page.getByRole("button", { name: "Refresh" }).isDisabled()).toBe(true);
      expect(await page.locator("table").count()).toBe(0);
      expect(await problems()).toEqual([]);
      await ctx.close();
    });
  });
}
