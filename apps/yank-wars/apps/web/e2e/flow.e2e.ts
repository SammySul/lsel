// The real app (DEV server) end to end in each browser. Env: BROWSERS.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { browsers, launch, watchPage } from "@sammysul/lsel/testing";
import {
  comparePuzzles,
  createSession,
  currentRun,
  destroySession,
  feedKey,
  formatKeys,
  isVimKey,
  type KeyLog,
  type Puzzle,
  parseKeys,
  parsePuzzle,
  RESET,
  type VimKey,
} from "@yank-wars/engine";
import { observe } from "@yank-wars/engine/oracle/observe";
import type { Observed } from "@yank-wars/engine/oracle/types";
import type { Browser, BrowserContext, Page } from "playwright-core";
import type { RoundProbeState } from "../src/dev/roundProbe.ts";
import { startVite, typeKeys, VITE, type Vite } from "./lib.ts";

const PUZZLES_DIR = join(import.meta.dir, "../../../puzzles/handmade");
const puzzles: Puzzle[] = readdirSync(PUZZLES_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => parsePuzzle(JSON.parse(readFileSync(join(PUZZLES_DIR, f), "utf8")), f.slice(0, -5)));
// The list's order (comparePuzzles); "next" walks it and wraps.
const listOrder = [...puzzles].sort(comparePuzzles);
const ofDifficulty = (d: Puzzle["difficulty"]) => listOrder.filter((p) => p.difficulty === d);
const P = (id: string): Puzzle => {
  const p = puzzles.find((x) => x.id === id);
  if (p === undefined) throw new Error(`no puzzle ${id}`);
  return p;
};
const CAP_MS = 240_000;

/** The probe's log crosses the page boundary as JSON: check every entry before trusting it. */
function toKeyLog(log: readonly string[]): KeyLog {
  return log.map((k) => {
    if (k === RESET) return RESET;
    if (!isVimKey(k)) throw new Error(`not a vim key in the round log: ${k}`);
    return k;
  });
}

/** What the server will do with a run: a headless session fed the logged keys. */
function replayObserved(p: Puzzle, keys: readonly VimKey[]): Observed {
  const s = createSession(p, { parent: document.body });
  try {
    for (const k of keys) feedKey(s, k);
    return observe(s);
  } finally {
    destroySession(s);
  }
}

// Short edits whose cursor and buffer a live editor must agree on with the replay.
const PARITY_RUNS = [
  "li<Del><Del><Esc>",
  "A<CR>x<Esc>",
  "$rx",
  "3i<CR><Esc>",
  "jA<BS><BS>X<Esc>",
  "Axy<BS>z<Esc>j.",
  "jwi<Del>y<Esc>j0.",
];

let vite: Vite;
beforeAll(async () => {
  vite = await startVite();
  // Warm vite's dependency optimizer once, so no test sees its reload.
  const b = await launch("chromium");
  const p = await b.newPage();
  for (let i = 0; i < 2; i++) await p.goto(`${vite.base}/#/`, { waitUntil: "networkidle" });
  await b.close();
}, 60_000);
afterAll(() => vite?.stop());

async function probe(page: Page): Promise<RoundProbeState> {
  const s = await page.evaluate(() => window.__ywRound?.state() ?? null);
  if (s === null) throw new Error("no round on the page");
  return s;
}

/** Navigates by hash (as the app's own links do) and waits for that puzzle's fresh round. */
async function openRound(page: Page, id: string): Promise<void> {
  await page.evaluate((h) => {
    location.hash = h;
  }, `#/p/${id}`);
  await waitRound(page, id);
}

async function waitRound(page: Page, id: string): Promise<void> {
  await page.waitForFunction(
    (want) => {
      const s = window.__ywRound?.state();
      return s?.puzzle === want && s.phase === "study" && s.keys === 0 && s.focused;
    },
    id,
    { timeout: 10_000 },
  );
}

async function text(page: Page, selector: string): Promise<string> {
  return ((await page.locator(selector).first().textContent()) ?? "").trim();
}

async function visible(page: Page, selector: string): Promise<boolean> {
  return page.locator(selector).first().isVisible();
}

async function cardShown(page: Page): Promise<void> {
  await page.locator(".card").waitFor({ state: "visible", timeout: 10_000 });
}

async function card(page: Page) {
  const dd = async (label: string) =>
    ((await page.locator(".stats div", { hasText: label }).locator("dd").textContent()) ?? "")
      .replace(/\s+/g, " ")
      .trim();
  return {
    headline: await text(page, ".card h2"),
    keys: (await page.locator(".card .big").count()) > 0 ? await text(page, ".card .big") : null,
    time: await dd("Time"),
    runs: await dd("Runs"),
    best: await dd("Your best"),
    notation: await text(page, ".notation pre"),
  };
}

async function gutter(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll(".pane:first-child .cm-lineNumbers .cm-gutterElement")]
      .filter((el) => (el as HTMLElement).style.visibility !== "hidden")
      .map((el) => el.textContent ?? ""),
  );
}

