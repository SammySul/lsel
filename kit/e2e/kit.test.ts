// Served by the shared server, so the strict CSP applies. Run `bun run build` first.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { Browser, Page } from "playwright-core";
import {
  browsers,
  LSEL_LOOK,
  launch,
  lselLook,
  serveBuilt,
  watchPage,
} from "../src/lib/testing/index.ts";

const url = serveBuilt(join(import.meta.dir, "../playground-dist"));

const current = (page: Page) =>
  page.locator('ul[aria-label="Feeds"] li[aria-current="true"]').textContent();
const status = (page: Page) => page.locator("footer [role=status]").textContent();

for (const name of browsers()) {
  describe(name, () => {
    let browser: Browser;
    beforeAll(async () => {
      browser = await launch(name);
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
      expect(await page.locator("footer .meta").textContent()).toContain("lsel kit v0.1.0");
      expect(await problems()).toEqual([]);
    });

    test("a list moves with j and k, acts on the selected row, and opens with Enter", async () => {
      const { page, problems } = await open();
      expect(await current(page)).toBe("Alpha weekly");
      await page.keyboard.press("j");
      await page.keyboard.press("j");
      expect(await current(page)).toBe("Gamma log");
      await page.keyboard.press("k");
      await page.keyboard.press("d");
      expect(await status(page)).toBe("Deleted Beta notes");
      await page.keyboard.press("G");
      await page.keyboard.press("Enter");
      expect(await status(page)).toBe("Opened Gamma log");
      expect(await problems()).toEqual([]);
    });

    test("in a search box keys type, arrows still move, and Esc clears then leaves", async () => {
      const { page, problems } = await open();
      await page.keyboard.press("/");
      await page.keyboard.type("a j");
      const box = page.getByRole("searchbox", { name: "Search feeds" });
      expect(await box.inputValue()).toBe("a j");
      expect(await page.locator("p.lsel-empty").textContent()).toContain("No feeds match.");
      await page.keyboard.press("Escape");
      expect(await box.inputValue()).toBe("");
      await page.keyboard.press("ArrowDown");
      expect(await current(page)).toBe("Beta notes");
      await page.keyboard.press("Escape");
      expect(await box.evaluate((el) => el === document.activeElement)).toBe(false);
      await page.keyboard.press("j");
      expect(await current(page)).toBe("Gamma log");
      expect(await problems()).toEqual([]);
    });

    test("? lists the live keys, and Esc closes the list", async () => {
      const { page, problems } = await open();
      await page.keyboard.press("?");
      const dialog = page.getByRole("dialog", { name: "Keys" });
      const listed = await dialog.locator("dd").allTextContents();
      expect(listed).toEqual([
        "Search",
        "Show list",
        "Show states",
        "Show form",
        "Next",
        "Previous",
        "First",
        "Last",
        "Open",
        "Delete",
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

    test("an action says it worked, then rests; a failed one says so in red; a bad field is marked", async () => {
      const { page, problems } = await open();
      await page.keyboard.press("3");
      const copy = page.getByRole("button", { name: /^(Copy|Copying…|Copied)/ });
      await page.keyboard.press("c");
      await page.getByRole("button", { name: /^Copied/ }).waitFor();
      await page.getByRole("button", { name: /^Copy c$/ }).waitFor({ timeout: 3000 });
      expect(await copy.getAttribute("aria-busy")).toBe("false");

      await page.keyboard.press("s");
      const failed = page.getByRole("button", { name: /^Send failed/ });
      await failed.waitFor();
      // colors ease in over --motion-fast, so wait for the end of it
      const settles = (sel: string, prop: "color" | "borderTopColor") =>
        page.waitForFunction(
          ([s, p]) => {
            const el = document.querySelector(s as string);
            return el !== null && getComputedStyle(el)[p as "color"] === "rgb(235, 111, 146)";
          },
          [sel, prop],
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
