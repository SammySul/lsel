// Served by the shared server, so the strict CSP applies. Run `bun run build` first.
import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { version } from "../package.json";
import { palette } from "../src/lib/assets/palette.ts";
import {
  eachBrowser,
  LSEL_LAYOUT,
  LSEL_LOOK,
  lselLayout,
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
// the first screen's list: start() has mounted the playground
const mounted = (page: Page) => page.locator('ul[aria-label="Feeds"]').waitFor();

const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

/** The top border color of `selector` once it is `want`, or as it is after a second: borders ease over --motion-fast. */
async function settled(page: Page, selector: string, want: string): Promise<string> {
  await page
    .waitForFunction(
      ([s, w]) => {
        const el = document.querySelector(s as string);
        return el !== null && getComputedStyle(el).borderTopColor === w;
      },
      [selector, want],
      { timeout: 1000 },
    )
    .catch(() => undefined);
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    return el === null ? "" : getComputedStyle(el).borderTopColor;
  }, selector);
}

/** The fitted list's rows once nothing moves, and whether they fit: the room left under the page is less than a row. */
async function fit(page: Page): Promise<{ rows: number; fits: boolean }> {
  const measure = () => {
    const root = document.documentElement;
    const ul = document.querySelector<HTMLElement>('ul[aria-label="Items"]');
    if (ul === null) return { rows: 0, fits: false, moving: true };
    const left = root.clientHeight - root.getBoundingClientRect().height;
    const row = ul.offsetHeight / ul.children.length;
    return {
      rows: ul.children.length,
      fits: left >= 0 && left < row && root.scrollHeight <= root.clientHeight,
      moving: document.getAnimations().some((a) => a instanceof CSSTransition),
    };
  };
  const until = Date.now() + 2000;
  for (;;) {
    const { rows, fits, moving } = await page.evaluate(measure);
    if ((fits && !moving) || Date.now() > until) return { rows, fits };
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(done)));
  }
}

