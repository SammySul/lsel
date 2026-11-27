// Saves, catch-up, tabs and sync, in real browsers against the real server. Run `bun run build` first.

import { expect, test } from "bun:test";
import { join } from "node:path";
import { eachBrowser, serveBuilt, watchPage } from "@sammysul/lsel/testing";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { keyId } from "../src/save/key.ts";
import { openSaves } from "../src/server/saves.ts";
import { syncRoutes } from "../src/server/sync.ts";

const TIMEOUT = 30_000;

// noon on a fixed day, so the saved times are the same in every run
const NOON = Date.UTC(2026, 10, 18, 12);

const address = serveBuilt(join(import.meta.dir, "../dist"), syncRoutes(openSaves(":memory:")));

/** The synced save's revision, as the service holds it now. */
async function revision(key: string): Promise<number> {
  // its own address, so polling doesn't spend the pages' rate limit
  const response = await fetch(`${address()}/save/${await keyId(key)}`, {
    headers: { authorization: `Bearer ${key}`, "cf-connecting-ip": "test" },
  });
  if (!response.ok) throw new Error(`the service answered ${response.status}`);
  return ((await response.json()) as { revision: number }).revision;
}

/** Stores a save as another device would. */
async function store(key: string, base: number, data: string): Promise<void> {
  const response = await fetch(`${address()}/save/${await keyId(key)}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${key}`, "cf-connecting-ip": "test" },
    body: JSON.stringify({ base, data }),
  });
  if (!response.ok) throw new Error(`the service answered ${response.status}`);
}

/** Waits up to 5 s for the service to move past `before`; a send from a page that is gone has no answer to wait on. */
async function moved(key: string, before: number): Promise<void> {
  const until = Date.now() + 5000;
  while ((await revision(key)) === before && Date.now() < until) await Bun.sleep(250);
}

/** The page's name, once start() has mounted the game. */
const mounted = (page: Page) => page.getByRole("heading", { level: 1 }).waitFor();

