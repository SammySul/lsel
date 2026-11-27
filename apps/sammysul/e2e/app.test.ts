// Run `bun run build` first.
import { expect, test } from "bun:test";
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

const url = serveBuilt(join(import.meta.dir, "../dist"));

eachBrowser((browser) => {
  test("lists every project with its link, in lsel's look, with a quiet console", async () => {
    const page = await browser().newPage();
    const watch = watchPage(page);
    await page.goto(url());
    const links = page.locator('ul[aria-label="Projects"] a');
    await links.first().waitFor();
    expect(await links.allTextContents()).toEqual([
      "typ",
      "yank-wars",
      "lsel-station",
      "dajaj",
      "grab",
      "lsel",
    ]);
    expect(await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")))).toEqual([
      "https://typ.sammysul.com",
      "https://yankwars.app",
      "https://lsel-station.sammysul.com",
      "https://dajaj.sammysul.com",
      "https://grab.sammysul.com",
      "https://git.sammysul.com/SammySul/lsel",
    ]);
    expect(await lselLook(page)).toEqual(LSEL_LOOK);
    expect(await lselLayout(page)).toEqual(LSEL_LAYOUT);
    expect(await watch.take()).toEqual([]);
    await page.close();
  });

  test("on a phone every project is two lines, its description cut to one, and the list fills the window", async () => {
    const page = await browser().newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(url());
    const rows = page.locator('ul[aria-label="Projects"] li');
    await rows.first().waitFor();
    // a name and a description, 21 each, with the row's padding and border: 59, fillers too
    expect(
      await rows.evaluateAll((all) =>
        all.map((li) => Math.round(li.getBoundingClientRect().height)),
      ),
    ).toEqual(Array(9).fill(59));
    expect(await page.locator(".what").first().getAttribute("title")).toBe(
      "Compare fonts side by side on your own text, in your browser",
    );
    await page.close();
  });

  test("j selects the next project and Enter opens it", async () => {
    const page = await browser().newPage();
    await page.route("https://yankwars.app/**", (route) =>
      route.fulfill({ contentType: "text/plain", body: "yank-wars" }),
    );
    await page.goto(url());
    await page.locator('ul[aria-label="Projects"]').waitFor();
    await page.keyboard.press("j");
    expect(
      await page.locator('ul[aria-label="Projects"] li[aria-current="true"] a').textContent(),
    ).toBe("yank-wars");
    await page.keyboard.press("Enter");
    await page.waitForURL("https://yankwars.app/");
    await page.close();
  });
});
