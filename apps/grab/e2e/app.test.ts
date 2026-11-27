// Instagram and Threads are fakeInstagram, injected as fetch. Run `bun run build` first.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  eachBrowser,
  LSEL_LAYOUT,
  LSEL_LOOK,
  lselLayout,
  lselLook,
  serveBuilt,
  watchPage,
} from "@sammysul/lsel/testing";
import type { BrowserContext, Page } from "playwright-core";
import { api } from "../src/server/api.ts";
import { fakeInstagram, WORLD } from "../src/server/fakeInstagram.ts";
import { Instagram } from "../src/server/instagram.ts";
import { Threads } from "../src/server/threads.ts";

const DIST = join(import.meta.dir, "../dist");

/** grab's server on the built app with its own fake Instagram and cache, so no test's profile hides another's refusal. */
function server({ gap = 0 } = {}) {
  const fake = fakeInstagram(WORLD);
  const url = serveBuilt(
    DIST,
    api({
      instagram: new Instagram({
        fetch: fake.fetch,
        gap,
        retryWait: 0,
        threads: new Threads({ fetch: fake.fetch, gap: 0 }),
      }),
    }),
  );
  return { fake, url };
}

const { url } = server();
const { fake: moody, url: moodyUrl } = server();
const { fake: throttled, url: throttledUrl } = server();
const { fake: reloading, url: reloadingUrl } = server();
// slow enough that the first answer comes before the posts are all in
const { url: slowUrl } = server({ gap: 300 });

afterEach(() => {
  moody.state.fail = undefined;
  throttled.state.limitAfter = undefined;
});

