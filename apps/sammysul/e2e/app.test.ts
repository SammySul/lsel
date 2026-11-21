// Run `bun run build` first.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  browsers,
  LSEL_LOOK,
  launch,
  lselLook,
  serveBuilt,
  watchPage,
} from "@sammysul/lsel/testing";
import type { Browser } from "playwright-core";

const url = serveBuilt(join(import.meta.dir, "../dist"));

for (const name of browsers()) {
  describe(name, () => {
    let browser: Browser;
    beforeAll(async () => {
      browser = await launch(name);
    });
    afterAll(async () => {
      await browser?.close();
    });

    test("lists every project with its link, in lsel's look, with a quiet console", async () => {
      const page = await browser.newPage();
      const watch = watchPage(page);
      await page.goto(url(), { waitUntil: "networkidle" });
      const links = page.locator('ul[aria-label="Projects"] a');
      expect(await links.allTextContents()).toEqual([
        "typ",
        "yank-wars",
        "lsel-station",
        "dajaj",
        "lsel",
      ]);
      expect(await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")))).toEqual([
        "https://typ.sammysul.com",
        "https://yankwars.app",
        "https://lsel-station.sammysul.com",
        "https://dajaj.sammysul.com",
        "https://git.sammysul.com/SammySul/lsel",
      ]);
      expect(await lselLook(page)).toEqual(LSEL_LOOK);
      expect(await watch.take()).toEqual([]);
      await page.close();
    });

    test("j selects the next project and Enter opens it", async () => {
      const page = await browser.newPage();
      await page.route("https://yankwars.app/**", (route) =>
        route.fulfill({ contentType: "text/plain", body: "yank-wars" }),
      );
      await page.goto(url(), { waitUntil: "networkidle" });
      await page.keyboard.press("j");
      expect(
        await page.locator('ul[aria-label="Projects"] li[aria-current="true"] a').textContent(),
      ).toBe("yank-wars");
      await page.keyboard.press("Enter");
      await page.waitForURL("https://yankwars.app/");
      await page.close();
    });
  });
}
