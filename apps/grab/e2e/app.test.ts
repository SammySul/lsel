// Instagram is fakeInstagram, injected as fetch. Run `bun run build` first.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eachBrowser, LSEL_LOOK, lselLook, serveBuilt, watchPage } from "@sammysul/lsel/testing";
import type { BrowserContext, Page } from "playwright-core";
import { api } from "../src/server/api.ts";
import { fakeInstagram, WORLD } from "../src/server/fakeInstagram.ts";
import { Instagram } from "../src/server/instagram.ts";

const DIST = join(import.meta.dir, "../dist");
const fake = fakeInstagram(WORLD);
const url = serveBuilt(
  DIST,
  api({ instagram: new Instagram({ fetch: fake.fetch, gap: 0, retryWait: 0 }), fetch: fake.fetch }),
);
// its own cache, so a refusal isn't hidden by a profile another test loaded
const moody = fakeInstagram(WORLD);
const moodyUrl = serveBuilt(
  DIST,
  api({
    instagram: new Instagram({ fetch: moody.fetch, gap: 0, retryWait: 0 }),
    fetch: moody.fetch,
  }),
);
const throttled = fakeInstagram(WORLD);
const throttledUrl = serveBuilt(
  DIST,
  api({
    instagram: new Instagram({ fetch: throttled.fetch, gap: 0, retryWait: 0 }),
    fetch: throttled.fetch,
  }),
);

// slow enough that the first answer comes before the posts are all in
const slow = fakeInstagram(WORLD);
const slowUrl = serveBuilt(
  DIST,
  api({
    instagram: new Instagram({ fetch: slow.fetch, gap: 300, retryWait: 0 }),
    fetch: slow.fetch,
  }),
);

afterEach(() => {
  moody.state.fail = undefined;
  throttled.state.limitAfter = undefined;
});