eachBrowser((browser, name) => {
  // one page at a time, as a person has: pages left open slow the next test's timers
  afterEach(async () => {
    await Promise.all(
      browser()
        .contexts()
        .flatMap((c) => c.pages().map((p) => p.close())),
    );
  });

  async function open(): Promise<{ page: Page; problems: () => Promise<string[]> }> {
    const page = await browser().newPage();
    const watch = watchPage(page);
    await page.goto(url());
    await mounted(page);
    return { page, problems: () => watch.take() };
  }

  test("lsel's look under the strict CSP, with a quiet console", async () => {
    const { page, problems } = await open();
    expect(await lselLook(page)).toEqual(LSEL_LOOK);
    expect(await lselLayout(page)).toEqual(LSEL_LAYOUT);
    const themeColors = await page
      .locator('meta[name="theme-color"]')
      .evaluateAll((metas) =>
        metas.map((m) => [m.getAttribute("media"), m.getAttribute("content")]),
      );
    expect(themeColors).toEqual([[null, palette.base]]);
    expect(await page.locator("footer .meta").textContent()).toContain(`lsel kit v${version}`);
    // `?` first: the line is cut from the end on a narrow window
    expect(await page.locator(".top .hints").textContent()).toBe(
      "? list the keys · / search · j next · Enter open",
    );
    expect(await page.locator(".sub").textContent()).toBe(
      "Every shared component, in every state.",
    );
    expect(await problems()).toEqual([]);
  });

  test("start() finds tokens.css's faces in the document before it mounts", async () => {
    const { page, problems } = await open();
    expect(
      await page.evaluate(() => (window as unknown as { lselFaces: string[] }).lselFaces),
    ).toEqual([
      "400 Cantarell",
      "700 Cantarell",
      "400 DejaVu Sans Mono",
      "700 DejaVu Sans Mono",
      "400 MrRobot",
    ]);
    expect(await problems()).toEqual([]);
  });

  test("K folds the key hints away and back, and the page remembers it", async () => {
    const { page, problems } = await open();
    const hints = page.locator(".top .hints");
    const toggle = page.getByRole("button", { name: "Keys" });
    const state = async () => [
      await toggle.getAttribute("aria-pressed"),
      await hints.getAttribute("aria-hidden"),
      Math.round((await hints.boundingBox())?.height ?? -1),
    ];
    const open_ = await state();
    expect(open_.slice(0, 2)).toEqual(["true", "false"]);
    expect(open_[2]).toBeGreaterThan(0);
    // the fold is a transition: wait for the height it ends at
    const folded = (height: unknown) =>
      page.waitForFunction(
        (h) =>
          Math.round(
            document.querySelector(".top .hints")?.getBoundingClientRect().height ?? -1,
          ) === h,
        height,
      );
    await page.keyboard.press("K");
    await folded(0);
    expect(await state()).toEqual(["false", "true", 0]);
    await page.reload();
    await mounted(page);
    expect(await state()).toEqual(["false", "true", 0]);
    await toggle.click();
    await folded(open_[2]);
    expect(await state()).toEqual(open_);
    expect(await problems()).toEqual([]);
  });

  test("the console watch reads logged objects and skips what it's told to", async () => {
    const page = await browser().newPage();
    const all = watchPage(page);
    const some = watchPage(page, { ignore: /^warning: dev / });
    await page.goto(url());
    await mounted(page);
    await page.evaluate(() => {
      console.warn("dev server chatter");
      console.error("broke", { at: 3 });
    });
    expect(await all.take()).toEqual(["warning: dev server chatter", 'error: broke {"at":3}']);
    expect(await some.take()).toEqual(['error: broke {"at":3}']);
  });

  test("lselLayout names what moved by itself, past Chromium's buffer of 150 shifts", async () => {
    const { page, problems } = await open();
    expect(await lselLayout(page)).toEqual(LSEL_LAYOUT);
    // 160 small moves a frame apart, then one of its own: only Chromium reports layout shifts
    await page.evaluate(async () => {
      const mover = document.createElement("div");
      mover.className = "mover";
      mover.textContent = "x";
      Object.assign(mover.style, { position: "absolute", top: "0px", left: "0px" });
      document.body.append(mover);
      const frame = () => new Promise((done) => requestAnimationFrame(done));
      await frame();
      for (let i = 1; i <= 160; i++) {
        mover.style.left = `${i * 4}px`;
        await frame();
      }
      mover.style.top = "40px";
      await frame();
      await frame();
    });
    expect((await lselLayout(page)).shifted).toEqual(
      name === "chromium" ? ['div.mover "x" right 4px', 'div.mover "x" down 40px'] : [],
    );
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
    expect(await current(page)).toBe("Gamma log");
    await page.keyboard.press("G");
    await page.keyboard.press("Enter");
    expect(await status(page)).toBe("Opened Gamma log");
    expect(await problems()).toEqual([]);
  });

  test("a paged list moves a page with l and h, crosses pages with j and k, and keeps its height", async () => {
    const { page, problems } = await open();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.keyboard.press("4");
    expect(await fit(page)).toEqual({ rows: 8, fits: true });
    const list = page.getByRole("list", { name: "Items" });
    const state = async () => [
      await list.locator('li[aria-current="true"] .item').textContent(),
      await page.locator(".pager > span").textContent(),
      await list.locator("li").count(),
      Math.round((await list.boundingBox())?.height ?? 0),
    ];
    const height = Math.round((await list.boundingBox())?.height ?? 0);
    expect(await state()).toEqual(["Item 1", "Page 1 of 3", 8, height]);
    await page.keyboard.press("l");
    expect(await state()).toEqual(["Item 9", "Page 2 of 3", 8, height]);
    await page.keyboard.press("k");
    expect(await state()).toEqual(["Item 8", "Page 1 of 3", 8, height]);
    await page.keyboard.press("G");
    expect(await state()).toEqual(["Item 23", "Page 3 of 3", 8, height]);
    await page.keyboard.press("h");
    expect(await state()).toEqual(["Item 15", "Page 2 of 3", 8, height]);
    expect(await problems()).toEqual([]);
  });

  test("an empty paged list says why on one line, so its rows stay one line high", async () => {
    const { page, problems } = await open();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press("4");
    await page.keyboard.press("e");
    expect(await fit(page)).toEqual({ rows: 9, fits: true });
    const list = page.getByRole("list", { name: "Items" });
    const rows = await list
      .locator("li")
      .evaluateAll((all) => all.map((li) => Math.round(li.getBoundingClientRect().height)));
    // a line, its padding and its border: 21 + 16 + 1
    expect(rows).toEqual(Array(9).fill(38));
    expect(await list.locator("li").first().getAttribute("title")).toBe(
      "No items. m adds a hundred, and the list keeps its height while it is empty.",
    );
    expect(await problems()).toEqual([]);
  });

  test("a paged list's buttons hold still as its page count grows", async () => {
    const { page, problems } = await open();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.keyboard.press("4");
    expect(await fit(page)).toEqual({ rows: 8, fits: true });
    const pager = page.locator(".pager");
    const edges = async () => ({
      count: await pager.locator("> span").textContent(),
      buttons: await pager
        .locator("button")
        .evaluateAll((all) => all.map((b) => Math.round(b.getBoundingClientRect().x))),
    });
    const before = await edges();
    expect(before.count).toBe("Page 1 of 3");
    await page.keyboard.press("m");
    expect(await edges()).toEqual({ count: "Page 1 of 16", buttons: before.buttons });
    expect(await problems()).toEqual([]);
  });

  test("a fitted list fills the window without scrolling it, as the window and the hints change", async () => {
    const { page, problems } = await open();
    await page.setViewportSize({ width: 1000, height: 720 });
    await page.keyboard.press("5");
    const list = page.getByRole("list", { name: "Items" });
    const tall = await fit(page);
    expect(tall.fits).toBe(true);
    await page.keyboard.press("K");
    const folded = await fit(page);
    expect(folded.fits).toBe(true);
    expect(folded.rows).toBeGreaterThan(tall.rows);
    await page.setViewportSize({ width: 1000, height: 600 });
    const short = await fit(page);
    expect(short.fits).toBe(true);
    expect(short.rows).toBeLessThan(folded.rows);
    await page.keyboard.press("G");
    expect(await list.locator('li[aria-current="true"]').textContent()).toBe("Item 200");
    await page.keyboard.press("K");
    expect((await fit(page)).fits).toBe(true);
    expect(await problems()).toEqual([]);
  });

  test("a narrow pager gives its detail a line of its own, uncut, whatever the window", async () => {
    const { page, problems } = await open();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.keyboard.press("5");
    const pager = async () =>
      page.locator(".pager").evaluate((p) => {
        const foot = p.querySelector(".foot") as HTMLElement;
        const button = p.querySelector("button") as HTMLElement;
        return {
          own: foot.getBoundingClientRect().bottom <= button.getBoundingClientRect().top,
          cut: foot.scrollWidth > foot.clientWidth,
          text: foot.textContent,
        };
      });
    const beside = { own: false, cut: false, text: "200 items; the window sets how many show" };
    expect(await pager()).toEqual(beside);
    // a sidebar's width (typ's), in a window as wide as before
    await page.locator('section[aria-label="Fit"]').evaluate((s) => {
      (s as HTMLElement).style.width = "280px";
    });
    expect(await pager()).toEqual({ ...beside, own: true });
    expect(await problems()).toEqual([]);
  });

  test("a fitted list in a Page fill takes the height left in the window", async () => {
    const { page, problems } = await open();
    await page.keyboard.press("7");
    const list = page.getByRole("list", { name: "Items" });
    // the rows, and whether the room left in the page's body is less than a row; nothing scrolls
    const fill = async (size: { width: number; height: number }) => {
      await page.setViewportSize(size);
      await page.waitForFunction(
        () => !document.getAnimations().some((a) => a instanceof CSSTransition),
      );
      await page.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
      );
      return page.evaluate(() => {
        const body = document.querySelector("main.fill > .body") as HTMLElement;
        const ul = document.querySelector('ul[aria-label="Items"]') as HTMLElement;
        const first = body.firstElementChild?.getBoundingClientRect().top ?? 0;
        const last = body.lastElementChild?.getBoundingClientRect().bottom ?? 0;
        const left = body.clientHeight - (last - first);
        const root = document.documentElement;
        return {
          rows: ul.children.length,
          fits: left >= 0 && left < ul.offsetHeight / ul.children.length,
          scrolls: root.scrollHeight > root.clientHeight,
        };
      });
    };
    expect(await fill({ width: 1280, height: 600 })).toEqual({
      rows: 5,
      fits: true,
      scrolls: false,
    });
    expect(await fill({ width: 390, height: 844 })).toEqual({
      rows: 9,
      fits: true,
      scrolls: false,
    });
    expect(await list.locator("li").first().textContent()).toBe("Item 1");
    expect(await problems()).toEqual([]);
  });

  test("below a fitted list's minimum a Page fill scrolls by what it lacks, its footer under the list", async () => {
    const { page, problems } = await open();
    await page.keyboard.press("7");
    const fill = async (size: { width: number; height: number }) => {
      await page.setViewportSize(size);
      await page.waitForFunction(
        () => !document.getAnimations().some((a) => a instanceof CSSTransition),
      );
      await page.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
      );
      return page.evaluate(() => {
        const ul = document.querySelector('ul[aria-label="Items"]') as HTMLElement;
        const pager = ul.nextElementSibling as HTMLElement;
        const footer = document.querySelector("main.fill > footer") as HTMLElement;
        const root = document.documentElement;
        return {
          rows: ul.children.length,
          scrolls: root.scrollHeight - root.clientHeight,
          under: footer.getBoundingClientRect().top >= pager.getBoundingClientRect().bottom,
        };
      });
    };
    const short = await fill({ width: 1280, height: 500 });
    // short enough that the rows would reach into the footer
    const shorter = await fill({ width: 1280, height: 400 });
    expect([short.rows, short.under, shorter.rows, shorter.under]).toEqual([3, true, 3, true]);
    // a few pixels, as many as the font metrics leave the rows short: 2 or 3 by browser and system
    expect(short.scrolls).toBeGreaterThan(0);
    expect(short.scrolls).toBeLessThan(10);
    // 100 px less window, 100 px more to scroll, give or take a rounded pixel
    expect(Math.abs(shorter.scrolls - short.scrolls - 100)).toBeLessThanOrEqual(1);
    // grown back past the minimum, the page holds the window again
    expect(await fill({ width: 1280, height: 600 })).toEqual({ rows: 5, scrolls: 0, under: true });
    expect(await problems()).toEqual([]);
  });

  test("a grid fits whole rows in its box, keeps its height on every page, and moves by tile, row and page", async () => {
    const { page, problems } = await open();
    await page.setViewportSize({ width: 1000, height: 900 });
    await page.keyboard.press("6");
    const grid = page.getByRole("list", { name: "Tiles" });
    await grid.waitFor();
    const state = async () => {
      const cols = await grid.evaluate(
        (ul) => getComputedStyle(ul).gridTemplateColumns.split(" ").length,
      );
      return {
        cols,
        tiles: await grid.locator("li").count(),
        current: await grid.locator('li[aria-current="true"]').textContent(),
        pager: await page.locator(".lsel-grid .pager > span").textContent(),
        height: Math.round((await page.locator(".lsel-grid").boundingBox())?.height ?? 0),
      };
    };
    // a 360px box (40vh) at 1000×900, 918px wide: 7 columns of 120px or more, and 2 rows come closest to 4:5
    const first = await state();
    const page1 = { cols: 7, tiles: 14, pager: "Page 1 of 2", height: first.height };
    const page2 = { cols: 7, tiles: 9, pager: "Page 2 of 2", height: first.height };
    expect(first).toEqual({ ...page1, current: "Item 1" });
    await page.keyboard.press("l");
    expect(await state()).toEqual({ ...page1, current: "Item 2" });
    await page.keyboard.press("j");
    expect(await state()).toEqual({ ...page1, current: "Item 9" });
    await page.keyboard.press("PageDown");
    expect(await state()).toEqual({ ...page2, current: "Item 23" });
    await page.keyboard.press("PageUp");
    expect(await state()).toEqual({ ...page1, current: "Item 9" });
    await page.keyboard.press("G");
    expect(await state()).toEqual({ ...page2, current: "Item 23" });
    expect(await lselLayout(page)).toEqual(LSEL_LAYOUT);
    expect(await problems()).toEqual([]);
  });

  test("toggles that arrive late keep their row, and on a phone page with ] and [ to reach every one", async () => {
    const { page, problems } = await open();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press("3");
    const group = page.getByRole("group", { name: "Players" });
    // the field under the toggles
    const under = async () => Math.round((await page.getByLabel("Name").boundingBox())?.y ?? 0);
    const before = { under: await under(), toggles: await group.locator(".line > .item").count() };
    await group.getByRole("button", { name: "AntennaTower" }).waitFor();
    expect({ under: await under(), toggles: 0 }).toEqual(before);
    // each page: its toggles' names, and whether every one is whole and inside the row
    const shown = () =>
      group.evaluate((g) => {
        const row = g.getBoundingClientRect();
        const items = [...g.querySelectorAll<HTMLElement>(".line > .item")];
        return {
          names: items.map((b) => b.textContent ?? ""),
          whole: items.every((b) => {
            const r = b.getBoundingClientRect();
            return b.scrollWidth <= b.clientWidth && r.left >= row.left && r.right <= row.right;
          }),
        };
      });
    const next = group.getByRole("button", { name: "Next players" });
    const seen: string[] = [];
    let pages = 1;
    for (;;) {
      const { names, whole } = await shown();
      expect(whole).toBe(true);
      expect(await under()).toBe(before.under);
      seen.push(...names);
      if (await next.isDisabled()) break;
      await page.keyboard.press("]");
      pages++;
    }
    expect(pages).toBeGreaterThan(1);
    expect(seen).toEqual([
      "AntennaTower",
      "Rectifier94",
      "Reason_ING",
      "Lurker",
      "PanFryer",
      "Zone_Runner",
      "BlueHole",
      "Redzone_7",
      "CrateHunter",
      "Chicken_Dinner",
    ]);
    await group.getByRole("button", { name: "Chicken_Dinner" }).click();
    expect(
      await group.getByRole("button", { name: "Chicken_Dinner" }).getAttribute("aria-pressed"),
    ).toBe("true");
    for (let i = 1; i < pages; i++) await page.keyboard.press("[");
    expect((await shown()).names[0]).toBe("AntennaTower");
    expect(await group.getByRole("button", { name: "Previous players" }).isDisabled()).toBe(true);
    // a laptop's wider row needs fewer pages
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForFunction(
      (phone) =>
        Number(document.querySelector(".lsel-toggles .pager > span")?.textContent?.split("/")[1]) <
        phone,
      pages,
    );
    expect((await shown()).whole).toBe(true);
    expect(await lselLayout(page)).toEqual(LSEL_LAYOUT);
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

  test("? lists the live keys, and Esc closes the list", async () => {
    const { page, problems } = await open();
    await page.keyboard.press("?");
    const dialog = page.getByRole("dialog", { name: "Keys" });
    const listed = await dialog.locator("dd").allTextContents();
    expect(listed).toEqual([
      "Search",
      "Open",
      "Hide these keys",
      "Show list",
      "Show states",
      "Show form",
      "Show pages",
      "Show fit",
      "Show grid",
      "Show fill",
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
    // one line that never wraps, its whole text in the title when it is cut short
    expect(
      await alert.evaluate((el) => [getComputedStyle(el).whiteSpace, el.parentElement?.title]),
    ).toEqual(["nowrap", (await alert.textContent())?.replace(/\s+/g, " ").trim()]);
    await answer("answer 2");
    await page.keyboard.press("r");
    await alert.filter({ hasText: "try 4" }).waitFor();

    await page.getByRole("button", { name: "fast" }).click();
    await answer("answer 5");
    expect(await alert.count()).toBe(0);
    expect(await problems()).toEqual([]);
  });

  test("a failure after an answer of null shows no old results, since there are none", async () => {
    const { page, problems } = await open();
    await page.keyboard.press("2");
    await page.locator(".answer", { hasText: "answer 1" }).waitFor();
    await page.getByRole("button", { name: "none" }).click();
    await page.getByText("Nothing yet.").waitFor();
    await page.getByRole("button", { name: "fail" }).click();
    const alert = page.getByRole("alert");
    await alert.waitFor();
    expect(await alert.textContent()).toBe("The playground's upstream is down (try 3). r retries.");
    expect(await page.locator(".lsel-status").getAttribute("title")).toBe(
      "The playground's upstream is down (try 3). r retries.",
    );
    expect(await problems()).toEqual([]);
  });

  test("focus is the accent at once, and a pressed toggle keeps its accent under the pointer", async () => {
    const { page, problems } = await open();
    // WebKit's Tab skips buttons: it lands on the search box, which is fine
    await page.keyboard.press("Tab");
    // read in the same frame: a transitioned outline would still be the text's color
    expect(
      await page.evaluate(() => {
        const el = document.activeElement;
        return el === null ? "" : getComputedStyle(el).outlineColor;
      }),
    ).toBe(rgb(palette.accent));
    await page.keyboard.press("Escape");
    await page.keyboard.press("3");
    const save = page.getByRole("button", { name: "Save", exact: true });
    await save.click();
    // WebKit marks hover only when the pointer arrives
    await page.mouse.move(1, 1);
    await save.hover();
    expect(await settled(page, 'button[aria-pressed="true"]:hover', rgb(palette.accent))).toBe(
      rgb(palette.accent),
    );
    expect(await problems()).toEqual([]);
  });

  test("on a touch screen buttons show no keys, and a tapped one isn't left hovered", async () => {
    const ctx = await browser().newContext({
      hasTouch: true,
      viewport: { width: 390, height: 844 },
    });
    const page = await ctx.newPage();
    const watch = watchPage(page);
    await page.goto(url());
    await mounted(page);
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    // the six tabs' and the Keys button's
    expect(
      await page.locator("button kbd").evaluateAll((all) => ({
        shown: all.filter((k) => k.checkVisibility()).length,
        of: all.length,
      })),
    ).toEqual({ shown: 0, of: 8 });
    const pin = page.getByRole("button", { name: "Pin" }).first();
    await pin.tap();
    expect(await status(page)).toBe("Pinned Alpha weekly");
    expect(await settled(page, "li:first-child button", rgb(palette.overlay))).toBe(
      rgb(palette.overlay),
    );
    expect(await watch.take()).toEqual([]);
    await ctx.close();
  });

  test("the loading bar stays away for a fast answer and shows for a slow one, moving nothing", async () => {
    const page = await browser().newPage();
    const watch = watchPage(page);
    await page.addInitScript(() => {
      new MutationObserver(() => {
        if (document.querySelector(".lsel-loading.shown")) {
          (window as unknown as { barShown: boolean }).barShown = true;
        }
      }).observe(document, { subtree: true, attributes: true, childList: true });
    });
    await page.goto(url());
    await mounted(page);
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
    const page = await browser().newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(url());
    await mounted(page);
    await page.keyboard.press("2");
    await page.getByRole("button", { name: "slow" }).click();
    await page.locator(".lsel-loading.shown").waitFor({ state: "attached" });
    const segment = await page.locator(".lsel-loading .segment").evaluate((el) => ({
      animation: getComputedStyle(el).animationName,
      full: el.getBoundingClientRect().width === window.innerWidth,
    }));
    expect(segment).toEqual({ animation: "none", full: true });
  });

  test("a Swap is as wide as its widest option, which is in neither its text nor its name", async () => {
    const { page, problems } = await open();
    await page.keyboard.press("3");
    expect(await page.getByRole("button", { name: "Copy c", exact: true }).textContent()).toBe(
      "Copy c",
    );
    const swap = page.locator(".saved .lsel-swap");
    const read = () =>
      swap.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const text = el.firstElementChild?.getBoundingClientRect();
        return {
          text: el.textContent,
          width: Math.round(box.width),
          start: Math.round((text?.x ?? -1) - box.x),
        };
      });
    const before = await read();
    expect([before.text, before.start]).toEqual(["Not saved", 0]);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    expect(await read()).toEqual({ text: "Saved at 12:00 PM", width: before.width, start: 0 });
    // an empty text keeps the line's baseline: the row neither grows nor moves when it fills
    const hold = page.locator(".hold");
    const line = () =>
      hold.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return { text: el.textContent, top: Math.round(box.y), height: Math.round(box.height) };
      });
    const empty = await line();
    expect([empty.text, empty.height]).toEqual(["Hold ", 21]);
    await page.getByRole("button", { name: "Fill", exact: true }).click();
    expect(await line()).toEqual({ text: "Hold full", top: empty.top, height: 21 });
    expect(await problems()).toEqual([]);
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
    const error = rgb(palette.error);
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
