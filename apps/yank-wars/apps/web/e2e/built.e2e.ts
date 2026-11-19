// The production build behind the real server's CSP. Run `bun run build` first.
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
import { CSP } from "../../server/src/server.ts";

const url = serveBuilt(join(import.meta.dir, "../dist"), undefined, { csp: CSP });

for (const name of browsers()) {
  describe(name, () => {
    let browser: Browser;
    beforeAll(async () => {
      browser = await launch(name);
    });
    afterAll(async () => {
      await browser?.close();
    });

    test("lsel's look, and CodeMirror styled under the server's CSP", async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const watch = watchPage(page);
      await page.goto(url(), { waitUntil: "networkidle" });
      expect(await lselLook(page)).toEqual(LSEL_LOOK);
      await page.goto(`${url()}#/p/indent-body`, { waitUntil: "networkidle" });
      await page.locator(".cm-editor").first().waitFor();
      // CodeMirror's base theme makes the editor `position: relative`, from a <style> it injects
      expect(
        await page.evaluate(
          () => getComputedStyle(document.querySelector(".cm-editor") as Element).position,
        ),
      ).toBe("relative");
      expect(await watch.take()).toEqual([]);
      await page.close();
    });
  });
}
