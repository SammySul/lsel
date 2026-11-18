// Saves, catch-up, tabs and sync, in real browsers against the real server. Run `bun run build` first.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  type Browser,
  type BrowserContext,
  chromium,
  firefox,
  type Page,
  webkit,
} from "playwright-core";
import { openSaves } from "../src/server/saves.ts";
import { handler } from "../src/server/server.ts";

const DIST = join(import.meta.dir, "../dist");
const ALL = { chromium, firefox, webkit };
const names = (process.env.BROWSERS?.split(",") ?? Object.keys(ALL)) as (keyof typeof ALL)[];
const TIMEOUT = 30_000;
// noon on a fixed day, so the saved times are the same in every run
const NOON = Date.UTC(2026, 10, 18, 12);

let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  if (!existsSync(join(DIST, "index.html"))) throw new Error("no dist/: run `bun run build` first");
  server = Bun.serve({
    port: 0,
    fetch: handler({ staticDir: DIST, saves: openSaves(":memory:") }),
  });
});

afterAll(() => {
  server?.stop(true);
});

/** Opens the game in a context and watches its console; the context's clock is left as the caller set it. */
async function open(context: BrowserContext, query = "") {
  const page = await context.newPage();
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`uncaught: ${e.message}`));
  await page.goto(server.url.href + query, { waitUntil: "networkidle" });
  return { page, problems };
}

async function texts(page: Page, selector: string): Promise<string[]> {
  return (await page.locator(selector).allTextContents()).map((t) => t.replace(/\s+/g, " ").trim());
}