eachBrowser((browser) => {
  async function open(
    hash = "",
    at = url,
  ): Promise<{ ctx: BrowserContext; page: Page; problems: () => Promise<string[]> }> {
    const ctx = await browser().newContext({
      timezoneId: "UTC",
      acceptDownloads: true,
      viewport: { width: 1280, height: 900 },
    });
    const page = await ctx.newPage();
    const watch = watchPage(page);
    await page.goto(`${at()}${hash}`, { waitUntil: "networkidle" });
    return { ctx, page, problems: () => watch.take() };
  }

  const tiles = (page: Page) => page.locator('[aria-label="Files"] > li');
  const currentTile = (page: Page) =>
    page.locator('[aria-label="Files"] > li[aria-current="true"]').getAttribute("aria-label");
  const facts = (page: Page) => page.locator(".facts").textContent();
  const ticked = (page: Page) => page.locator(".count").textContent();

  test("lsel's look under the strict CSP, every tile's image drawn through the server", async () => {
    const { ctx, page, problems } = await open("#/nat.geo");
    await tiles(page).first().waitFor();
    expect(await lselLook(page)).toEqual(LSEL_LOOK);
    expect(await tiles(page).count()).toBe(11);
    const drawn = await page
      .locator('[aria-label="Files"] img')
      .evaluateAll((imgs: HTMLImageElement[]) =>
        Promise.all(imgs.map((i) => i.decode().then(() => i.naturalWidth))),
      );
    expect(drawn).toEqual(new Array(11).fill(1));
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
    expect(await page.locator(".who .sub").textContent()).toBe(
      "nat.geo · verified · 267,196,027 followers · 800 posts",
    );
    expect(await page.getByText("The newest 8").textContent()).toBe(
      "The newest 8: all Instagram shows without a login.",
    );
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
      "Profile picture · 150 × 150",
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
    expect(await currentTile(page)).toBe("Photo, post Photo8");
    await tiles(page).nth(2).click();
    expect(await currentTile(page)).toBe("Photo 1 of 3 in post Car-ousel2");
    expect(await problems()).toEqual([]);
    await ctx.close();
  });

  test("ticked files download as one zip; d downloads the current one under its name", async () => {
    const { ctx, page, problems } = await open("#/nat.geo");
    await tiles(page).first().waitFor();
    const zip = page.getByRole("button", { name: /Download ticked as zip/ });
    expect([await ticked(page), await zip.isDisabled()]).toEqual(["0 of 11 files ticked", true]);
    await page.keyboard.press("x");
    await page.keyboard.press("l");
    await page.keyboard.press("l");
    await page.keyboard.press("l");
    await page.keyboard.press("l");
    await page.keyboard.press(" ");
    await tiles(page).nth(10).locator("input").check();
    expect(await ticked(page)).toBe("3 of 11 files ticked");
    const dir = mkdtempSync(join(tmpdir(), "grab-e2e-"));
    const [archive] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("z")]);
    expect(archive.suggestedFilename()).toBe("nat.geo.zip");
    await archive.saveAs(join(dir, "a.zip"));
    expect(Bun.spawnSync(["unzip", "-Z1", join(dir, "a.zip")]).stdout.toString()).toBe(
      "nat.geo_picture.jpg\nnat.geo_Car-ousel2_3.mp4\nnat.geo_Photo8_1.jpg\n",
    );
    const [one] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("d")]);
    expect(one.suggestedFilename()).toBe("nat.geo_Car-ousel2_3.mp4");
    await page.keyboard.press("a");
    expect(await ticked(page)).toBe("11 of 11 files ticked");
    await page.keyboard.press("n");
    expect([await ticked(page), await zip.isDisabled()]).toEqual(["0 of 11 files ticked", true]);
    expect(await problems()).toEqual([]);
    await ctx.close();
  });

  test("a missing post, an empty profile and an unknown name each say so", async () => {
    const { ctx, page, problems } = await open("#/patchy");
    await page.locator(".missing").waitFor();
    expect(await page.locator(".missing").textContent()).toBe(
      "1 post couldn't be loaded from Instagram.",
    );
    expect(await tiles(page).count()).toBe(2);
    await page.goto(`${url()}#/quiet`, { waitUntil: "networkidle" });
    await page.locator(".lsel-empty").waitFor();
    expect(await page.locator(".lsel-empty").textContent()).toBe(
      "No public posts. The account may be private or have none yet; its picture is below.",
    );
    expect(await tiles(page).count()).toBe(1);
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

  test("a rate limit is a message with r to retry, and r brings the profile", async () => {
    moody.state.fail = 429;
    const { ctx, page } = await open("#/nat.geo", moodyUrl);
    const alert = page.getByRole("alert");
    await alert.waitFor();
    expect((await alert.textContent())?.replace(/\s+/g, " ").trim()).toBe(
      "Instagram is rate limiting; try again in a few minutes. r retries.",
    );
    moody.state.fail = undefined;
    await page.keyboard.press("r");
    await page.locator(".who h2").waitFor();
    expect([await alert.count(), await tiles(page).count()]).toEqual([0, 11]);
    await ctx.close();
  });

  test("cut short by Instagram's rate limit: what came, a line saying so, and r loads the rest", async () => {
    throttled.state.limitAfter = 3;
    const { ctx, page, problems } = await open("#/nat.geo", throttledUrl);
    const line = page.locator(".missing");
    await line.waitFor();
    expect((await line.textContent())?.replace(/\s+/g, " ").trim()).toBe(
      "Instagram is limiting this server, so 5 posts didn't load. r loads the rest; if it stops again, wait a few minutes.",
    );
    // the picture, the pinned photo, the carousel's three and the reel
    expect(await tiles(page).count()).toBe(6);
    throttled.state.limitAfter = undefined;
    await page.keyboard.press("r");
    await line.waitFor({ state: "detached" });
    expect(await tiles(page).count()).toBe(11);
    expect(await problems()).toEqual([]);
    await ctx.close();
  });

  test("a slow profile shows its first posts at once and the rest as they come", async () => {
    const { ctx, page, problems } = await open("#/nat.geo", slowUrl);
    const progress = page.getByText(/^Loaded \d of the newest 8 posts/);
    await progress.waitFor();
    expect(await progress.textContent()).toMatch(
      /^Loaded [1-7] of the newest 8 posts; Instagram answers about one a second\.$/,
    );
    expect(await tiles(page).count()).toBeLessThan(11);
    await page
      .getByText("The newest 8: all Instagram shows without a login.")
      .waitFor({ timeout: 10_000 });
    expect([await tiles(page).count(), await progress.count()]).toEqual([11, 0]);
    expect(await problems()).toEqual([]);
    await ctx.close();
  }, 20_000);
});