async function hash(page: Page): Promise<string> {
  return page.evaluate(() => location.hash);
}

async function selfCheckDone(page: Page): Promise<string> {
  await page.waitForFunction(() => {
    const t = document.querySelector(".selfcheck")?.textContent ?? "";
    return t !== "" && !t.includes("pending");
  });
  return text(page, ".selfcheck");
}

async function playToLockIn(page: Page, p: Puzzle, prefix = ""): Promise<void> {
  await openRound(page, p.id);
  await page.keyboard.press("Space");
  await typeKeys(page, prefix + formatKeys(p.solution));
  await cardShown(page);
}

for (const name of browsers()) {
  describe(name, () => {
    let browser: Browser;
    beforeAll(async () => {
      browser = await launch(name);
    }, 60_000);
    afterAll(async () => {
      await browser?.close();
    });

    // One fresh context (fresh localStorage) per test; `problems` are console warnings/errors.
    async function fresh(opts: { clock?: boolean } = {}) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      if (opts.clock) await ctx.clock.install({ time: Date.UTC(2026, 0, 1) });
      const page = await ctx.newPage();
      const watch = watchPage(page, { ignore: VITE });
      await page.goto(`${vite.base}/#/`, { waitUntil: "networkidle" });
      await page.bringToFront();
      await page.locator(".table a.row").first().waitFor();
      return { ctx, page, problems: watch.take };
    }

    async function done(ctx: BrowserContext, problems: () => Promise<string[]>) {
      const p = await problems();
      await ctx.close();
      expect(p).toEqual([]);
    }

    test("the puzzle list opens a round from the keyboard, easiest first", async () => {
      const { ctx, page, problems } = await fresh();
      const titles = await page.locator(".table a.row .title").allTextContents();
      expect(titles).toEqual(listOrder.map((p) => p.title));
      const pars = await page.locator(".table a.row span.num:nth-of-type(3)").allTextContents();
      expect(pars.map(Number)).toEqual(listOrder.map((p) => p.solution.length));
      await page.keyboard.press("j");
      await page.keyboard.press("j");
      await page.keyboard.press("k");
      await page.keyboard.press("Enter");
      const second = listOrder[1] as Puzzle;
      await waitRound(page, second.id);
      expect(await hash(page)).toBe(`#/p/${second.id}`);
      expect(await text(page, ".hud h1")).toBe(second.title);
      expect(await visible(page, ".study")).toBe(true);
      await done(ctx, problems);
    });

    test("study swallows keys; Space starts; the counter ticks once per key", async () => {
      const { ctx, page, problems } = await fresh();
      const p = P("indent-body");
      await openRound(page, p.id);
      await typeKeys(page, "j3>>x");
      let s = await probe(page);
      expect([s.phase, s.log, s.doc]).toEqual(["study", [], p.start]);
      expect(await text(page, ".score .keys")).toBe("0");
      await page.keyboard.press("Space");
      expect(await visible(page, ".study")).toBe(false);
      const counts: string[] = [];
      for (const k of ["l", "<Esc>", ":", "<Esc>", "u", "h"]) {
        await typeKeys(page, k);
        counts.push(await text(page, ".score .keys"));
      }
      expect(counts).toEqual(["1", "2", "3", "4", "5", "6"]);
      s = await probe(page);
      expect([s.phase, s.log, s.doc]).toEqual([
        "playing",
        ["l", "<Esc>", ":", "<Esc>", "u", "h"],
        p.start,
      ]);
      await done(ctx, problems);
    });

    test("Enter is a ready key as well", async () => {
      const { ctx, page, problems } = await fresh();
      await openRound(page, "indent-body");
      await page.keyboard.press("Enter");
      const s = await probe(page);
      expect([s.phase, s.log]).toEqual(["playing", []]);
      await done(ctx, problems);
    });

    test("<C-CR> resets: counter 0, run 2, fresh buffer; only the final run is scored", async () => {
      const { ctx, page, problems } = await fresh();
      const p = P("indent-body");
      await openRound(page, p.id);
      await page.keyboard.press("Space");
      await typeKeys(page, "xx");
      expect(await text(page, ".score .keys")).toBe("2");
      await page.keyboard.press("Control+Enter");
      expect(await text(page, ".score .keys")).toBe("0");
      expect(await text(page, ".hud .runs")).toBe("run 2");
      let s = await probe(page);
      expect([s.doc, s.cursor, s.mode, s.log]).toEqual([
        p.start,
        { line: 1, col: 1 },
        "normal",
        ["x", "x", RESET],
      ]);
      await typeKeys(page, p.solution);
      await cardShown(page);
      const c = await card(page);
      expect([c.headline, c.keys, c.runs, c.notation]).toEqual(["Locked in", "4", "2", "j3>>"]);
      expect(await selfCheckDone(page)).toBe("DEV self-check: ok");
      s = await probe(page);
      expect(s.doc).toBe(p.target);
      await done(ctx, problems);
    });

    test("<C-S-CR> gives up; r retries the same puzzle", async () => {
      const { ctx, page, problems } = await fresh();
      await openRound(page, "indent-body");
      await page.keyboard.press("Space");
      await typeKeys(page, "x");
      await page.keyboard.press("Control+Shift+Enter");
      await cardShown(page);
      const c = await card(page);
      expect([c.headline, c.keys, c.runs, c.notation]).toEqual(["Gave up", null, "1", "x"]);
      await page.keyboard.press("r");
      await waitRound(page, "indent-body");
      expect(await hash(page)).toBe("#/p/indent-body");
      expect(await text(page, ".score .keys")).toBe("0");
      await done(ctx, problems);
    });

    test("the 4-minute cap expires the round on the fake clock", async () => {
      const { ctx, page, problems } = await fresh({ clock: true });
      await openRound(page, "indent-body");
      await page.keyboard.press("Space");
      await typeKeys(page, "x");
      await page.clock.fastForward(CAP_MS - 1_000);
      expect((await probe(page)).phase).toBe("playing");
      expect(await text(page, ".hud .clock")).toMatch(/^3:59\.\d$/);
      await page.clock.fastForward(2_000);
      expect((await probe(page)).phase).toBe("expired");
      await page.clock.runFor(10);
      await cardShown(page);
      const c = await card(page);
      expect([c.headline, c.time, c.runs, c.notation]).toEqual(["Time's up", "4:00.0", "1", "x"]);
      await page.keyboard.press("r");
      await waitRound(page, "indent-body");
      await done(ctx, problems);
    });

    test("a key at the cap with no frame since expires the round once and never reaches the card", async () => {
      const { ctx, page, problems } = await fresh({ clock: true });
      await openRound(page, "indent-body");
      await page.keyboard.press("Space");
      // Paused: timers run only when the test advances the clock.
      await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000);
      // As in a background tab: no animation frame runs between the cap and the key.
      await page.evaluate(() => {
        window.requestAnimationFrame = () => 0;
      });
      await page.clock.runFor(50);
      await page.clock.fastForward(CAP_MS);
      expect((await probe(page)).phase).toBe("playing");
      await page.keyboard.press("Enter");
      const s = await probe(page);
      // Not showResult: Playwright's WebKit clock can run a 0 ms timer while paused; the hash check below is the guard.
      expect([s.phase, s.log]).toEqual(["expired", []]);
      await page.clock.runFor(10);
      await cardShown(page);
      expect((await card(page)).headline).toBe("Time's up");
      expect(await hash(page)).toBe("#/p/indent-body");
      await done(ctx, problems);
    });

    test("every puzzle locks in on its reference solution with the self-check ok; Enter walks the list", async () => {
      const { ctx, page, problems } = await fresh();
      const first = listOrder[0] as Puzzle;
      await openRound(page, first.id);
      const rows: string[] = [];
      for (const [i, p] of listOrder.entries()) {
        await waitRound(page, p.id);
        await page.keyboard.press("Space");
        await typeKeys(page, p.solution);
        await cardShown(page);
        const c = await card(page);
        const s = await probe(page);
        const badge = await selfCheckDone(page);
        rows.push(
          JSON.stringify([
            p.id,
            c.headline,
            c.keys,
            c.notation,
            badge,
            s.doc === p.target,
            s.log.length,
          ]),
        );
        expect(rows.at(-1)).toBe(
          JSON.stringify([
            p.id,
            "Locked in",
            String(p.solution.length),
            formatKeys(p.solution),
            "DEV self-check: ok",
            true,
            p.solution.length,
          ]),
        );
        await page.keyboard.press("Enter");
        const next = listOrder[(i + 1) % listOrder.length] as Puzzle;
        await page.waitForFunction((h) => location.hash === h, `#/p/${next.id}`);
      }
      await done(ctx, problems);
    }, 60_000);

    test("result card: r retries, Esc goes back to the list with the best filled in", async () => {
      const { ctx, page, problems } = await fresh();
      const p = P("indent-body");
      await playToLockIn(page, p);
      await page.keyboard.press("r");
      await waitRound(page, p.id);
      await page.keyboard.press("Space");
      await typeKeys(page, p.solution);
      await cardShown(page);
      await page.keyboard.press("Escape");
      await page.locator(".table a.row").first().waitFor();
      expect(await hash(page)).toBe("#/");
      const row = page.locator(".table a.row", { hasText: p.title });
      expect(((await row.locator(".best").textContent()) ?? "").trim()).toMatch(
        /^4 in 0:\d\d\.\d$/,
      );
      expect(await row.locator(".mark").getAttribute("class")).toContain("par");
      expect(await text(page, ".progress")).toBe(
        `1 of ${puzzles.length} solved · 1 at par or better`,
      );
      await done(ctx, problems);
    });

    // Two tabs, two rounds and a reload: Firefox needs more than the default 5 s.
    test("bests and line numbers persist across reload and a stale second tab does not clobber them", async () => {
      const { ctx, page: a, problems } = await fresh();
      const b = await ctx.newPage();
      const bProblems = watchPage(b, { ignore: VITE }).take;
      await b.goto(`${vite.base}/#/`, { waitUntil: "networkidle" });
      const indent = P("indent-body");
      const css = P("css-comment");
      await openRound(a, indent.id);
      await a.keyboard.press("Control+Shift+L");
      expect(await text(a, ".hud button[aria-pressed]")).toBe("Absolute numbers");
      await a.keyboard.press("Space");
      await typeKeys(a, indent.solution);
      await cardShown(a);
      // b loaded before any of that: its in-memory prefs are empty and relative.
      await playToLockIn(b, css);
      await playToLockIn(b, indent, "<Esc><Esc>");
      const worse = await card(b);
      expect([worse.keys, worse.best.replace(/\d:\d\d\.\d/, "T")]).toEqual(["6", "4 keys in T"]);
      await a.reload({ waitUntil: "networkidle" });
      await a.evaluate(() => {
        location.hash = "#/";
      });
      await a.locator(".table a.row").first().waitFor();
      const best = async (title: string) =>
        ((await a.locator(".table a.row", { hasText: title }).locator(".best").textContent()) ?? "")
          .trim()
          .replace(/ in .*/, "");
      expect([await best(indent.title), await best(css.title)]).toEqual([
        String(indent.solution.length),
        String(css.solution.length),
      ]);
      await openRound(a, indent.id);
      expect(await text(a, ".hud button[aria-pressed]")).toBe("Absolute numbers");
      expect(await gutter(a)).toEqual(["1", "2", "3", "4", "5"]);
      expect(await bProblems()).toEqual([]);
      await done(ctx, problems);
    }, 15_000);

    test("the command line: : shows in the status line, <Esc> cancels, <Up> recalls, errors and blocked commands leave the round going", async () => {
      const { ctx, page, problems } = await fresh();
      const p = P("indent-body");
      await openRound(page, p.id);
      await page.keyboard.press("Space");
      await typeKeys(page, ":s/x/y");
      expect(await text(page, ".status .prompt")).toBe(":s/x/y");
      await typeKeys(page, "<Esc>");
      expect(await page.locator(".status .prompt").count()).toBe(0);
      expect(await text(page, ".status .mode")).toBe("-- NORMAL --");
      // vim keeps a canceled line in the history too
      await typeKeys(page, ":<Up>");
      expect(await text(page, ".status .prompt")).toBe(":s/x/y");
      await typeKeys(page, "<Esc>:s/\\(/x/<CR>");
      expect(await text(page, ".status .message.error")).toBe("E54: Unmatched \\(");
      await typeKeys(page, ":w<CR>");
      expect(await text(page, ".status .message")).toBe("lock-in is automatic");
      await typeKeys(page, ":set nu<CR>");
      expect(await text(page, ".status .message")).toBe(
        "mappings and :set are disabled in Yank Wars",
      );
      const s = await probe(page);
      expect([s.phase, s.doc, s.log.length]).toEqual(["playing", p.start, 30]);
      expect(await text(page, ".score .keys")).toBe("30");
      await typeKeys(page, p.solution);
      await cardShown(page);
      expect((await card(page)).headline).toBe("Locked in");
      await done(ctx, problems);
    });

    test("result card: s shows the par solution, c copies the run, and the best before is listed", async () => {
      const { ctx, page, problems } = await fresh();
      if (name === "chromium") await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
      const p = P("indent-body");
      await playToLockIn(page, p);
      expect((await card(page)).best).toBe("New best");
      await page.keyboard.press("r");
      await waitRound(page, p.id);
      await page.keyboard.press("Space");
      await typeKeys(page, `x<Esc>u${formatKeys(p.solution)}`);
      await cardShown(page);
      const c = await card(page);
      expect([c.keys, c.notation, c.best.replace(/\d:\d\d\.\d/, "T")]).toEqual([
        "7",
        "x<Esc>uj3>>",
        "4 keys in T",
      ]);
      expect(await page.locator(".card details").getAttribute("open")).toBeNull();
      await page.keyboard.press("s");
      expect(await page.locator(".card details").getAttribute("open")).not.toBeNull();
      expect(await text(page, ".card details pre")).toBe("j3>>");
      await page.keyboard.press("c");
      if (name === "chromium") {
        await page.locator(".notation button", { hasText: "Copied" }).waitFor();
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("x<Esc>uj3>>");
      } else {
        // headless Firefox and WebKit may refuse clipboard writes; the button must say which
        await page.locator(".notation button", { hasText: /Copied|Copy failed/ }).waitFor();
      }
      await done(ctx, problems);
    });

    test("result card: y copies a share line after a lock-in, and is not offered after giving up", async () => {
      const { ctx, page, problems } = await fresh();
      if (name === "chromium") await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
      const p = P("indent-body");
      await playToLockIn(page, p);
      await page.keyboard.press("y");
      if (name === "chromium") {
        await page.locator(".actions .share", { hasText: "Copied" }).waitFor();
        const shared = await page.evaluate(() => navigator.clipboard.readText());
        expect(shared.replace(/\d:\d\d\.\d/, "T")).toBe(
          `Yank Wars · Indent the body\n4 keys, par 4 · T\n${vite.base}/#/p/indent-body`,
        );
      } else {
        await page.locator(".actions .share", { hasText: /Copied|Copy failed/ }).waitFor();
      }
      await page.keyboard.press("r");
      await waitRound(page, p.id);
      await page.keyboard.press("Space");
      await page.keyboard.press("Control+Shift+Enter");
      await cardShown(page);
      expect(await text(page, ".card h2")).toBe("Gave up");
      expect(await page.locator(".actions .share").count()).toBe(0);
      await done(ctx, problems);
    });

    test("the puzzle list moves with the arrow keys as well", async () => {
      const { ctx, page, problems } = await fresh();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("Enter");
      await waitRound(page, (listOrder[2] as Puzzle).id);
      await done(ctx, problems);
    });

    const titles = (page: Page) => page.locator(".table a.row .title").allTextContents();

    test("the filter: number keys and chips pick a difficulty, / searches, Esc clears, 0 shows all", async () => {
      const { ctx, page, problems } = await fresh();
      await page.keyboard.press("1");
      expect(await titles(page)).toEqual(ofDifficulty("easy").map((p) => p.title));
      await page.keyboard.press("/");
      await page.keyboard.type("rust");
      expect(await page.locator(".search").inputValue()).toBe("rust");
      const easyRust = ofDifficulty("easy").filter((p) => p.language === "rust");
      expect(easyRust.length).toBeGreaterThan(1);
      expect(await titles(page)).toEqual(easyRust.map((p) => p.title));
      expect(await text(page, ".count")).toBe(`${easyRust.length} of ${puzzles.length} puzzles`);
      await page.keyboard.type("x");
      expect(await titles(page)).toEqual([]);
      expect(await text(page, ".lsel-empty")).toContain("No puzzles match.");
      await page.keyboard.press("Escape");
      expect(await page.locator(".search").inputValue()).toBe("");
      await page.keyboard.press("Escape");
      expect(await page.evaluate(() => document.activeElement?.className ?? "")).not.toContain(
        "search",
      );
      await page.keyboard.press("0");
      expect(await titles(page)).toEqual(listOrder.map((p) => p.title));
      await page.locator(".chip", { hasText: "hard" }).click();
      expect(await titles(page)).toEqual(ofDifficulty("hard").map((p) => p.title));
      await page.locator(".chip", { hasText: "hard" }).click();
      expect(await titles(page)).toEqual(listOrder.map((p) => p.title));
      await done(ctx, problems);
    });

    test("the search keeps arrows and Enter for the list, and keeps letters for the query", async () => {
      const { ctx, page, problems } = await fresh();
      await page.keyboard.press("/");
      await page.keyboard.type("substitute");
      const matches = listOrder.filter((p) => p.tags?.includes("substitute"));
      expect(await titles(page)).toEqual(matches.map((p) => p.title));
      await page.keyboard.type(" ");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await waitRound(page, (matches[1] as Puzzle).id);
      await done(ctx, problems);
    });

    test("difficulty and unsolved survive a reload; the search text does not", async () => {
      const { ctx, page, problems } = await fresh();
      const easy = ofDifficulty("easy");
      await playToLockIn(page, easy[0] as Puzzle);
      await page.keyboard.press("Escape");
      await page.locator(".table a.row").first().waitFor();
      await page.keyboard.press("1");
      await page.keyboard.press("u");
      await page.keyboard.press("/");
      await page.keyboard.type("o");
      await page.reload({ waitUntil: "networkidle" });
      await page.locator(".table a.row").first().waitFor();
      expect(await page.locator(".search").inputValue()).toBe("");
      expect(await titles(page)).toEqual(easy.slice(1).map((p) => p.title));
      expect(await page.locator(".chip[aria-pressed=true]").allTextContents()).toEqual([
        "easy",
        "Unsolved",
      ]);
      await done(ctx, problems);
    });

    test("a phone-sized window gets the keyboard notice; Play anyway shows the list", async () => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      const watch = watchPage(page, { ignore: VITE });
      await page.goto(`${vite.base}/#/`, { waitUntil: "networkidle" });
      expect(await text(page, ".needs-keyboard h2")).toBe("Yank Wars needs a keyboard");
      expect(await page.locator(".table a.row").count()).toBe(0);
      await page.getByRole("button", { name: "Play anyway" }).click();
      expect(await page.locator(".table a.row").count()).toBe(puzzles.length);
      await done(ctx, watch.take);
    });

    test("narrowing the window keeps a round in progress; a round link waits behind the notice until the window widens", async () => {
      const { ctx, page, problems } = await fresh();
      const p = P("indent-body");
      await openRound(page, p.id);
      await page.keyboard.press("Space");
      await typeKeys(page, "x");
      await page.setViewportSize({ width: 600, height: 800 });
      await typeKeys(page, "x");
      const s = await probe(page);
      expect([s.puzzle, s.phase, s.log]).toEqual([p.id, "playing", ["x", "x"]]);
      expect(await page.locator(".needs-keyboard").count()).toBe(0);
      await page.evaluate(() => {
        location.hash = "#/";
      });
      await page.locator(".needs-keyboard").waitFor();
      await page.evaluate((h) => {
        location.hash = h;
      }, `#/p/${p.id}`);
      expect(await text(page, ".needs-keyboard h2")).toBe("Yank Wars needs a keyboard");
      await page.setViewportSize({ width: 1280, height: 800 });
      await waitRound(page, p.id);
      expect(await page.locator(".needs-keyboard").count()).toBe(0);
      await done(ctx, problems);
    });

    test("the icon, touch icon and preview card are served and linked", async () => {
      const { ctx, page, problems } = await fresh();
      expect(await page.locator(".needs-keyboard").count()).toBe(0);
      const attr = (sel: string, name: string) => page.locator(sel).getAttribute(name);
      expect(await attr('link[rel="icon"]', "href")).toBe("/favicon.svg");
      expect(await attr('link[rel="apple-touch-icon"]', "href")).toBe("/apple-touch-icon.png");
      expect(await attr('meta[property="og:image"]', "content")).toBe(
        "https://yankwars.app/og.png",
      );
      expect(await attr('footer a[href*="git.sammysul.com"]', "href")).toBe(
        "https://git.sammysul.com/SammySul/yank-wars",
      );
      const pkg = JSON.parse(readFileSync(join(import.meta.dir, "../../../package.json"), "utf8"));
      expect(await text(page, "footer .version")).toBe(`v${pkg.version}`);
      for (const [path, type] of [
        ["/favicon.svg", "image/svg+xml"],
        ["/apple-touch-icon.png", "image/png"],
        ["/og.png", "image/png"],
      ] as const) {
        const r = await page.request.get(`${vite.base}${path}`);
        expect([path, r.status(), r.headers()["content-type"]?.split(";")[0]]).toEqual([
          path,
          200,
          type,
        ]);
      }
      await done(ctx, problems);
    });

    test("Enter on the result card walks only the puzzles the filter shows", async () => {
      const { ctx, page, problems } = await fresh();
      await page.keyboard.press("2");
      const medium = ofDifficulty("medium");
      await playToLockIn(page, medium[0] as Puzzle);
      await page.keyboard.press("Enter");
      await waitRound(page, (medium[1] as Puzzle).id);
      await done(ctx, problems);
    });

    test("<C-S-L> toggles relative/absolute numbers, which follow the cursor and are never counted", async () => {
      const { ctx, page, problems } = await fresh();
      await openRound(page, "join-lines");
      await page.keyboard.press("Space");
      expect(await gutter(page)).toEqual(["1", "1", "2", "3", "4"]);
      await typeKeys(page, "j");
      expect(await gutter(page)).toEqual(["1", "2", "1", "2", "3"]);
      await page.keyboard.press("Control+Shift+L");
      expect(await gutter(page)).toEqual(["1", "2", "3", "4", "5"]);
      expect(await text(page, ".hud button[aria-pressed]")).toBe("Absolute numbers");
      await page.keyboard.press("Control+Shift+L");
      expect(await gutter(page)).toEqual(["1", "2", "1", "2", "3"]);
      expect((await probe(page)).log).toEqual(["j"]);
      await done(ctx, problems);
    });

    test("mouse click, double-click, drag and right-click in the buffer never move the cursor", async () => {
      const { ctx, page, problems } = await fresh();
      const p = P("indent-body");
      await openRound(page, p.id);
      await page.keyboard.press("Space");
      await typeKeys(page, "jw");
      const before = await probe(page);
      expect(before.cursor).toEqual({ line: 2, col: 5 });
      const lines = page.locator(".pane:first-child .cm-line");
      await lines.nth(3).click({ position: { x: 30, y: 5 } });
      await lines.nth(0).dblclick({ position: { x: 40, y: 5 } });
      const from = await lines.nth(0).boundingBox();
      const to = await lines.nth(4).boundingBox();
      if (from === null || to === null) throw new Error("no line boxes");
      await page.mouse.move(from.x + 5, from.y + 5);
      await page.mouse.down();
      await page.mouse.move(to.x + 60, to.y + 5, { steps: 8 });
      await page.mouse.up();
      await lines.nth(2).click({ button: "right", position: { x: 40, y: 5 } });
      const after = await probe(page);
      expect([after.cursor, after.mode, after.focused, after.log]).toEqual([
        before.cursor,
        "normal",
        true,
        ["j", "w"],
      ]);
      await typeKeys(page, "x");
      expect((await probe(page)).doc.split("\n")[1]).toBe('msg = "hello, " + name');
      await done(ctx, problems);
    });

    test("the target pane cannot be focused, selected or typed into", async () => {
      const { ctx, page, problems } = await fresh();
      const p = P("indent-body");
      await openRound(page, p.id);
      await page.keyboard.press("Space");
      const target = page.locator(".pane:nth-child(2) .cm-content");
      expect(await target.getAttribute("contenteditable")).toBe("false");
      await target.click();
      await target.dblclick();
      const where = () =>
        page.evaluate(() => {
          const a = document.activeElement;
          const pane = a?.closest(".pane");
          return pane === null || pane === undefined
            ? "outside"
            : pane === document.querySelector(".pane:first-child")
              ? "player"
              : "target";
        });
      expect(await where()).toBe("player");
      await target.evaluate((el) => (el as HTMLElement).focus());
      expect(await where()).toBe("player");
      expect(await page.evaluate(() => String(window.getSelection() ?? ""))).toBe("");
      await typeKeys(page, "x");
      // biome-ignore lint/performance/useDomNodeTextContent: CodeMirror's lines are divs; only innerText puts newlines between them
      expect(await target.evaluate((el) => (el as HTMLElement).innerText.replace(/\n$/, ""))).toBe(
        p.target,
      );
      expect((await probe(page)).log).toEqual(["x"]);
      await done(ctx, problems);
    });

    test("paste, drop, cut, the context menu and native text input do nothing", async () => {
      const { ctx, page, problems } = await fresh();
      const p = P("indent-body");
      await openRound(page, p.id);
      await page.keyboard.press("Space");
      await typeKeys(page, "i");
      const prevented = await page.evaluate(() => {
        const el = document.querySelector(".pane:first-child .cm-content") as HTMLElement;
        const data = () => {
          const d = new DataTransfer();
          d.setData("text/plain", "EVIL");
          return d;
        };
        const fire = (e: Event) => {
          el.dispatchEvent(e);
          return e.defaultPrevented;
        };
        const opts = { bubbles: true, cancelable: true };
        return {
          paste: fire(new ClipboardEvent("paste", { ...opts, clipboardData: data() })),
          cut: fire(new ClipboardEvent("cut", { ...opts, clipboardData: data() })),
          copy: fire(new ClipboardEvent("copy", { ...opts, clipboardData: data() })),
          dragstart: fire(new DragEvent("dragstart", { ...opts, dataTransfer: data() })),
          dragover: fire(new DragEvent("dragover", { ...opts, dataTransfer: data() })),
          drop: fire(new DragEvent("drop", { ...opts, dataTransfer: data() })),
          contextmenu: fire(new MouseEvent("contextmenu", opts)),
        };
      });
      expect(prevented).toEqual({
        paste: true,
        cut: true,
        copy: true,
        dragstart: true,
        dragover: true,
        drop: true,
        contextmenu: true,
      });
      await page.keyboard.insertText("ZZ");
      const s = await probe(page);
      expect([s.doc, s.log, s.mode]).toEqual([p.start, ["i"], "insert"]);
      await done(ctx, problems);
    });

    test("losing focus shows the hint and swallows keys; clicking the hint resumes", async () => {
      const { ctx, page, problems } = await fresh();
      await openRound(page, "indent-body");
      await page.keyboard.press("Space");
      await page.locator(".hud h1").click();
      await page.locator(".focus-hint").waitFor({ state: "visible" });
      await typeKeys(page, "x");
      expect((await probe(page)).log).toEqual([]);
      await page.locator(".focus-hint").click();
      await page.locator(".focus-hint").waitFor({ state: "detached" });
      await typeKeys(page, "l");
      const s = await probe(page);
      expect([s.log, s.focused]).toEqual([["l"], true]);
      await done(ctx, problems);
    });

    test("Shift+Space, Shift+Enter and Ctrl+Alt+{ (AltGr) are <Space>, <CR> and {", async () => {
      const { ctx, page, problems } = await fresh();
      const p = P("indent-body");
      await openRound(page, p.id);
      await page.keyboard.press("Space");
      await page.keyboard.press("KeyI");
      await page.keyboard.press("Shift+Space");
      await page.keyboard.press("Shift+Enter");
      await page.keyboard.press("Control+Alt+{");
      await page.keyboard.press("Escape");
      const s = await probe(page);
      expect(s.log).toEqual(["i", "<Space>", "<CR>", "{", "<Esc>"]);
      expect(s.doc).toBe(` \n{${p.start}`);
      expect(await text(page, ".score .keys")).toBe("5");
      await done(ctx, problems);
    });

    test("Meta combos and F-keys are ignored, not counted, and show a hint", async () => {
      const { ctx, page, problems } = await fresh();
      const p = P("indent-body");
      await openRound(page, p.id);
      await page.keyboard.press("Space");
      await page.keyboard.press("KeyI");
      for (const k of ["Meta+a", "Meta+v", "Meta+z", "Meta+Shift+z"]) await page.keyboard.press(k);
      expect(await text(page, ".status .hint")).toBe("Cmd/Win shortcuts are off during a round");
      for (const k of ["F1", "F2", "F5", "F12"]) await page.keyboard.press(k);
      expect(await text(page, ".status .hint")).toBe("Function keys do nothing here");
      const s = await probe(page);
      expect([s.doc, s.log, s.mode, await hash(page)]).toEqual([
        p.start,
        ["i"],
        "insert",
        "#/p/indent-body",
      ]);
      expect(await text(page, ".score .keys")).toBe("1");
      await done(ctx, problems);
    });

    test("a dead key inserts nothing, is not counted, and shows the hint", async () => {
      const { ctx, page, problems } = await fresh();
      const p = P("indent-body");
      await openRound(page, p.id);
      await page.keyboard.press("Space");
      await page.keyboard.press("KeyI");
      if (name === "chromium") {
        const cdp = await ctx.newCDPSession(page);
        const ev = { key: "Dead", code: "Quote", windowsVirtualKeyCode: 222 };
        await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...ev });
        await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...ev });
      } else {
        // Playwright has no Dead key outside Chromium's CDP: an untrusted event takes the same path.
        await page.evaluate(() => {
          const init = { key: "Dead", code: "Quote", bubbles: true, cancelable: true };
          const el = document.querySelector(".pane:first-child .cm-content");
          el?.dispatchEvent(new KeyboardEvent("keydown", init));
          el?.dispatchEvent(new KeyboardEvent("keyup", init));
        });
      }
      expect(await text(page, ".status .hint")).toBe(
        "Dead keys are unsupported: switch to a layout without them",
      );
      expect(await text(page, ".score .keys")).toBe("1");
      await typeKeys(page, "e");
      expect(await text(page, ".status .hint")).toBe(
        process.platform === "darwin" ? "" : "Ctrl+W closes the tab in Chrome",
      );
      const s = await probe(page);
      expect([s.doc, s.log]).toEqual([`e${p.start}`, ["i", "e"]]);
      await done(ctx, problems);
    });

    if (name === "chromium") {
      test("an IME composition (CDP) inserts nothing and shows the hint", async () => {
        const { ctx, page, problems } = await fresh();
        const p = P("indent-body");
        await openRound(page, p.id);
        await page.keyboard.press("Space");
        await page.keyboard.press("KeyI");
        const cdp = await ctx.newCDPSession(page);
        await cdp.send("Input.imeSetComposition", {
          text: "ka",
          selectionStart: 2,
          selectionEnd: 2,
        });
        expect(await text(page, ".status .hint")).toBe("IME input is unsupported");
        await cdp.send("Input.insertText", { text: "か" });
        const s = await probe(page);
        expect([s.doc, s.log, s.mode]).toEqual([p.start, ["i"], "insert"]);
        expect(await text(page, ".score .keys")).toBe("1");
        await done(ctx, problems);
      });
    }

    for (const remount of [false, true]) {
      for (const run of PARITY_RUNS) {
        test(`live round === replay of its log: ${run}${remount ? " after <C-CR>" : ""}`, async () => {
          const { ctx, page, problems } = await fresh();
          const p = P("join-lines");
          await openRound(page, p.id);
          await page.keyboard.press("Space");
          if (remount) await page.keyboard.press("Control+Enter");
          await typeKeys(page, run);
          const s = await probe(page);
          const keys = currentRun(toKeyLog(s.log));
          const live: Observed = { doc: s.doc, cursor: s.cursor, mode: s.mode };
          expect({ keys, live }).toEqual({ keys: parseKeys(run), live: replayObserved(p, keys) });
          await done(ctx, problems);
        });
      }
    }

    test("typing speed does not change the result: <lt> then <C-w>, 250 ms apart", async () => {
      const { ctx, page, problems } = await fresh();
      const p = P("join-lines");
      await openRound(page, p.id);
      await page.keyboard.press("Space");
      // The core buffers a typed < as a possible <C-…> mapping for 200 ms (insertModeEscKeysTimeout).
      for (const k of parseKeys("A x<lt><C-w><Esc>")) {
        await typeKeys(page, [k]);
        await page.waitForTimeout(250);
      }
      const s = await probe(page);
      const keys = currentRun(toKeyLog(s.log));
      const live: Observed = { doc: s.doc, cursor: s.cursor, mode: s.mode };
      expect(live).toEqual(replayObserved(p, keys));
      // vim: <C-w> after "x<" deletes only "<", a run of non-word characters
      expect(keys).toEqual(parseKeys("A x<lt><C-w><Esc>"));
      expect(live).toEqual({
        doc: p.start.replace("vec![", "vec![ x"),
        cursor: { line: 1, col: 15 },
        mode: "normal",
      });
      await done(ctx, problems);
    });

    test("typed insert text with <CR> and <BS>/<Del> repeats like the replay (self-check ok)", async () => {
      const { ctx, page, problems } = await fresh();
      const p = P("css-comment");
      await openRound(page, p.id);
      await page.keyboard.press("Space");
      // O/*<Esc>Go*/ with a typo fixed by <BS> on the way; the self-check replays the same log.
      await typeKeys(page, "O/*x<BS><Esc>Go*/");
      await cardShown(page);
      expect(await selfCheckDone(page)).toBe("DEV self-check: ok");
      await done(ctx, problems);
    });
  });
}
