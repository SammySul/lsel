// Run `bun run build` first.
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  browsers,
  LSEL_LOOK,
  launch,
  lselLook,
  serveBuilt,
  watchPage,
} from "@sammysul/lsel/testing";
import type { Browser, BrowserContext, Page } from "playwright-core";

const url = serveBuilt(join(import.meta.dir, "../dist"));
const FONT = readFileSync(
  Bun.resolveSync("@sammysul/lsel/assets/aporetic-sans-mono-bold.woff2", import.meta.dir),
);

const fontFile = (name: string, buffer: Buffer = FONT) => ({
  name,
  mimeType: "font/woff2",
  buffer,
});

for (const name of browsers()) {
  describe(name, () => {
    let browser: Browser;
    beforeAll(async () => {
      browser = await launch(name);
    });
    afterAll(async () => {
      await browser?.close();
    });

    let ctx: BrowserContext | undefined;
    afterEach(async () => {
      await ctx?.close();
      ctx = undefined;
    });

    async function open(): Promise<{ page: Page; problems: () => Promise<string[]> }> {
      ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      const watch = watchPage(page);
      await page.goto(url(), { waitUntil: "networkidle" });
      return { page, problems: () => watch.take() };
    }

    const listed = (page: Page) =>
      page.getByRole("list", { name: "Your fonts" }).locator(".name").allTextContents();
    const previews = (page: Page) =>
      page
        .locator("textarea")
        .evaluateAll((els) =>
          els.map((e) => [e.getAttribute("aria-label"), getComputedStyle(e).fontSize]),
        );
    const reload = async (page: Page) => {
      await page.reload({ waitUntil: "networkidle" });
      await page.getByText("typ", { exact: true }).first().waitFor();
    };

    test("lsel's look, under the strict CSP", async () => {
      const { page, problems } = await open();
      expect(await lselLook(page)).toEqual(LSEL_LOOK);
      expect(await problems()).toEqual([]);
    });

    test("a font file is kept across reloads, previewed in its own face, and removed for good", async () => {
      const { page, problems } = await open();
      await expect(page.getByText("No fonts yet.").isVisible()).resolves.toBe(true);

      await page.locator('input[type="file"]').setInputFiles(fontFile("Probe Mono.woff2"));
      await page.getByLabel("Preview in Probe Mono").waitFor();
      expect(await listed(page)).toEqual(["Probe Mono"]);
      const face = await page.getByLabel("Preview in Probe Mono").evaluate((el) => ({
        family: getComputedStyle(el).fontFamily,
        loaded: document.fonts.check('16px "Probe Mono"'),
      }));
      // the first family, unquoted: WebKit leaves the quotes out of computed styles
      expect(face.family.split(",")[0]?.replaceAll('"', "")).toBe("Probe Mono");
      expect(face.loaded).toBe(true);

      await reload(page);
      await page.getByLabel("Preview in Probe Mono").waitFor();
      expect(await listed(page)).toEqual(["Probe Mono"]);

      await page.getByRole("button", { name: "Remove Probe Mono" }).click();
      await page.getByText("No fonts yet.").waitFor();
      await reload(page);
      await page.getByText("No fonts yet.").waitFor();
      expect(await listed(page)).toEqual([]);
      expect(await problems()).toEqual([]);
    });

    test("switching a font off and the size are remembered; keys change the size", async () => {
      const { page, problems } = await open();
      await page
        .locator('input[type="file"]')
        .setInputFiles([fontFile("Alpha.woff2"), fontFile("Beta.woff2")]);
      await page.getByLabel("Preview in Beta").waitFor();
      expect(await previews(page)).toEqual([
        ["Preview in Alpha", "16px"],
        ["Preview in Beta", "16px"],
      ]);

      await page.getByRole("checkbox").first().uncheck();
      await page.keyboard.press("=");
      await page.keyboard.press("=");
      await page.keyboard.press("-");
      expect(await previews(page)).toEqual([["Preview in Beta", "18px"]]);

      await reload(page);
      await page.getByLabel("Preview in Beta").waitFor();
      expect(await previews(page)).toEqual([["Preview in Beta", "18px"]]);
      expect(await listed(page)).toEqual(["Alpha", "Beta"]);
      expect(await problems()).toEqual([]);
    });

    test("typing changes every preview; r brings the sample back", async () => {
      const { page } = await open();
      await page
        .locator('input[type="file"]')
        .setInputFiles([fontFile("One.woff2"), fontFile("Two.woff2")]);
      await page.getByLabel("Preview in Two").waitFor();
      await page.getByLabel("Preview in One").fill("Hamburgefonstiv");
      expect(await page.getByLabel("Preview in Two").inputValue()).toBe("Hamburgefonstiv");

      await page.keyboard.press("Escape");
      await page.keyboard.press("r");
      expect(
        (await page.getByLabel("Preview in Two").inputValue()).startsWith('"The quick brown fox'),
      ).toBe(true);
    });

    test("a file that is not a font is refused with a message, and a name already listed is skipped", async () => {
      const { page } = await open();
      await page.locator('input[type="file"]').setInputFiles(fontFile("Probe.woff2"));
      await page.getByLabel("Preview in Probe").waitFor();
      await page
        .locator('input[type="file"]')
        .setInputFiles([fontFile("notes.ttf", Buffer.from("not a font")), fontFile("Probe.woff2")]);
      const alert = page.getByRole("alert");
      await alert.waitFor();
      expect(await alert.locator("li").allTextContents()).toEqual([
        "notes.ttf could not be read as a font.",
        "Probe is already in the list.",
      ]);
      expect(await listed(page)).toEqual(["Probe"]);
    });

    type Seed = { fontName: string } & (
      | { fontBase64: string }
      | { blob: number[] }
      | { bytes: number[] }
    );
    const seed = (page: Page, records: Seed[]) =>
      page.evaluate(
        (records) =>
          new Promise<void>((resolve, reject) => {
            const req = indexedDB.open("FontsDB", 1);
            req.onupgradeneeded = () =>
              req.result.createObjectStore("fonts", { keyPath: "fontName" });
            req.onsuccess = () => {
              const tx = req.result.transaction("fonts", "readwrite");
              for (const r of records) {
                tx.objectStore("fonts").put(
                  "blob" in r
                    ? { fontName: r.fontName, blob: new Blob([new Uint8Array(r.blob)]) }
                    : "bytes" in r
                      ? { fontName: r.fontName, bytes: new Uint8Array(r.bytes).buffer }
                      : r,
                );
              }
              tx.oncomplete = () => {
                req.result.close();
                resolve();
              };
              tx.onerror = () => reject(tx.error);
            };
          }),
        records,
      );

    // The first typ stored a Blob, and before that a base64 data URL. WebKit's private mode,
    // which Playwright uses, can't store Blobs, so the Blob record is left out there.
    test("fonts saved by the first typ still load", async () => {
      const { page, problems } = await open();
      const old = [
        { fontName: "Old Base64", fontBase64: `data:font/woff2;base64,${FONT.toString("base64")}` },
        ...(name === "webkit" ? [] : [{ fontName: "Old Blob", blob: [...FONT] }]),
      ];
      await seed(page, old);
      await reload(page);
      await page.getByLabel(`Preview in ${old.at(-1)?.fontName}`).waitFor();
      expect(await listed(page)).toEqual(old.map((r) => r.fontName));
      expect(
        await page.evaluate(
          (names) => names.map((n) => document.fonts.check(`16px "${n}"`)),
          old.map((r) => r.fontName),
        ),
      ).toEqual(old.map(() => true));
      expect(await problems()).toEqual([]);
    });

    const stored = (page: Page) =>
      page.evaluate(
        () =>
          new Promise<IDBValidKey[]>((resolve, reject) => {
            const req = indexedDB.open("FontsDB", 1);
            req.onsuccess = () => {
              const keys = req.result.transaction("fonts").objectStore("fonts").getAllKeys();
              keys.onsuccess = () => {
                req.result.close();
                resolve(keys.result);
              };
              keys.onerror = () => reject(keys.error);
            };
            req.onerror = () => reject(req.error);
          }),
      );
    const focused = (page: Page) =>
      page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    const alerts = (page: Page) => page.getByRole("alert").locator("li").allTextContents();

    test("a stored record with no font file in it is removed, with one message", async () => {
      const { page } = await open();
      await seed(page, [
        { fontName: "Empty", fontBase64: "" },
        { fontName: "Garbled", fontBase64: "data:font/woff2;base64,%%%" },
        { fontName: "Fine", bytes: [...FONT] },
      ]);
      await reload(page);
      await page.getByLabel("Preview in Fine").waitFor();
      expect(await alerts(page)).toEqual([
        "Empty held no font file, so it was removed.",
        "Garbled held no font file, so it was removed.",
      ]);
      expect(await listed(page)).toEqual(["Fine"]);
      expect(await stored(page)).toEqual(["Fine"]);

      await reload(page);
      await page.getByLabel("Preview in Fine").waitFor();
      expect(await page.getByRole("alert").count()).toBe(0);
    });

    test("a saved font the browser won't load is kept", async () => {
      const { page } = await open();
      await seed(page, [{ fontName: "Fine", bytes: [...FONT] }]);
      await page.addInitScript(() => {
        FontFace.prototype.load = () => Promise.reject(new DOMException("blocked", "NetworkError"));
      });
      await reload(page);
      await page.getByText("can't be read").waitFor();
      expect(await listed(page)).toEqual(["Fine"]);
      expect(await stored(page)).toEqual(["Fine"]);
    });

    test("an unreadable saved font is listed with Remove, and removing it deletes it for good", async () => {
      const { page } = await open();
      await seed(page, [
        { fontName: "Broken", bytes: [...Buffer.from("not a font")] },
        { fontName: "Fine", bytes: [...FONT] },
      ]);
      await reload(page);
      await page.getByLabel("Preview in Fine").waitFor();
      expect(await listed(page)).toEqual(["Fine", "Broken"]);
      expect(await page.getByText("can't be read").count()).toBe(1);
      expect(await page.getByRole("checkbox").count()).toBe(1);
      expect(await page.getByRole("alert").count()).toBe(0);
      expect(await previews(page)).toEqual([["Preview in Fine", "16px"]]);

      await page.getByRole("button", { name: "Remove Broken" }).click();
      await page.getByText("can't be read").waitFor({ state: "detached" });
      expect(await listed(page)).toEqual(["Fine"]);
      await reload(page);
      await page.getByLabel("Preview in Fine").waitFor();
      expect(await listed(page)).toEqual(["Fine"]);
      expect(await stored(page)).toEqual(["Fine"]);
    });

    test("a record that can't be deleted doesn't stop the others loading", async () => {
      const { page } = await open();
      await seed(page, [
        { fontName: "Empty", fontBase64: "" },
        { fontName: "Fine", bytes: [...FONT] },
      ]);
      await page.addInitScript(() => {
        IDBObjectStore.prototype.delete = () => {
          throw new DOMException("blocked", "UnknownError");
        };
      });
      await reload(page);
      await page.getByLabel("Preview in Fine").waitFor();
      expect(await listed(page)).toEqual(["Fine", "Empty"]);
      expect(await page.getByText("can't be read").count()).toBe(1);
    });

    test("an installed font is found and added from the keyboard, or with one click", async () => {
      const { page, problems } = await open();
      await page.addInitScript((base64) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const face = (family: string) => ({
          family,
          style: "Regular",
          blob: async () => new Blob([bytes]),
        });
        Object.assign(window, {
          queryLocalFonts: async () => [
            face("Probe Sans"),
            face("Probe Serif"),
            face("Probe Mono"),
            face("Other"),
          ],
        });
      }, FONT.toString("base64"));
      await reload(page);

      await page.keyboard.press("i");
      const search = page.getByRole("searchbox", { name: "Search installed fonts" });
      await search.waitFor();
      await page.keyboard.press("Escape");
      await page.keyboard.press("/");
      expect(await focused(page)).toBe("Search installed fonts");
      await search.fill("probe");
      await page.getByRole("button", { name: "Probe Serif" }).click();
      await page.getByLabel("Preview in Probe Serif").waitFor();
      expect(await focused(page)).toBe("Search installed fonts");

      // Enter opens the highlighted row, the first, not the clicked one
      await page.keyboard.press("Enter");
      await page.getByLabel("Preview in Probe Mono").waitFor();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await page.getByLabel("Preview in Probe Sans").waitFor();
      expect(await listed(page)).toEqual(["Probe Serif", "Probe Mono", "Probe Sans"]);

      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await page.keyboard.press("i");
      await search.waitFor({ state: "detached" });
      expect(await problems()).toEqual([]);
    });

    test("installed fonts are offered only where the browser can read them", async () => {
      const { page } = await open();
      const supported = await page.evaluate(() => "queryLocalFonts" in window);
      expect(await page.getByRole("button", { name: /^Installed fonts/ }).count()).toBe(
        supported ? 1 : 0,
      );
    });
  });
}