eachBrowser((browser) => {
  async function open(
    hash = "",
    { at = url, phone = false } = {},
  ): Promise<{ ctx: BrowserContext; page: Page; problems: () => Promise<string[]> }> {
    const ctx = await browser().newContext({
      timezoneId: "UTC",
      acceptDownloads: true,
      ...(phone
        ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
        : { viewport: { width: 1280, height: 800 } }),
    });
    const page = await ctx.newPage();
    const watch = watchPage(page);
    await page.goto(`${at()}${hash}`, { waitUntil: "networkidle" });
    return { ctx, page, problems: () => watch.take() };
  }

  const tiles = (page: Page) => page.locator('[aria-label="Files"] > li');
  const currentTile = (page: Page) =>
    page
      .locator('[aria-label="Files"] > li[aria-current="true"] input')
      .getAttribute("aria-label")
      .then((label) => label?.replace(/^Tick (.*) for the zip$/, "$1"));
  const facts = (page: Page) => page.locator(".facts").textContent();
  const ticked = (page: Page) => page.locator(".count").textContent();
  const foot = (page: Page) =>
    page
      .locator(".pager .foot")
      .textContent()
      .then((t) => t?.replace(/\s+/g, " ").trim());
  const pager = (page: Page) => page.locator(".pager > span").textContent();

  test("lsel's look under the strict CSP, every tile's image drawn through the server", async () => {
    const { ctx, page, problems } = await open("#/nat.geo");
    await tiles(page).first().waitFor();
    expect(await lselLook(page)).toEqual(LSEL_LOOK);
    expect(await lselLayout(page)).toEqual(LSEL_LAYOUT);
    // 4 across and 2 down fit at 1280×800: the 11 files take two pages, the page never scrolls
    expect([await tiles(page).count(), await pager(page)]).toEqual([8, "Page 1 of 2"]);
    const drawn = await page
      .locator('[aria-label="Files"] img')
      .evaluateAll((imgs: HTMLImageElement[]) =>
        Promise.all(imgs.map((i) => i.decode().then(() => i.naturalWidth))),
      );
    expect(drawn).toEqual(new Array(8).fill(1));
    expect(await problems()).toEqual([]);
    await ctx.close();
  });

  test("a pasted address finds the profile; a bad name is refused under the field", async () => {
    const { ctx, page, problems } = await open();
    expect(await page.locator(".lsel-empty").textContent()).toBe(
      "Type a public profile's username, or paste its address, and press Enter. / goes to the field.",
    );
    await page.keyboard.press("/");
    await page.keyboard.type("https://www.instagram.com/Nat.Geo/");
    await page.keyboard.press("Enter");
    await page.locator(".who h2").waitFor();
    expect(new URL(page.url()).hash).toBe("#/nat.geo");
    expect(await page.locator(".who h2").textContent()).toBe("National Geo");
    expect(await page.locator(".who .line").textContent()).toBe(
      "nat.geo · verified · 267M followers · 800 posts",
    );
    expect(await foot(page)).toBe("The newest 8: all Instagram shows without a login");
    await page.getByLabel("Username").fill("no spaces");
    await page.keyboard.press("Enter");
    expect(await page.getByLabel("Username").getAttribute("aria-invalid")).toBe("true");
    expect(await page.locator(".lsel-field .error").textContent()).toBe(
      "A username is letters, numbers, periods and underscores, up to 30.",
    );
    expect(new URL(page.url()).hash).toBe("#/nat.geo");
    expect(await problems()).toEqual([]);
    await ctx.close();
  });

  test("keys move through the tiles and the preview follows, a video included", async () => {
    const { ctx, page, problems } = await open("#/nat.geo");
    await tiles(page).first().waitFor();
    expect([await currentTile(page), await facts(page)]).toEqual([
      "Profile picture",
      "Profile picture · 640 × 640",
    ]);
    await page.keyboard.press("l");
    expect([await currentTile(page), await facts(page)]).toEqual([
      "Photo, post Pin_ned-1",
      "Photo · 1080 × 1350 · Oct 17, 3:00 PM",
    ]);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("l");
    await page.keyboard.press("l");
    expect([await currentTile(page), await facts(page)]).toEqual([
      "Video 3 of 3 in post Car-ousel2",
      "Video · 1080 × 1920 · 0:42 · 3 of 3 · Nov 26, 3:00 PM",
    ]);
    expect(await page.locator(".preview .caption").textContent()).toBe("Caption of Car-ousel2");
    const video = await page.locator(".preview video").evaluate(async (v: HTMLVideoElement) => {
      const res = await fetch(v.src, { headers: { Range: "bytes=0-7" } });
      return [res.status, await res.text()];
    });
    expect(video).toEqual([206, "fake mp4"]);
    // the grid is 4 tiles wide at this size: a row down is 4 on
    await page.keyboard.press("g");
    await page.keyboard.press("j");
    await page.keyboard.press("j");
    expect(await currentTile(page)).toBe("Photo, post Photo6");
    await page.keyboard.press("k");
    expect(await currentTile(page)).toBe("Video 3 of 3 in post Car-ousel2");
    await page.keyboard.press("G");
    expect([await currentTile(page), await pager(page), await tiles(page).count()]).toEqual([
      "Photo, post Photo8",
      "Page 2 of 2",
      3,
    ]);
    // a page back is 8 back: from the 11th file, the 3rd
    await page.keyboard.press("PageUp");
    expect([await currentTile(page), await pager(page)]).toEqual([
      "Photo 1 of 3 in post Car-ousel2",
      "Page 1 of 2",
    ]);
    await tiles(page).nth(4).click();
    expect(await currentTile(page)).toBe("Video 3 of 3 in post Car-ousel2");
    expect(await problems()).toEqual([]);
    await ctx.close();
  });

  test("o opens the current file alone in a new tab, shown rather than downloaded; O opens its post on Instagram", async () => {
    const { ctx, page, problems } = await open("#/nat.geo");
    await ctx.route("https://www.instagram.com/**", (route) =>
      route.fulfill({ body: "Instagram" }),
    );
    await tiles(page).first().waitFor();
    await page.keyboard.press("l");
    expect(await currentTile(page)).toBe("Photo, post Pin_ned-1");
    const [file] = await Promise.all([ctx.waitForEvent("page"), page.keyboard.press("o")]);
    await file.waitForLoadState();
    expect([file.url(), await file.evaluate(() => document.contentType)]).toEqual([
      `${url()}api/media?src=https%3A%2F%2Fscontent-fra5-1.cdninstagram.com%2Fv%2Ft51.82787-15%2FPin_ned-1_1.jpg%3Fstp%3Ddst-jpg%26oe%3D6930A1B2`,
      "image/jpeg",
    ]);
    const [post] = await Promise.all([ctx.waitForEvent("page"), page.keyboard.press("O")]);
    await post.waitForLoadState();
    expect(post.url()).toBe("https://www.instagram.com/p/Pin_ned-1/");
    expect(
      await page
        .locator(".preview .actions a")
        .evaluateAll((as: HTMLAnchorElement[]) =>
          as.map((a) => [a.textContent, a.getAttribute("href")]),
        ),
    ).toEqual([
      [
        "Open file o",
        "/api/media?src=https%3A%2F%2Fscontent-fra5-1.cdninstagram.com%2Fv%2Ft51.82787-15%2FPin_ned-1_1.jpg%3Fstp%3Ddst-jpg%26oe%3D6930A1B2",
      ],
      ["Open on Instagram O", "https://www.instagram.com/p/Pin_ned-1/"],
    ]);
    expect(await problems()).toEqual([]);
    await ctx.close();
  });

  test("ticked files download as one zip; d downloads the current one under its name", async () => {
    const { ctx, page, problems } = await open("#/nat.geo");
    await tiles(page).first().waitFor();
    const zip = page.getByRole("button", { name: /Zip ticked/ });
    expect([await ticked(page), await zip.isDisabled()]).toEqual(["0 of 11 files ticked", true]);
    await page.keyboard.press("x");
    await page.keyboard.press("l");
    await page.keyboard.press("l");
    await page.keyboard.press("l");
    await page.keyboard.press("l");
    await page.keyboard.press("x");
    await page.keyboard.press("PageDown");
    await tiles(page).nth(2).locator("input").check();
    expect(await ticked(page)).toBe("3 of 11 files ticked");
    const dir = mkdtempSync(join(tmpdir(), "grab-e2e-"));
    const [archive] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("z")]);
    expect(archive.suggestedFilename()).toBe("nat.geo.zip");
    await archive.saveAs(join(dir, "a.zip"));
    expect(Bun.spawnSync(["unzip", "-Z1", join(dir, "a.zip")]).stdout.toString()).toBe(
      "nat.geo_picture.jpg\n2026-11-26 Car-ousel2/nat.geo_Car-ousel2_3.mp4\nPhoto8/nat.geo_Photo8_1.jpg\n",
    );
    const [one] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("d")]);
    expect(one.suggestedFilename()).toBe("nat.geo_Photo8_1.jpg");
    await page.keyboard.press("a");
    expect(await ticked(page)).toBe("11 of 11 files ticked");
    await page.keyboard.press("n");
    expect([await ticked(page), await zip.isDisabled()]).toEqual(["0 of 11 files ticked", true]);
    expect(await problems()).toEqual([]);
    await ctx.close();
  });

  test("a missing post, an empty profile and an unknown name each say so", async () => {
    const { ctx, page, problems } = await open("#/patchy");
    await page.locator(".pager .warning").waitFor();
    expect([await foot(page), await tiles(page).count()]).toEqual([
      "1 post couldn't be loaded from Instagram",
      2,
    ]);
    await page.goto(`${url()}#/quiet`, { waitUntil: "networkidle" });
    await page.getByText("No public posts").waitFor();
    expect([await foot(page), await tiles(page).count()]).toEqual([
      "No public posts: the account may be private or have none yet",
      1,
    ]);
    await page.goto(`${url()}#/ghost`, { waitUntil: "networkidle" });
    const alert = page.getByRole("alert");
    await alert.waitFor();
    expect((await alert.textContent())?.replace(/\s+/g, " ").trim()).toBe(
      "Instagram has no public profile called ghost. r retries.",
    );
    expect(await problems()).toEqual([
      expect.stringMatching(
        /^error: Failed to load resource: the server responded with a status of 404/,
      ),
    ]);
    await ctx.close();
  });

  test("a rate limit is a message with r to retry, r brings the profile, and a refused R keeps it under a line saying so", async () => {
    moody.state.fail = 429;
    const { ctx, page } = await open("#/nat.geo", { at: moodyUrl });
    const alert = page.getByRole("alert");
    await alert.waitFor();
    expect((await alert.textContent())?.replace(/\s+/g, " ").trim()).toBe(
      "Instagram is rate limiting; try again in a few minutes. r retries.",
    );
    moody.state.fail = undefined;
    await page.keyboard.press("r");
    await page.locator(".who h2").waitFor();
    expect([await alert.count(), await tiles(page).count()]).toEqual([0, 8]);
    moody.state.fail = 429;
    await page.keyboard.press("Shift+R");
    await page.locator(".pager .foot").getByRole("alert").waitFor();
    expect([await foot(page), await tiles(page).count()]).toEqual([
      expect.stringMatching(
        /^Instagram is rate limiting; try again in a few minutes\. Showing results from \d+:\d\d [AP]M\. r retries\.$/,
      ),
      8,
    ]);
    await ctx.close();
  });

  test("cut short by Instagram's rate limit: what came, a line saying so, and Reload loads the rest", async () => {
    throttled.state.limitAfter = 3;
    const { ctx, page, problems } = await open("#/nat.geo", { at: throttledUrl });
    const line = page.locator(".pager .warning");
    await line.waitFor();
    expect(await foot(page)).toBe("Reload for the 5 posts Instagram's rate limit held back");
    // the picture, the pinned photo, the carousel's three and the reel
    expect([await tiles(page).count(), await pager(page)]).toEqual([6, "Page 1 of 1"]);
    throttled.state.limitAfter = undefined;
    await page.keyboard.press("Shift+R");
    await line.waitFor({ state: "detached" });
    expect([await tiles(page).count(), await pager(page)]).toEqual([8, "Page 1 of 2"]);
    expect(await lselLayout(page)).toEqual(LSEL_LAYOUT);
    expect(await problems()).toEqual([]);
    await ctx.close();
  });

  test("a profile opened earlier comes back at once, before the server answers, and its answer moves nothing", async () => {
    const { ctx, page, problems } = await open("#/nat.geo");
    await tiles(page).first().waitFor();
    await page.getByLabel("Username").fill("patchy");
    await page.keyboard.press("Enter");
    await page.locator(".who h2").getByText("Patchy").waitFor();
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/profile/**", async (route) => {
      await held;
      await route.continue();
    });
    const asked = page.waitForRequest((r) => r.url().endsWith("/api/profile/nat.geo"));
    await page.keyboard.press("2");
    await asked;
    const seen = async () => [
      await page.locator(".who h2").textContent(),
      await tiles(page).count(),
      await pager(page),
      await foot(page),
    ];
    const whole = [
      "National Geo",
      8,
      "Page 1 of 2",
      "The newest 8: all Instagram shows without a login",
    ];
    expect(await seen()).toEqual(whole);
    expect(await lselLayout(page)).toEqual(LSEL_LAYOUT);
    // past the 500 ms after a key press in which a layout shift counts as the user's
    await Bun.sleep(600);
    const answered = page.waitForResponse((r) => r.url().endsWith("/api/profile/nat.geo"));
    release();
    expect((await answered).status()).toBe(200);
    expect(await seen()).toEqual(whole);
    expect(await lselLayout(page)).toEqual(LSEL_LAYOUT);
    expect(await problems()).toEqual([]);
    await ctx.close();
  });

  test("R asks Instagram for the profile again, its posts from the server's cache, keeping it on screen until then", async () => {
    const { ctx, page, problems } = await open("#/nat.geo", { at: reloadingUrl });
    await tiles(page).first().waitFor();
    // the thumbnails come through the same fake, so only its pages count
    const pages = () => reloading.state.calls.filter((c) => !c.startsWith("cdn/"));
    const calls = pages().length;
    const button = page
      .locator(".bar .lsel-action")
      .filter({ has: page.locator("kbd", { hasText: /^R$/ }) });
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(
      (u) => u.pathname === "/api/profile/nat.geo" && u.search === "?reload",
      async (route) => {
        await held;
        await route.continue();
      },
    );
    const asked = page.waitForRequest((r) => r.url().endsWith("/api/profile/nat.geo?reload"));
    await page.keyboard.press("Shift+R");
    await asked;
    expect([
      await button.textContent(),
      await button.getAttribute("aria-busy"),
      await tiles(page).count(),
    ]).toEqual(["Reloading… R", "true", 8]);
    release();
    await button.getByText("Reloaded").waitFor();
    expect(pages().slice(calls)).toEqual(["/nat.geo/embed/", "/nat.geo/"]);
    expect([await tiles(page).count(), await foot(page)]).toEqual([
      8,
      "The newest 8: all Instagram shows without a login",
    ]);
    expect(await lselLayout(page)).toEqual(LSEL_LAYOUT);
    expect(await problems()).toEqual([]);
    await ctx.close();
  });

  test("a slow profile shows its first posts at once and the rest as they come", async () => {
    const { ctx, page, problems } = await open("#/nat.geo", { at: slowUrl });
    const progress = page.getByText(/^Loaded \d of the newest 8 posts/);
    await progress.waitFor();
    expect(await progress.textContent()).toMatch(
      /^Loaded [0-7] of the newest 8 posts, about one a second$/,
    );
    await page
      .getByText("The newest 8: all Instagram shows without a login")
      .waitFor({ timeout: 10_000 });
    expect([await tiles(page).count(), await progress.count()]).toEqual([8, 0]);
    // the posts that came in on their own moved nothing
    expect(await lselLayout(page)).toEqual(LSEL_LAYOUT);
    expect(await problems()).toEqual([]);
    await ctx.close();
  }, 20_000);

  test("on a phone the actions take one row, a tap opens the file in place of them and the grid, and Esc goes back", async () => {
    const { ctx, page, problems } = await open("#/nat.geo", { phone: true });
    await tiles(page).first().waitFor();
    const shown = () =>
      Promise.all([
        page.getByRole("list", { name: "Files" }).isVisible(),
        page.getByRole("region", { name: "Preview" }).isVisible(),
        page.locator(".bar").isVisible(),
      ]);
    expect(await shown()).toEqual([true, false, true]);
    const tops = await page
      .locator(".bar .lsel-action")
      .evaluateAll((bs: HTMLElement[]) =>
        bs.filter((b) => b.offsetParent !== null).map((b) => [b.textContent, b.offsetTop]),
      );
    expect(tops.map(([label]) => label)).toEqual(["Zip ticked z", "Zip all Z", "Reload R"]);
    expect(new Set(tops.map(([, top]) => top)).size).toBe(1);
    await tiles(page).nth(1).tap();
    expect([await shown(), await facts(page)]).toEqual([
      [false, true, false],
      "Photo · 1080 × 1350 · Oct 17, 3:00 PM",
    ]);
    expect(await lselLayout(page)).toEqual(LSEL_LAYOUT);
    await page.keyboard.press("Escape");
    expect(await shown()).toEqual([true, false, true]);
    expect(await problems()).toEqual([]);
    await ctx.close();
  });

  test("Z zips every file, each post in its own folder; profiles opened come back on 1 to 5, after a reload too", async () => {
    const { ctx, page, problems } = await open("#/patchy");
    await tiles(page).first().waitFor();
    const dir = mkdtempSync(join(tmpdir(), "grab-e2e-"));
    const [all] = await Promise.all([
      page.waitForEvent("download"),
      page.keyboard.press("Shift+Z"),
    ]);
    await all.saveAs(join(dir, "all.zip"));
    expect(Bun.spawnSync(["unzip", "-Z1", join(dir, "all.zip")]).stdout.toString()).toBe(
      "patchy_picture.jpg\nFine1/patchy_Fine1_1.jpg\n",
    );
    await page.goto(`${url()}#/quiet`, { waitUntil: "networkidle" });
    await page.getByText("No public posts").waitFor();
    const recent = () =>
      page.getByRole("navigation", { name: "Recent profiles" }).locator("button").allTextContents();
    expect(await recent()).toEqual(["quiet 1", "patchy 2"]);
    await page.reload({ waitUntil: "networkidle" });
    await page.keyboard.press("2");
    await page.locator(".who h2").getByText("Patchy").waitFor();
    expect([new URL(page.url()).hash, await recent()]).toEqual([
      "#/patchy",
      ["patchy 1", "quiet 2"],
    ]);
    expect(await lselLayout(page)).toEqual(LSEL_LAYOUT);
    expect(await problems()).toEqual([]);
    await ctx.close();
  });
});
