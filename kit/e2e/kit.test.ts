// Served by the shared server, so the strict CSP applies. Run `bun run build` first.
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";
import { join } from "node:path";
import type { Browser, Page } from "playwright-core";
import { version } from "../package.json";
import { palette } from "../src/lib/assets/palette.ts";
import {
  browsers,
  LSEL_LOOK,
  launch,
  lselLook,
  serveBuilt,
  watchPage,
} from "../src/lib/testing/index.ts";

// real browsers, and actions that rest 2 s after they confirm
setDefaultTimeout(20_000);

const url = serveBuilt(join(import.meta.dir, "../playground-dist"));

const current = (page: Page) =>
  page.locator('ul[aria-label="Feeds"] li[aria-current="true"] span').textContent();
const status = (page: Page) => page.locator("p.said").textContent();

for (const name of browsers()) {
  describe(name, () => {
    let browser: Browser;
    beforeAll(async () => {
      browser = await launch(name);
    });
    // one page at a time, as a person has: pages left open slow the next test's timers
    afterEach(async () => {
      await Promise.all(browser.contexts().flatMap((c) => c.pages().map((p) => p.close())));
    });
    afterAll(async () => {
      await browser?.close();
    });

    async function open(): Promise<{ page: Page; problems: () => Promise<string[]> }> {
      const page = await browser.newPage();
      const watch = watchPage(page);
      await page.goto(url(), { waitUntil: "networkidle" });
      return { page, problems: () => watch.take() };
    }

    test("lsel's look under the strict CSP, with a quiet console", async () => {
      const { page, problems } = await open();
      expect(await lselLook(page)).toEqual(LSEL_LOOK);
      expect(await page.locator('meta[name="theme-color"]').getAttribute("content")).toBe(
        "#292522",
      );
      expect(await page.locator("footer .meta").textContent()).toContain(`lsel kit v${version}`);
      expect(await page.locator("footer .hints").textContent()).toBe(
        "/ search · j next · Enter open · ? list the keys",
      );
      expect(await problems()).toEqual([]);
    });

    test("the console watch reads logged objects and skips what it's told to", async () => {
      const page = await browser.newPage();
      const all = watchPage(page);
      const some = watchPage(page, { ignore: /^warning: dev / });
      await page.goto(url(), { waitUntil: "networkidle" });
      await page.evaluate(() => {
        console.warn("dev server chatter");
        console.error("broke", { at: 3 });
      });
      expect(await all.take()).toEqual(["warning: dev server chatter", 'error: broke {"at":3}']);
      expect(await some.take()).toEqual(['error: broke {"at":3}']);
    });

    test("a list moves with j and k, acts on the selected row, and opens with Enter", async () => {
      const { page, problems } = await open();
      expect(await current(page)).toBe("Alpha weekly");
      await page.keyboard.press("d");
      expect(await current(page)).toBe("Alpha weekly");
      await page.keyboard.press("j");
      await page.keyboard.press("j");
      expect(await current(page)).toBe("Gamma log");
      await page.keyboard.press("k");
      await page.keyboard.press("d");
      expect(await status(page)).toBe("Deleted Beta notes");
      expect(await current(page)).toBe("Gamma log");
      await page.keyboard.press("G");
      await page.keyboard.press("Enter");
      expect(await status(page)).toBe("Opened Gamma log");
      expect(await problems()).toEqual([]);
    });

    test("in a search box keys type, arrows still move, and Esc clears then leaves", async () => {
      const { page, problems } = await open();
      await page.keyboard.press("G");
      await page.keyboard.press("/");
      await page.keyboard.type("a j");
      const box = page.getByRole("searchbox", { name: "Search feeds" });
      expect(await box.inputValue()).toBe("a j");
      expect(await page.locator("p.lsel-empty").textContent()).toContain("No feeds match.");
      await page.keyboard.press("Escape");
      expect(await box.inputValue()).toBe("");
      expect(await current(page)).toBe("Gamma log");
      await page.keyboard.press("ArrowUp");
      expect(await current(page)).toBe("Beta notes");
      await page.keyboard.press("Escape");
      expect(await box.evaluate((el) => el === document.activeElement)).toBe(false);
      await page.keyboard.press("j");
      expect(await current(page)).toBe("Gamma log");
      expect(await problems()).toEqual([]);
    });

    test("a control in a row keeps Enter and its click; the row doesn't open", async () => {
      const { page, problems } = await open();
      const pin = page.getByRole("button", { name: "Pin" }).first();
      await pin.focus();
      await page.keyboard.press("Enter");
      expect(await status(page)).toBe("Pinned Alpha weekly");
      await page.getByRole("button", { name: "Pin" }).nth(1).click();
      expect(await status(page)).toBe("Pinned Beta notes");
      expect(await current(page)).toBe("Alpha weekly");
      expect(await problems()).toEqual([]);
    });

    test("a key bound to a form reaches its fields, and only those", async () => {
      const { page, problems } = await open();
      await page.keyboard.press("3");
      await page.getByLabel("Name").focus();
      await page.keyboard.press("Escape");
      expect(await status(page)).toBe("Left the form");
      await page.getByLabel("Name").blur();
      await page.keyboard.press("1");
      const box = page.getByRole("searchbox", { name: "Search feeds" });
      await box.fill("zz");
      await page.keyboard.press("Escape");
      expect(await box.inputValue()).toBe("");
      expect(await problems()).toEqual([]);
    });

    test("? lists the live keys, and Esc closes the list", async () => {
      const { page, problems } = await open();
      await page.keyboard.press("?");
      const dialog = page.getByRole("dialog", { name: "Keys" });
      const listed = await dialog.locator("dd").allTextContents();
      expect(listed).toEqual([
        "Search",
        "Open",
        "Show list",
        "Show states",
        "Show form",
        "Next",
        "Previous",
        "First",
        "Last",
        "Open",
        "Close this list",
      ]);
      await page.keyboard.press("j");
      await page.keyboard.press("Escape");
      expect(await dialog.isVisible()).toBe(false);
      expect(await current(page)).toBe("Alpha weekly");
      expect(await problems()).toEqual([]);
    });

    test("a slow answer shows its waiting line late; a failure keeps the last answer and r retries", async () => {
      const { page, problems } = await open();
      await page.keyboard.press("2");
      const answer = (text: string) => page.locator(".answer", { hasText: text }).waitFor();
      const waiting = page.getByText("Asking the playground…");
      await answer("answer 1");

      await page.getByRole("button", { name: "slow" }).click();
      expect(await waiting.count()).toBe(0);
      await waiting.waitFor();
      await answer("answer 2");
      expect(await waiting.count()).toBe(0);

      await page.getByRole("button", { name: "fail" }).click();
      const alert = page.getByRole("alert");
      await alert.waitFor();
      expect(await alert.textContent()).toMatch(
        /^The playground's upstream is down \(try 3\)\. Showing results from \d{1,2}:\d\d [AP]M\.\s*r retries\.$/,
      );
      await answer("answer 2");
      await page.keyboard.press("r");
      await alert.filter({ hasText: "try 4" }).waitFor();

      await page.getByRole("button", { name: "fast" }).click();
      await answer("answer 5");
      expect(await alert.count()).toBe(0);
      expect(await problems()).toEqual([]);
    });

    test("the loading bar stays away for a fast answer and shows for a slow one, moving nothing", async () => {
      const page = await browser.newPage();
      const watch = watchPage(page);
      await page.addInitScript(() => {
        new MutationObserver(() => {
          if (document.querySelector(".lsel-loading.shown")) {
            (window as unknown as { barShown: boolean }).barShown = true;
          }
        }).observe(document, { subtree: true, attributes: true, childList: true });
      });
      await page.goto(url(), { waitUntil: "networkidle" });
      await page.keyboard.press("2");
      await page.locator(".answer", { hasText: "answer 1" }).waitFor();
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => "barShown" in window)).toBe(false);

      await page.getByRole("button", { name: "slow" }).click();
      await page.locator(".lsel-loading.shown").waitFor({ state: "attached" });
      // taking the bar out moves nothing: it never took part in the layout
      const boxes = await page.evaluate(() => {
        const main = () => JSON.stringify(document.querySelector("main")?.getBoundingClientRect());
        const bar = document.querySelector(".lsel-loading");
        const [parent, next] = [bar?.parentNode, bar?.nextSibling ?? null];
        const before = main();
        bar?.remove();
        const after = main();
        if (bar && parent) parent.insertBefore(bar, next);
        return [before, after];
      });
      expect(boxes[1]).toBe(boxes[0]);
      await page.locator(".answer", { hasText: "answer 2" }).waitFor();
      await page.locator(".lsel-loading:not(.shown)").waitFor({ state: "attached" });
      expect(await watch.take()).toEqual([]);
    });

    test("with reduced motion the loading bar is a still, full line", async () => {
      const page = await browser.newPage();
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(url(), { waitUntil: "networkidle" });
      await page.keyboard.press("2");
      await page.getByRole("button", { name: "slow" }).click();
      await page.locator(".lsel-loading.shown").waitFor({ state: "attached" });
      const segment = await page.locator(".lsel-loading .segment").evaluate((el) => ({
        animation: getComputedStyle(el).animationName,
        full: el.getBoundingClientRect().width === window.innerWidth,
      }));
      expect(segment).toEqual({ animation: "none", full: true });
    });

    test("an action says it worked, then rests; a failed one says so in red; a bad field is marked", async () => {
      const { page, problems } = await open();
      await page.keyboard.press("3");
      const copy = page.getByRole("button", { name: /^(Copy|Copying…|Copied)/ });
      await copy.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("button", { name: /^Copied/ }).waitFor();
      expect(await copy.evaluate((el) => el === document.activeElement)).toBe(true);
      await page.getByRole("button", { name: /^Copy c$/ }).waitFor({ timeout: 3000 });
      await page.keyboard.press("c");
      await page.getByRole("button", { name: /^Copied/ }).waitFor();
      await page.getByRole("button", { name: /^Copy c$/ }).waitFor({ timeout: 3000 });
      expect(await copy.getAttribute("aria-busy")).toBe("false");

      await page.keyboard.press("s");
      const failed = page.getByRole("button", { name: /^Send failed/ });
      await failed.waitFor();
      // colors ease in over --motion-fast, so wait for the end of it
      const error = `rgb(${[1, 3, 5].map((i) => Number.parseInt(palette.error.slice(i, i + 2), 16)).join(", ")})`;
      const settles = (sel: string, prop: "color" | "borderTopColor") =>
        page.waitForFunction(
          ([s, p, want]) => {
            const el = document.querySelector(s as string);
            return el !== null && getComputedStyle(el)[p as "color"] === want;
          },
          [sel, prop, error],
          { timeout: 1000 },
        );
      await settles("button.failed", "color");

      const field = page.getByLabel("Name");
      await field.focus();
      await field.blur();
      expect(await field.getAttribute("aria-invalid")).toBe("true");
      await settles("input[aria-invalid=true]", "borderTopColor");
      expect(await page.getByText("A name is needed.").isVisible()).toBe(true);
      await field.fill("Sammy");
      await field.blur();
      expect(await field.getAttribute("aria-invalid")).toBeNull();
      expect(await problems()).toEqual([]);
    });
  });
}
