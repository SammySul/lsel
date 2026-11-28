// Page's glitch and the scanlines over every page: when the glitch fires, what it leaves alone, and the lines' rows. Run `bun run build` first.
import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import { join } from "node:path";
import type { Browser, Page } from "playwright-core";
import {
  eachBrowser,
  LSEL_LAYOUT,
  lselLayout,
  serveBuilt,
  watchPage,
} from "../src/lib/testing/index.ts";

setDefaultTimeout(20_000);

const url = serveBuilt(join(import.meta.dir, "../playground-dist"));

/** The frame's filter, and the title as text and as the accessibility tree names it. */
const look = async (page: Page) => ({
  filter: await page.locator("main").evaluate((m) => getComputedStyle(m).filter),
  text: await page.locator("h1").textContent(),
  name: await page.locator("h1").ariaSnapshot(),
});

const GLITCHING = {
  filter: 'url("#lsel-glitch")',
  text: "lsel kit",
  name: '- heading "lsel kit" [level=1]',
};
const STILL = { ...GLITCHING, filter: "none" };

/** Columns of a screenshot as the red channel, decoded on a blank page (the app's CSP would refuse the image). */
async function columns(browser: Browser, png: Buffer, xs: ("left" | "mid" | "right")[]) {
  const blank = await browser.newPage();
  const out = await blank.evaluate(
    async ({ b64, xs }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const canvas = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
      ctx.drawImage(bmp, 0, 0);
      const data = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
      const at = { left: 0, mid: bmp.width >> 1, right: bmp.width - 1 };
      return xs.map((x) =>
        Array.from({ length: bmp.height }, (_, y) => data[(y * bmp.width + at[x]) * 4] ?? 0),
      );
    },
    { b64: png.toString("base64"), xs },
  );
  await blank.close();
  return out;
}

/** A row is light (L) where it is brighter than a darker neighbor by more than the vignette's step, dark (D) otherwise. */
const rows = (column: number[], from: number, to: number) =>
  column
    .slice(from, to)
    .map((v, i) => {
      const y = from + i;
      const near = Math.min(column[y - 1] ?? 255, column[y + 1] ?? 255);
      return v * 0.95 > near ? "L" : "D";
    })
    .join("");

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

  test("the app opening and a route change filter the frame for 150 ms, leaving the title's text and name", async () => {
    const { page, problems } = await open("no-preference");
    expect(await look(page)).toEqual(GLITCHING);
    await page.clock.runFor(149);
    expect(await look(page)).toEqual(GLITCHING);
    await page.clock.runFor(1);
    expect(await look(page)).toEqual(STILL);
    await page.keyboard.press("6");
    expect(page.url()).toEndWith("#/grid");
    expect(await look(page)).toEqual(GLITCHING);
    await page.clock.runFor(150);
    expect(await look(page)).toEqual(STILL);
    expect(await lselLayout(page)).toEqual(LSEL_LAYOUT);
    expect(await problems()).toEqual([]);
  });

  test("a route change right after typing in a field doesn't glitch", async () => {
    const { page, problems } = await open("no-preference");
    await page.clock.runFor(150);
    await page.getByRole("searchbox", { name: "Search feeds" }).pressSequentially("al");
    await page.evaluate(() => {
      location.hash = "#/states";
    });
    await page.getByRole("region", { name: "States" }).waitFor();
    expect((await look(page)).filter).toBe("none");
    expect(await problems()).toEqual([]);
  });

  test("under reduced motion nothing glitches", async () => {
    const { page, problems } = await open("reduce");
    expect(await look(page)).toEqual(STILL);
    await page.keyboard.press("6");
    await page.getByRole("region", { name: "Grid" }).waitFor();
    expect(await look(page)).toEqual(STILL);
    expect(await lselLayout(page)).toEqual(LSEL_LAYOUT);
    expect(await problems()).toEqual([]);
  });

  for (const scale of [1, 2]) {
    test(`at ${scale}x the lines cover the window in rows of 3 device pixels, dimmed 9% twice in three and vignetted, and clicks pass through`, async () => {
      const page = await browser().newPage({
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: scale,
        reducedMotion: "reduce",
      });
      // Playwright's WebKit screenshots add a stylesheet of their own, which the CSP refuses
      const watch = watchPage(page, { ignore: /Refused to apply a stylesheet/ });
      await page.goto(url());
      const keys = page.getByRole("button", { name: "Keys" });
      const box = await keys.boundingBox();
      if (box === null) throw new Error("no Keys button");
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      expect(await keys.getAttribute("aria-pressed")).toBe("false");
      // a white sheet over the page and under the lines, so their rows read at full depth
      await page.evaluate(() => {
        const sheet = document.createElement("div");
        Object.assign(sheet.style, {
          position: "fixed",
          inset: "0",
          zIndex: "1000",
          background: "#fff",
        });
        document.body.append(sheet);
      });
      const [left = [], mid = [], right = []] = await columns(browser(), await page.screenshot(), [
        "left",
        "mid",
        "right",
      ]);
      const h = 800 * scale;
      const bottom = scale === 1 ? "DDLDDL" : "LDDLDD";
      expect({
        top: [rows(left, 0, 6), rows(mid, 0, 6), rows(right, 0, 6)],
        bottom: [rows(left, h - 6, h), rows(mid, h - 6, h), rows(right, h - 6, h)],
        center: mid.slice(h / 2 - 1, h / 2 + 2).map((v) => Math.round((v / 255) * 100) / 100),
        corner: Math.round((Math.max(...right.slice(h - 3)) / 255) * 100) / 100,
      }).toEqual({
        top: ["DLDDLD", "DLDDLD", "DLDDLD"],
        bottom: [bottom, bottom, bottom],
        center: scale === 1 ? [0.91, 1, 0.91] : [1, 0.91, 0.91],
        corner: 0.8,
      });
      expect(await watch.take()).toEqual([]);
    });
  }
});
