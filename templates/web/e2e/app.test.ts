// The built app in real browsers, served by the real server.
// Run `bun run build` first. Env: BROWSERS=chromium,firefox,webkit
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { type Browser, chromium, firefox, webkit } from "playwright-core";
import { name as project } from "../package.json";
import { handler } from "../src/server/server.ts";

const DIST = join(import.meta.dir, "../dist");
const ALL = { chromium, firefox, webkit };
const names = (process.env.BROWSERS?.split(",") ?? Object.keys(ALL)) as (keyof typeof ALL)[];

let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  if (!existsSync(join(DIST, "index.html"))) throw new Error("no dist/: run `bun run build` first");
  server = Bun.serve({ port: 0, fetch: handler(DIST) });
});

afterAll(() => {
  server?.stop(true);
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

    test("the page renders in lsel's look under the strict CSP, with a quiet console", async () => {
      const page = await browser.newPage();
      const problems: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error" || m.type() === "warning")
          problems.push(`${m.type()}: ${m.text()}`);
      });
      page.on("pageerror", (e) => problems.push(`uncaught: ${e.message}`));
      await page.goto(server.url.href, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);

      expect(await page.getByRole("heading", { level: 1 }).textContent()).toBe(project);
      const look = await page.evaluate(() => ({
        background: getComputedStyle(document.body).backgroundColor,
        fontLoaded: document.fonts.check('14px "JetBrains Mono"'),
      }));
      expect(look).toEqual({ background: "rgb(18, 18, 18)", fontLoaded: true });
      expect(problems).toEqual([]);
    });
  });
}
