// Run `bun run build` first.
import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  eachBrowser,
  LSEL_LAYOUT,
  LSEL_LOOK,
  lselLayout,
  lselLook,
  serveBuilt,
  watchPage,
} from "@sammysul/lsel/testing";
import type { BrowserContext, Page } from "playwright-core";

const url = serveBuilt(join(import.meta.dir, "../dist"));
const FONT = readFileSync(
  Bun.resolveSync("@sammysul/lsel/assets/dejavu-sans-mono-bold.woff2", import.meta.dir),
);

const fontFile = (name: string, buffer: Buffer = FONT) => ({
  name,
  mimeType: "font/woff2",
  buffer,
});

// main.ts reads the stored fonts before it mounts, so the page is whole once its name shows
const mounted = (page: Page) => page.getByText("typ", { exact: true }).first().waitFor();

eachBrowser((browser, name) => {
  let ctx: BrowserContext | undefined;
  afterEach(async () => {
    await ctx?.close();
    ctx = undefined;
  });

  async function open(): Promise<{ page: Page; problems: () => Promise<string[]> }> {
    ctx = await browser().newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const watch = watchPage(page);
    await page.goto(url());
    await mounted(page);
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
  // the fitted list's rows at 1280×900, fillers included (the pager's detail has its own line): as many with fonts as without
  const ROWS = { chromium: 9, firefox: 10, webkit: 10 }[name] ?? 0;
  const rows = (page: Page) =>
    page.getByRole("list", { name: "Your fonts" }).locator(":scope > li").count();
  const reload = async (page: Page) => {
    await page.reload();
    await mounted(page);
  };

  test("lsel's look, under the strict CSP", async () => {
    const { page, problems } = await open();
    expect(await lselLook(page)).toEqual(LSEL_LOOK);
    expect(await lselLayout(page)).toEqual(LSEL_LAYOUT);
    expect(await problems()).toEqual([]);
  });

  test("a font file is kept across reloads, previewed in its own face, and removed for good", async () => {
    const { page, problems } = await open();
    await expect(page.getByText("No fonts yet.").isVisible()).resolves.toBe(true);
    expect(await rows(page)).toBe(ROWS);

    await page.locator('input[type="file"]').setInputFiles(fontFile("Probe Mono.woff2"));
    await page.getByLabel("Preview in Probe Mono").waitFor();
    expect(await listed(page)).toEqual(["Probe Mono"]);
    expect(await rows(page)).toBe(ROWS);
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
    expect(await lselLayout(page)).toEqual(LSEL_LAYOUT);

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
  // the selected font's detail, on the pager's line
  const foot = async (page: Page) =>
    (await page.locator(".pager .foot").textContent())?.trim() ?? null;

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
    expect(await foot(page)).toBe("");
    await page.keyboard.press("j");
    expect(await foot(page)).toBe("Can't be read");
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
    await page.keyboard.press("j");
    expect(await foot(page)).toBe("Can't be read");
  });

  // stands in for the Local Font Access API, which only Chromium has, so every browser gets the panel
  const installed = (page: Page, families: string[]) =>
    page.addInitScript(
      ({ base64, families }) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const face = (family: string) => ({
          family,
          style: "Regular",
          blob: async () => new Blob([bytes]),
        });
        Object.assign(window, { queryLocalFonts: async () => families.map(face) });
      },
      { base64: FONT.toString("base64"), families },
    );
  const lists = (page: Page) =>
    page.getByRole("list").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  const current = (page: Page) =>
    page
      .locator('li[aria-current="true"]')
      .evaluateAll((els) => els.map((e) => e.querySelector(".name, .family")?.textContent));

  test("the installed fonts stand in for Your fonts while open, one list on the screen", async () => {
    const { page, problems } = await open();
    await installed(page, ["Probe Sans", "Probe Serif"]);
    await reload(page);
    await page.locator('input[type="file"]').setInputFiles(fontFile("Alpha.woff2"));
    await page.getByLabel("Preview in Alpha").waitFor();
    // lselLayout counts what moved since the load: the fonts coming in are not this test's
    await reload(page);
    await page.getByLabel("Preview in Alpha").waitFor();
    expect(await lists(page)).toEqual(["Your fonts"]);

    await page.keyboard.press("i");
    await page.getByText("Probe Serif").waitFor();
    expect(await lists(page)).toEqual(["Installed fonts"]);
    expect(await focused(page)).toBe("Search installed fonts");
    await page.keyboard.press("ArrowDown");
    expect(await current(page)).toEqual(["Probe Serif"]);
    expect(await foot(page)).toBe("2 of 2");
    expect(await lselLayout(page)).toEqual(LSEL_LAYOUT);

    // Esc clears the search, then swaps back
    await page.getByRole("searchbox").fill("serif");
    expect(await foot(page)).toBe("1 of 2");
    await page.keyboard.press("Escape");
    expect(await foot(page)).toBe("2 of 2");
    await page.keyboard.press("Escape");
    expect(await lists(page)).toEqual(["Your fonts"]);
    expect(await current(page)).toEqual(["Alpha"]);
    expect(await lselLayout(page)).toEqual(LSEL_LAYOUT);

    // in the search, i is typed; the button swaps back too
    await page.keyboard.press("i");
    await page.getByText("Probe Serif").waitFor();
    await page.getByRole("button", { name: /^Installed fonts/ }).click();
    expect(await lists(page)).toEqual(["Your fonts"]);
    expect(await problems()).toEqual([]);
  });

  test("an installed font is found and added with Enter, or with one click", async () => {
    const { page, problems } = await open();
    await installed(page, ["Probe Sans", "Probe Serif", "Probe Mono", "Other"]);
    await reload(page);

    await page.keyboard.press("/");
    expect(await focused(page)).toBe("Search installed fonts");
    await page.getByRole("searchbox").fill("probe");
    await page.getByRole("list", { name: "Installed fonts" }).getByText("Probe Serif").click();
    await page.getByLabel("Preview in Probe Serif").waitFor();
    expect(await focused(page)).toBe("Search installed fonts");

    // the click selected its row: the keys move on from there
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await page.getByLabel("Preview in Probe Mono").waitFor();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.getByLabel("Preview in Probe Sans").waitFor();

    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    expect(await listed(page)).toEqual(["Probe Serif", "Probe Mono", "Probe Sans"]);
    expect(await foot(page)).toBe("Installed");
    expect(await problems()).toEqual([]);
  });

  test("x ticks and unticks the selected font, Delete removes it", async () => {
    const { page, problems } = await open();
    await page
      .locator('input[type="file"]')
      .setInputFiles([fontFile("Alpha.woff2"), fontFile("Beta.woff2")]);
    await page.getByLabel("Preview in Beta").waitFor();

    await page.keyboard.press("x");
    expect(await previews(page)).toEqual([["Preview in Beta", "16px"]]);
    await page.keyboard.press("x");
    expect(await previews(page)).toEqual([
      ["Preview in Alpha", "16px"],
      ["Preview in Beta", "16px"],
    ]);

    await page.keyboard.press("j");
    await page.keyboard.press("Delete");
    await page.getByLabel("Preview in Beta").waitFor({ state: "detached" });
    expect(await listed(page)).toEqual(["Alpha"]);
    expect(await stored(page)).toEqual(["Alpha"]);
    expect(await current(page)).toEqual(["Alpha"]);
    expect(await problems()).toEqual([]);
  });

  test("a row is never wider than its column, however long the name", async () => {
    const { page } = await open();
    const long = "An installed family whose name runs far past the sidebar's width";
    await installed(page, [long]);
    await reload(page);
    await page.locator('input[type="file"]').setInputFiles(fontFile(`${long} too.woff2`));
    await page.getByLabel(`Preview in ${long} too`).waitFor();
    await page.keyboard.press("i");
    await page.getByRole("list", { name: "Installed fonts" }).getByText(long).click();
    await page.getByLabel(`Preview in ${long}`, { exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await page.keyboard.press("G");
    expect(await foot(page)).toBe("Installed");

    const rowsFit = () =>
      page
        .getByRole("list", { name: "Your fonts" })
        .locator(".font")
        .evaluateAll((els) =>
          els.map((el) => {
            const li = (el.parentElement as HTMLElement).getBoundingClientRect();
            const name = el.querySelector(".name") as HTMLElement;
            const button = el.querySelector("button") as HTMLButtonElement;
            return {
              inside:
                button.getBoundingClientRect().right <= li.right &&
                el.scrollWidth <= el.clientWidth,
              cut: name.scrollWidth > name.clientWidth,
              button: button.textContent,
              whole: button.scrollWidth <= button.clientWidth,
              height: Math.round(li.height),
            };
          }),
        );
    const row = { inside: true, cut: true, button: "Remove", whole: true, height: 48 };
    expect(await rowsFit()).toEqual([row, row]);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await rowsFit()).toEqual([row, row]);
  });

  test("columns past the window's edge are paged with [ and ]", async () => {
    const { page } = await open();
    const names = ["One", "Two", "Three", "Four", "Five"];
    await page
      .locator('input[type="file"]')
      .setInputFiles(names.map((n) => fontFile(`${n}.woff2`)));
    await page.getByLabel("Preview in Five").waitFor();
    const columns = async () => (await previews(page)).map(([label]) => label);
    // a font added shows: the last page
    expect(await columns()).toEqual(["Preview in Three", "Preview in Four", "Preview in Five"]);
    expect(await page.getByText("3–5 of 5").count()).toBe(1);
    await page.keyboard.press("[");
    expect(await columns()).toEqual(["Preview in One", "Preview in Two", "Preview in Three"]);
    await page.keyboard.press("]");
    expect(await columns()).toEqual(["Preview in Three", "Preview in Four", "Preview in Five"]);
    await page.setViewportSize({ width: 390, height: 844 });
    // the first column shown stays in view
    await page.waitForFunction(() => document.querySelectorAll("textarea").length === 1);
    expect(await columns()).toEqual(["Preview in Three"]);

    // stored fonts come back in name order
    await reload(page);
    await page.getByLabel("Preview in Five").waitFor();
    expect(await columns()).toEqual(["Preview in Five"]);
    expect(await lselLayout(page)).toEqual(LSEL_LAYOUT);
  });

  test("installed fonts are offered only where the browser can read them", async () => {
    const { page } = await open();
    const supported = await page.evaluate(() => "queryLocalFonts" in window);
    expect(await page.getByRole("button", { name: /^Installed fonts/ }).count()).toBe(
      supported ? 1 : 0,
    );
  });
});
