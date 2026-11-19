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
import { name as project } from "../package.json";

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

    test("the page renders in lsel's look under the strict CSP, with a quiet console", async () => {
      const page = await browser.newPage();
      const watch = watchPage(page);
      await page.goto(url(), { waitUntil: "networkidle" });
      expect(await page.getByRole("heading", { level: 1 }).textContent()).toBe(project);
      expect(await lselLook(page)).toEqual(LSEL_LOOK);
      expect(await watch.take()).toEqual([]);
    });
  });
}
