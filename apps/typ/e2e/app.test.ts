// The built app in real browsers, served by the real server.
// Run `bun run build` first. Env: BROWSERS=chromium,firefox,webkit
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type Browser, chromium, firefox, type Page, webkit } from "playwright-core";
import { handler } from "../src/server/server.ts";

const DIST = join(import.meta.dir, "../dist");
const FONT = readFileSync(join(import.meta.dir, "../src/web/lsel/JetBrainsMono-Bold.woff2"));
const ALL = { chromium, firefox, webkit };
const names = (process.env.BROWSERS?.split(",") ?? Object.keys(ALL)) as (keyof typeof ALL)[];

let server: ReturnType<typeof Bun.serve>;
let base: string;

beforeAll(() => {
  if (!existsSync(join(DIST, "index.html"))) throw new Error("no dist/: run `bun run build` first");
  server = Bun.serve({ port: 0, fetch: handler(DIST) });
  base = server.url.href.replace(/\/$/, "");
});

afterAll(() => {
  server?.stop(true);
});

const fontFile = (name: string, buffer: Buffer = FONT) => ({
  name,
  mimeType: "font/woff2",
  buffer,
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

    async function open(): Promise<{ page: Page; problems: string[] }> {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      const problems: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error" || m.type() === "warning")
          problems.push(`${m.type()}: ${m.text()}`);
      });
      page.on("pageerror", (e) => problems.push(`uncaught: ${e.message}`));
      await page.goto(`${base}/`, { waitUntil: "networkidle" });
      return { page, problems };
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
      expect(problems).toEqual([]);
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
      expect(problems).toEqual([]);
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

    // The first typ stored a Blob, and before that a base64 data URL. WebKit's private mode,
    // which Playwright uses, can't store Blobs, so the Blob record is left out there.
    test("fonts saved by the first typ still load", async () => {
      const { page, problems } = await open();
      const old = [
        { fontName: "Old Base64", fontBase64: `data:font/woff2;base64,${FONT.toString("base64")}` },
        ...(name === "webkit" ? [] : [{ fontName: "Old Blob", blob: [...FONT] }]),
      ];
      await page.evaluate(
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
        old,
      );
      await reload(page);
      await page.getByLabel(`Preview in ${old.at(-1)?.fontName}`).waitFor();
      expect(await listed(page)).toEqual(old.map((r) => r.fontName));
      expect(
        await page.evaluate(
          (names) => names.map((n) => document.fonts.check(`16px "${n}"`)),
          old.map((r) => r.fontName),
        ),
      ).toEqual(old.map(() => true));
      expect(problems).toEqual([]);
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