/** A context whose clock stands still at noon plus `ms`, moved only by the test. */
async function stopped(browser: Browser, ms = 0) {
  const context = await browser.newContext();
  await context.clock.install({ time: NOON });
  await context.clock.pauseAt(NOON + ms);
  return context;
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
      "the game is saved in the browser and is there after a reload",
      async () => {
        const context = await stopped(browser, 60_000);
        const { page, problems } = await open(context, "?seed=7");
        expect(await texts(page, ".saved")).toEqual(["Not saved yet"]);
        await page.keyboard.press("Enter");
        await context.clock.fastForward(30_000);
        expect(await texts(page, ".stock li")).toEqual(["Iron ore 10"]);
        expect((await texts(page, ".saved"))[0]).toMatch(/^Saved \d{1,2}:\d\d (AM|PM)$/);
        await page.reload({ waitUntil: "networkidle" });
        expect([await texts(page, ".stock li"), await texts(page, "footer .crew")]).toEqual([
          ["Iron ore 10"],
          ["Ana Petrov everything +3% › Mining"],
        ]);
        expect(problems).toEqual([]);
        await context.close();
      },
      TIMEOUT,
    );

    test(
      "two hours away are caught up on when the game opens again, and summed up",
      async () => {
        const context = await stopped(browser, 60_000);
        const { page } = await open(context, "?seed=7");
        await page.keyboard.press("Enter");
        await page.close();
        await context.clock.setSystemTime(NOON + 60_000 + 2 * 60 * 60_000);

        const { page: again, problems } = await open(context);
        const panel = again.getByRole("complementary", { name: "While you were away" });
        await panel.waitFor();
        const lines = await texts(again, "[aria-label='While you were away'] li");
        expect([
          await texts(again, "[aria-label='While you were away'] > p"),
          lines.length,
          lines[0],
          lines[1],
        ]).toEqual([["2:00:00"], 2, "Mining level 1 to 33", "Made 2,798 iron ore"]);
        // the summary matches the game: what was made is in stock
        const made = Number(lines[1]?.replace(/\D/g, ""));
        expect(await texts(again, ".stock li")).toEqual([
          `Iron ore ${made.toLocaleString("en-US")}`,
        ]);
        await again.keyboard.press("Escape");
        expect([await panel.count(), problems]).toEqual([0, []]);
        await context.close();
      },
      TIMEOUT,
    );

    test(
      "a computer that sleeps with the game open catches up when it wakes",
      async () => {
        const context = await stopped(browser, 60_000);
        const { page, problems } = await open(context, "?seed=7");
        await page.keyboard.press("Enter");
        await context.clock.fastForward(1000);
        // the wall clock jumps while the page's timers and monotonic clock stood still
        await context.clock.setSystemTime(NOON + 60_000 + 1000 + 2 * 60 * 60_000);
        await context.clock.fastForward(1000);
        await page.getByRole("complementary", { name: "While you were away" }).waitFor();
        expect([
          await texts(page, "[aria-label='While you were away'] > p"),
          (await texts(page, "[aria-label='While you were away'] li"))[0],
          problems,
        ]).toEqual([[expect.stringMatching(/^2:00:0\d$/)], "Mining level 1 to 33", []]);
        await context.close();
      },
      TIMEOUT,
    );

    test(
      "a save exported as text replaces the game in another browser",
      async () => {
        const first = await stopped(browser, 60_000);
        const { page } = await open(first, "?seed=7");
        await page.keyboard.press("Enter");
        await first.clock.fastForward(30_000);
        await page.keyboard.press("o");
        const text = await page.locator("#export").inputValue();
        expect(text).toMatch(/^lsel-station:[A-Za-z0-9+/=]+$/);

        const second = await stopped(browser, 90_000);
        const { page: other, problems } = await open(second, "?seed=8");
        await other.keyboard.press("o");
        await other.locator("#import").fill("lsel-station:nonsense");
        expect(await texts(other, "[aria-label=Saves] p.note")).toEqual([
          "That cannot be loaded: the text is damaged.",
        ]);
        await other.locator("#import").fill(text);
        await other.getByRole("button", { name: "Replace this game" }).click();
        await other.waitForLoadState("networkidle");
        await other.getByText("Iron ore 10").waitFor();
        expect(await texts(other, "footer .crew")).toEqual(["Ana Petrov everything +3% › Mining"]);
        expect(problems).toEqual([]);
        await first.close();
        await second.close();
      },
      TIMEOUT,
    );

    test(
      "a second tab only shows the game, and takes over when the first one closes",
      async () => {
        const context = await browser.newContext();
        const { page: first } = await open(context);
        await first.keyboard.press("Enter");
        const { page: second, problems } = await open(context);
        expect([
          await texts(second, ".saved"),
          await texts(second, "[aria-label='Read only'] p"),
        ]).toEqual([
          ["Read only"],
          [
            "Lsel is open in another tab. This one only shows the game, and takes over when that tab closes.",
          ],
        ]);
        await second.keyboard.press("x");
        expect(await texts(second, "footer .crew")).toEqual(["Ana Petrov everything +3% › Mining"]);

        await first.close();
        await second
          .getByRole("complementary", { name: "Read only" })
          .waitFor({ state: "detached" });
        await second.waitForLoadState("networkidle");
        await second.keyboard.press("x");
        expect([await texts(second, "footer .crew"), problems]).toEqual([
          ["Ana Petrov everything +3% › idle"],
          [],
        ]);
        await context.close();
      },
      TIMEOUT,
    );

    test(
      "sync carries a save to another device, which chooses it over its own",
      async () => {
        const now = Date.now();
        const first = await browser.newContext();
        await first.clock.install({ time: now });
        await first.clock.pauseAt(now + 1000);
        const { page } = await open(first, "?seed=7");
        await page.keyboard.press("Enter");
        await first.clock.fastForward(30_000);
        await page.keyboard.press("o");
        await page.getByRole("button", { name: "Turn on sync" }).click();
        await page.getByText(/^Synced at/).waitFor();
        const key = await page.locator("#key").inputValue();
        expect([key, await texts(page, ".saved")]).toEqual([
          expect.stringMatching(/^[A-Za-z0-9_-]{32}$/),
          [expect.stringMatching(/^Saved .+, synced$/)],
        ]);

        const second = await browser.newContext();
        const { page: other, problems } = await open(second, "?seed=8");
        await other.keyboard.press("o");
        await other.locator("#join").fill("not a key");
        await other.getByRole("button", { name: "Link this device" }).click();
        expect(await texts(other, "[aria-label=Saves] span.note")).toEqual([
          "That is not a save key.",
        ]);
        await other.locator("#join").fill(key.replace(/^./, (c) => (c === "A" ? "B" : "A")));
        await other.getByRole("button", { name: "Link this device" }).click();
        await other.getByText("No save has that key.").waitFor();
        // the browser logs the service's 404 for the wrong key, which is the point of that step
        problems.length = 0;

        await other.locator("#join").fill(key);
        await other.getByRole("button", { name: "Link this device" }).click();
        const choice = other.getByRole("complementary", { name: "Choose a save" });
        await choice.waitFor();
        expect(await texts(other, "[aria-label='Choose a save'] dt")).toEqual([
          "This device",
          "Synced",
        ]);
        await other.getByRole("button", { name: "Use the synced one" }).click();
        await other.getByText("Iron ore 10").waitFor();
        await other.keyboard.press("o");
        expect([await other.locator("#key").inputValue(), problems]).toEqual([key, []]);
        await first.close();
        await second.close();
      },
      TIMEOUT,
    );

    test(
      "devices that take turns hand the game over without asking",
      async () => {
        const now = Date.now();
        const first = await browser.newContext();
        await first.clock.install({ time: now });
        await first.clock.pauseAt(now + 1000);
        const { page } = await open(first, "?seed=7");
        await page.keyboard.press("Enter");
        await first.clock.fastForward(30_000);
        await page.keyboard.press("o");
        await page.getByRole("button", { name: "Turn on sync" }).click();
        await page.getByText(/^Synced at/).waitFor();
        const key = await page.locator("#key").inputValue();
        await page.close();

        const second = await browser.newContext();
        const { page: other, problems } = await open(second, "?seed=8");
        await other.keyboard.press("o");
        await other.locator("#join").fill(key);
        await other.getByRole("button", { name: "Link this device" }).click();
        await other.getByRole("button", { name: "Use the synced one" }).click();
        await other.getByText("Iron ore 10").waitFor();
        // the second device moves on: Ana stops mining, and that is sent at once
        await other.keyboard.press("x");
        await other.getByText(/, synced$/).waitFor();
        expect(await texts(other, "footer .crew")).toEqual(["Ana Petrov everything +3% › idle"]);
        await other.close();

        // back on the first device, whose own save has not moved since it synced
        await first.clock.setSystemTime(now + 5 * 60_000);
        const { page: again, problems: later } = await open(first);
        await again.getByText(/, synced$/).waitFor();
        expect([
          await texts(again, "footer .crew"),
          await again.getByRole("complementary", { name: "Choose a save" }).count(),
          problems,
          later,
        ]).toEqual([["Ana Petrov everything +3% › idle"], 0, [], []]);
        await first.close();
        await second.close();
      },
      TIMEOUT,
    );

    test(
      "a save that cannot be read is kept aside, and a new game starts",
      async () => {
        const context = await browser.newContext();
        // the first load and one reload each find a damaged save
        await context.addInitScript(() => {
          const loads = Number(sessionStorage.getItem("loads") ?? 0);
          if (loads < 2)
            localStorage.setItem(
              "lsel-station.save",
              `{"game":"lsel-station","version":1,"n":${loads}}`,
            );
          sessionStorage.setItem("loads", String(loads + 1));
        });
        const { page, problems } = await open(context);
        expect([
          await texts(page, "[aria-label=Save] p"),
          await page.evaluate(() => localStorage.getItem("lsel-station.save.unreadable")),
        ]).toEqual([
          [
            "The save in this browser could not be read (savedAt is missing). It is kept aside, and this is a new game.",
          ],
          '{"game":"lsel-station","version":1,"n":0}',
        ]);
        await page.reload({ waitUntil: "networkidle" });
        expect(
          await page.evaluate(() => [
            localStorage.getItem("lsel-station.save.unreadable"),
            localStorage.getItem("lsel-station.save.unreadable.2"),
          ]),
        ).toEqual([
          '{"game":"lsel-station","version":1,"n":0}',
          '{"game":"lsel-station","version":1,"n":1}',
        ]);
        expect(problems).toEqual([]);
        await context.close();
      },
      TIMEOUT,
    );
  });
}