/** Opens the game in a context and watches its console; the context's clock is left as the caller set it. */
async function open(context: BrowserContext, query = "") {
  const page = await context.newPage();
  const watch = watchPage(page);
  await page.goto(address() + query);
  await mounted(page);
  return { page, problems: () => watch.take() };
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

eachBrowser((browser) => {
  /** A device at `now` with its clock stopped, 30 s into seed 7, with sync turned on. */
  async function syncedDevice(now: number) {
    const context = await browser().newContext();
    await context.clock.install({ time: now });
    await context.clock.pauseAt(now + 1000);
    const { page, problems } = await open(context, "?seed=7");
    await page.keyboard.press("Enter");
    await context.clock.fastForward(30_000);
    await page.keyboard.press("o");
    await page.getByRole("button", { name: "Turn on sync" }).click();
    await page.getByText(/^Synced at/).waitFor();
    return { context, page, problems, key: await page.getByLabel("Save key").inputValue() };
  }

  /** A second device on seed 8, linked with `key`, that chose the synced save. */
  async function linkedDevice(key: string) {
    const context = await browser().newContext();
    const { page, problems } = await open(context, "?seed=8");
    await page.keyboard.press("o");
    await page.getByLabel("Or link this device with the key from another").fill(key);
    await page.getByRole("button", { name: "Link this device" }).click();
    await page.getByRole("button", { name: "Use the synced one" }).click();
    await page.getByText("Iron ore 10").waitFor();
    return { context, page, problems };
  }

  test(
    "the game is saved in the browser and is there after a reload",
    async () => {
      const context = await stopped(browser(), 60_000);
      const { page, problems } = await open(context, "?seed=7");
      expect(await texts(page, ".saved")).toEqual(["Not saved yet"]);
      await page.keyboard.press("Enter");
      await context.clock.fastForward(30_000);
      expect(await texts(page, ".stock li")).toEqual([
        "Credits 0",
        "Iron ore 10",
        "Ice 0",
        "Rations 0",
      ]);
      expect((await texts(page, ".saved"))[0]).toMatch(/^Saved \d{1,2}:\d\d (AM|PM)$/);
      await page.reload();
      await mounted(page);
      expect([await texts(page, ".stock li"), await texts(page, ".crew li")]).toEqual([
        ["Credits 0", "Iron ore 10", "Ice 0", "Rations 0"],
        ["Ana Petrov everything +3% › Mining"],
      ]);
      expect(await problems()).toEqual([]);
      await context.close();
    },
    TIMEOUT,
  );

  test(
    "two hours away are caught up on when the game opens again, and summed up",
    async () => {
      const context = await stopped(browser(), 60_000);
      const { page } = await open(context, "?seed=7");
      await page.keyboard.press("Enter");
      await page.close();
      await context.clock.setSystemTime(NOON + 60_000 + 2 * 60 * 60_000);

      const { page: again, problems } = await open(context);
      const panel = again.getByRole("complementary", { name: "While you were away" });
      await panel.waitFor();
      const lines = await texts(again, "[aria-label='While you were away'] li");
      // mining stops once the Hold has 500 iron ore
      expect([await texts(again, "[aria-label='While you were away'] > p"), lines]).toEqual([
        ["2:00:00"],
        ["Mining level 1 to 17", "Made 500 iron ore", "The Hold is full of iron ore"],
      ]);
      expect(await texts(again, ".stock li")).toEqual([
        "Credits 0",
        "Iron ore 500 full",
        "Ice 0",
        "Rations 0",
      ]);
      await again.keyboard.press("Escape");
      expect([await panel.count(), await problems()]).toEqual([0, []]);
      await context.close();
    },
    TIMEOUT,
  );

  test(
    "a computer that sleeps with the game open catches up when it wakes",
    async () => {
      const context = await stopped(browser(), 60_000);
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
        await problems(),
      ]).toEqual([[expect.stringMatching(/^2:00:0\d$/)], "Mining level 1 to 17", []]);
      await context.close();
    },
    TIMEOUT,
  );

  test(
    "a save exported as text replaces the game in another browser",
    async () => {
      const first = await stopped(browser(), 60_000);
      const { page } = await open(first, "?seed=7");
      await page.keyboard.press("Enter");
      await first.clock.fastForward(30_000);
      await page.keyboard.press("o");
      const text = await page.getByLabel("This save as text").inputValue();
      expect(text).toMatch(/^lsel-station:[A-Za-z0-9+/=]+$/);

      const second = await stopped(browser(), 90_000);
      const { page: other, problems } = await open(second, "?seed=8");
      await other.keyboard.press("o");
      const paste = other.getByLabel("Load a save from text");
      await paste.fill("lsel-station:nonsense");
      await paste.blur();
      expect([
        await paste.getAttribute("aria-invalid"),
        await other.getByText("That cannot be loaded: the text is damaged.").count(),
      ]).toEqual(["true", 1]);
      await paste.fill(text);
      await other.getByRole("button", { name: "Replace this game" }).click();
      await other.waitForLoadState("networkidle");
      await other.getByText("Iron ore 10").waitFor();
      expect(await texts(other, ".crew li")).toEqual(["Ana Petrov everything +3% › Mining"]);
      expect(await problems()).toEqual([]);
      await first.close();
      await second.close();
    },
    TIMEOUT,
  );

  test(
    "a second tab only shows the game, and takes over when the first one closes",
    async () => {
      const context = await browser().newContext();
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
      expect(await texts(second, ".crew li")).toEqual(["Ana Petrov everything +3% › Mining"]);

      await first.close();
      await second.getByRole("complementary", { name: "Read only" }).waitFor({ state: "detached" });
      await second.waitForLoadState("networkidle");
      await second.keyboard.press("x");
      expect([await texts(second, ".crew li"), await problems()]).toEqual([
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
      const { context: first, page, key } = await syncedDevice(now);
      expect([key, await texts(page, ".saved")]).toEqual([
        expect.stringMatching(/^[A-Za-z0-9_-]{32}$/),
        [expect.stringMatching(/^Saved .+, synced$/)],
      ]);

      const second = await browser().newContext();
      const { page: other, problems } = await open(second, "?seed=8");
      await other.keyboard.press("o");
      await other.getByLabel("Or link this device with the key from another").fill("not a key");
      await other.getByRole("button", { name: "Link this device" }).click();
      await other.getByText("That is not a save key.").waitFor();
      expect(
        await other
          .getByLabel("Or link this device with the key from another")
          .getAttribute("aria-invalid"),
      ).toBe("true");
      await other
        .getByLabel("Or link this device with the key from another")
        .fill(key.replace(/^./, (c) => (c === "A" ? "B" : "A")));
      await other.getByRole("button", { name: "Link this device" }).click();
      await other.getByText("No save has that key.").waitFor();
      // the browser logs the service's 404 for the wrong key, which is the point of that step
      await problems();

      await other.getByLabel("Or link this device with the key from another").fill(key);
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
      expect([await other.getByLabel("Save key").inputValue(), await problems()]).toEqual([
        key,
        [],
      ]);
      await first.close();
      await second.close();
    },
    TIMEOUT,
  );

  test(
    "devices that take turns hand the game over without asking",
    async () => {
      const now = Date.now();
      const { context: first, page, key } = await syncedDevice(now);
      await page.close();

      const { context: second, page: other, problems } = await linkedDevice(key);
      // the second device moves on: Ana stops mining, and the page is left while that is still being sent
      const before = await revision(key);
      await other.keyboard.press("x");
      expect(await texts(other, ".crew li")).toEqual(["Ana Petrov everything +3% › idle"]);
      const quiet = await problems();
      await other.goto("about:blank");
      // nobody waits for a send from a page that is gone, so the test waits for the service to have it
      await moved(key, before);

      // back on the first device, whose own save has not moved since it synced
      await first.clock.setSystemTime(now + 5 * 60_000);
      const { page: again, problems: later } = await open(first);
      await again.locator(".saved", { hasText: /, synced$/ }).waitFor();
      expect([
        await texts(again, ".crew li"),
        await again.getByRole("complementary", { name: "Choose a save" }).count(),
        quiet,
        await later(),
      ]).toEqual([["Ana Petrov everything +3% › idle"], 0, [], []]);
      await first.close();
      await second.close();
    },
    TIMEOUT,
  );

  test(
    "a change made just after a send goes out when the page is left at once",
    async () => {
      const now = Date.now();
      // the clock stands still, so nothing new is saved as the page goes away
      const { context: first, page, problems, key } = await syncedDevice(now);
      const before = await revision(key);
      // within 5 minutes of the last send, so only closing the page sends this
      await page.keyboard.press("x");
      expect(await texts(page, ".crew li")).toEqual(["Ana Petrov everything +3% › idle"]);
      const quiet = await problems();
      await page.goto("about:blank");
      await moved(key, before);

      const { context: second, page: other, problems: later } = await linkedDevice(key);
      expect([
        (await revision(key)) - before,
        await texts(other, ".crew li"),
        quiet,
        await later(),
      ]).toEqual([1, ["Ana Petrov everything +3% › idle"], [], []]);
      await first.close();
      await second.close();
    },
    TIMEOUT,
  );

  test(
    "the send the leaving page's own save starts, 5 minutes after the last, still lands",
    async () => {
      const now = Date.now();
      const { context: first, page, problems, key } = await syncedDevice(now);
      const before = await revision(key);
      await page.keyboard.press("x");
      // 6 minutes of idle ticks, with no save on the way: the save as the page is left starts the send
      await first.clock.setSystemTime(now + 31_000 + 6 * 60_000);
      await first.clock.fastForward(1000);
      const quiet = await problems();
      await page.goto("about:blank");
      await moved(key, before);

      const { context: second, page: other, problems: later } = await linkedDevice(key);
      expect([
        (await revision(key)) - before,
        await texts(other, ".crew li"),
        quiet,
        await later(),
      ]).toEqual([1, ["Ana Petrov everything +3% › idle"], [], []]);
      await first.close();
      await second.close();
    },
    TIMEOUT,
  );

  test(
    "sync stopped and turned on again while a send is out starts cleanly under the new key",
    async () => {
      const context = await browser().newContext();
      const { page, problems } = await open(context, "?seed=7");
      // the first send is held until sync has been stopped and turned on again
      let release = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let holding = true;
      await page.route("**/save/*", async (route) => {
        if (holding && route.request().method() === "PUT") {
          holding = false;
          await held;
        }
        await route.continue();
      });
      await page.keyboard.press("o");
      await page.getByRole("button", { name: "Turn on sync" }).click();
      const first = await page.getByLabel("Save key").inputValue();
      await page.getByRole("button", { name: "Stop syncing on this device" }).click();
      await page.getByRole("button", { name: "Turn on sync" }).click();
      release();
      await page.getByText(/^Synced at/).waitFor();
      const second = await page.getByLabel("Save key").inputValue();
      expect([second === first, await revision(second), await problems()]).toEqual([false, 1, []]);
      await context.close();
    },
    TIMEOUT,
  );

  test(
    "a save loaded from text while sync is on asks which save continues",
    async () => {
      const context = await stopped(browser(), 60_000);
      const { page, problems } = await open(context, "?seed=7");
      await page.keyboard.press("Enter");
      await context.clock.fastForward(30_000);
      await page.keyboard.press("o");
      const text = await page.getByLabel("This save as text").inputValue();
      await page.getByRole("button", { name: "Turn on sync" }).click();
      await page.getByText(/^Synced at/).waitFor();
      const key = await page.getByLabel("Save key").inputValue();
      // another device moves the synced save on
      await store(key, 1, text);

      await page.getByLabel("Load a save from text").fill(text);
      await page.getByRole("button", { name: "Replace this game" }).click();
      await page.getByRole("complementary", { name: "Choose a save" }).waitFor();
      expect(await problems()).toEqual([]);
      await context.close();
    },
    TIMEOUT,
  );

  test(
    "a save that cannot be read is kept aside, and a new game starts",
    async () => {
      const context = await browser().newContext();
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
      await page.reload();
      await mounted(page);
      expect(
        await page.evaluate(() => [
          localStorage.getItem("lsel-station.save.unreadable"),
          localStorage.getItem("lsel-station.save.unreadable.2"),
        ]),
      ).toEqual([
        '{"game":"lsel-station","version":1,"n":0}',
        '{"game":"lsel-station","version":1,"n":1}',
      ]);
      expect(await problems()).toEqual([]);
      await context.close();
    },
    TIMEOUT,
  );
});
