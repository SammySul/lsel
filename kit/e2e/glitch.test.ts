// Page's glitch: when it fires, what it leaves alone, and that reduced motion has none. Run `bun run build` first.
import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import { join } from "node:path";
import type { Page } from "playwright-core";
import {
  eachBrowser,
  LSEL_LAYOUT,
  lselLayout,
  serveBuilt,
  watchPage,
} from "../src/lib/testing/index.ts";

setDefaultTimeout(20_000);

const url = serveBuilt(join(import.meta.dir, "../playground-dist"));

/** Whether the glitch is on, its frame drawn, and the title as text and as the accessibility tree names it. */
const look = async (page: Page) => ({
  on: await page.locator("main.glitch").count(),
  frame: await page.locator(".lsel-glitch").count(),
  text: await page.locator("h1").textContent(),
  name: await page.locator("h1").ariaSnapshot(),
});

eachBrowser((browser) => {
  afterEach(async () => {
    await Promise.all(
      browser()
        .contexts()
        .flatMap((c) => c.pages().map((p) => p.close())),
    );
  });

  // the page's clock stands still, so a glitch stays on until the test moves it
  async function open(reducedMotion: "reduce" | "no-preference") {
    const page = await browser().newPage({ reducedMotion });
    const watch = watchPage(page);
    await page.clock.install({ time: 0 });
    await page.clock.pauseAt(1000);
    await page.goto(url());
    await page.locator('ul[aria-label="Feeds"]').waitFor();
    return { page, problems: () => watch.take() };
  }

  test("the app opening and a route change glitch the title and frame, for 200 ms, leaving the title's text and name", async () => {
    const { page, problems } = await open("no-preference");
    const glitching = { on: 1, frame: 1, text: "lsel kit", name: '- heading "lsel kit" [level=1]' };
    const still = { on: 0, frame: 0, text: "lsel kit", name: '- heading "lsel kit" [level=1]' };
    expect(await look(page)).toEqual(glitching);
    await page.clock.runFor(199);
    expect(await look(page)).toEqual(glitching);
    await page.clock.runFor(1);
    expect(await look(page)).toEqual(still);
    await page.keyboard.press("6");
    expect(page.url()).toEndWith("#/grid");
    expect(await look(page)).toEqual(glitching);
    await page.clock.runFor(200);
    expect(await look(page)).toEqual(still);
    expect(await lselLayout(page)).toEqual(LSEL_LAYOUT);
    expect(await problems()).toEqual([]);
  });

  test("a route change right after typing in a field doesn't glitch", async () => {
    const { page, problems } = await open("no-preference");
    await page.clock.runFor(200);
    await page.getByRole("searchbox", { name: "Search feeds" }).pressSequentially("al");
    await page.evaluate(() => {
      location.hash = "#/states";
    });
    await page.getByRole("region", { name: "States" }).waitFor();
    expect((await look(page)).on).toBe(0);
    expect(await problems()).toEqual([]);
  });

  test("under reduced motion nothing glitches", async () => {
    const { page, problems } = await open("reduce");
    expect((await look(page)).on).toBe(0);
    await page.keyboard.press("6");
    await page.getByRole("region", { name: "Grid" }).waitFor();
    expect(await look(page)).toEqual({
      on: 0,
      frame: 0,
      text: "lsel kit",
      name: '- heading "lsel kit" [level=1]',
    });
    expect(await lselLayout(page)).toEqual(LSEL_LAYOUT);
    expect(await problems()).toEqual([]);
  });
});
