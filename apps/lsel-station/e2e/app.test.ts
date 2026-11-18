// The built game in real browsers, served by the real server.
// Run `bun run build` first. Env: BROWSERS=chromium,firefox,webkit
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { type Browser, chromium, firefox, type Page, webkit } from "playwright-core";
import { handler } from "../src/server/server.ts";
import { PALETTE } from "../src/web/scene/palette.ts";

const DIST = join(import.meta.dir, "../dist");
const ALL = { chromium, firefox, webkit };
const names = (process.env.BROWSERS?.split(",") ?? Object.keys(ALL)) as (keyof typeof ALL)[];

const TIMEOUT = 30_000;

let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  if (!existsSync(join(DIST, "index.html"))) throw new Error("no dist/: run `bun run build` first");
  server = Bun.serve({ port: 0, fetch: handler(DIST) });
});

afterAll(() => {
  server?.stop(true);
});

/** Opens the game with its clock stopped, so a test moves time by exact amounts. */
async function open(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`uncaught: ${e.message}`));
  await page.clock.install({ time: 0 });
  await page.goto(server.url.href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.clock.pauseAt(60_000);
  return problems;
}

/** The scene's size and the distinct colors in it, as hex. */
function scene(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) throw new Error("no scene canvas");
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const colors = new Set<string>();
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const rgb = ((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0);
      colors.add(`#${rgb.toString(16).padStart(6, "0")}`);
      sum = (Math.imul(sum, 31) + rgb) | 0;
    }
    return {
      colors: [...colors],
      sum,
      scale: [canvas.clientWidth / canvas.width, canvas.clientHeight / canvas.height],
    };
  });
}

for (const name of names) {
  describe(name, () => {
    let browser: Browser;
    beforeAll(async () => {
      browser = await ALL[name].launch({ headless: true });
    });
    afterAll(async () => {
      await browser?.close();
    });

    test(
      "the page is in lsel's look under the strict CSP, with a quiet console",
      async () => {
        const page = await browser.newPage();
        const problems = await open(page);
        expect(await page.getByRole("heading", { level: 1 }).textContent()).toBe("Lsel");
        const look = await page.evaluate(() => ({
          background: getComputedStyle(document.body).backgroundColor,
          fontLoaded: document.fonts.check('14px "JetBrains Mono"'),
        }));
        expect(look).toEqual({ background: "rgb(18, 18, 18)", fontLoaded: true });
        expect(problems).toEqual([]);
      },
      TIMEOUT,
    );

    test(
      "Enter puts the crew on the iron asteroid: 1 ore every 3 s, level 2 after 12",
      async () => {
        const page = await browser.newPage();
        const problems = await open(page);
        const read = async () =>
          (await page.locator(".stock, section header, .xp, footer").allTextContents()).map((t) =>
            t.replace(/\s+/g, " ").trim(),
          );
        expect(await read()).toEqual([
          "Iron ore 0",
          "Mining Lv 1",
          "xp 0 / 60",
          "Ana Petrov › idle",
        ]);

        await page.keyboard.press("Enter");
        await page.clock.fastForward(2800);
        expect(await read()).toEqual([
          "Iron ore 0",
          "Mining Lv 1",
          "xp 0 / 60",
          "Ana Petrov › Mining",
        ]);
        await page.clock.fastForward(200);
        expect(await read()).toEqual([
          "Iron ore 1",
          "Mining Lv 1",
          "xp 5 / 60",
          "Ana Petrov › Mining",
        ]);
        await page.clock.fastForward(33_000);
        expect(await read()).toEqual([
          "Iron ore 12",
          "Mining Lv 2",
          "xp 60 / 126",
          "Ana Petrov › Mining",
        ]);

        await page.getByRole("button", { name: "Stop" }).click();
        await page.clock.fastForward(6000);
        expect(await read()).toEqual([
          "Iron ore 12",
          "Mining Lv 2",
          "xp 60 / 126",
          "Ana Petrov › idle",
        ]);
        expect(problems).toEqual([]);
      },
      TIMEOUT,
    );

    test(
      "the scene uses only its palette, at a whole-number scale, and shows the job",
      async () => {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        await open(page);
        const label = () => page.getByRole("img").getAttribute("aria-label");
        expect(await label()).toBe("The station in orbit above a planet. The drone is docked.");

        const palette: string[] = Object.values(PALETTE);
        const idle = await scene(page);
        expect(idle.colors.filter((c) => !palette.includes(c))).toEqual([]);
        expect(idle.scale).toEqual([3, 3]);
        const shown = (colors: string[]) =>
          [PALETTE.hull, PALETTE.solar, PALETTE.planet2, PALETTE.rock, PALETTE.beam].filter((c) =>
            colors.includes(c),
          );
        expect(shown(idle.colors)).toEqual([
          PALETTE.hull,
          PALETTE.solar,
          PALETTE.planet2,
          PALETTE.rock,
        ]);

        await page.keyboard.press("Enter");
        await page.clock.fastForward(1500);
        const mining = await scene(page);
        expect(await label()).toBe(
          "The station in orbit above a planet. A drone is mining the iron asteroid.",
        );
        expect(shown(mining.colors)).toEqual([
          PALETTE.hull,
          PALETTE.solar,
          PALETTE.planet2,
          PALETTE.rock,
          PALETTE.beam,
        ]);
        expect(mining.colors.filter((c) => !palette.includes(c))).toEqual([]);
      },
      TIMEOUT,
    );

    test(
      "with reduced motion the scene holds still while the game runs",
      async () => {
        const page = await browser.newPage({ reducedMotion: "reduce" });
        await open(page);
        await page.keyboard.press("Enter");
        await page.clock.fastForward(1000);
        const before = await scene(page);
        await page.clock.fastForward(4000);
        const after = await scene(page);
        expect(await page.locator(".stock").textContent()).toContain("1");
        expect([before.colors.includes(PALETTE.beam), after.sum]).toEqual([true, before.sum]);
      },
      TIMEOUT,
    );
  });
}
