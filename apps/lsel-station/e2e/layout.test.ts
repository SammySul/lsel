// The game screen holds still and fits, from the first ore to a late game with every department open: `bun run build` first.

import { expect, test } from "bun:test";
import { join } from "node:path";
import {
  eachBrowser,
  LSEL_LAYOUT,
  lselLayout,
  serveBuilt,
  watchPage,
} from "@sammysul/lsel/testing";
import type { Page } from "playwright-core";
import { ITEM_IDS } from "../src/content/items.ts";
import { toDocument } from "../src/save/document.ts";
import { openSaves } from "../src/server/saves.ts";
import { syncRoutes } from "../src/server/sync.ts";
import { newGame } from "../src/sim/state.ts";

const TIMEOUT = 30_000;
const address = serveBuilt(join(import.meta.dir, "../dist"), syncRoutes(openSaves(":memory:")));
const PHONE = { width: 390, height: 844 };
const LAPTOP = { width: 1280, height: 800 };

/** A saved late game on seed 7: every department open at level 99, four crew, and 24,000 of everything. */
function lateGame(): string {
  const state = newGame(7);
  state.modules = {
    core: 5,
    "drone-bay": 1,
    refinery: 1,
    habitat: 3,
    workshop: 1,
    greenhouse: 1,
    scanner: 1,
    lab: 1,
    "skimmer-bay": 1,
    "market-office": 1,
    hold: 5,
  };
  state.unlocks = ["salvage-tug"];
  state.crew = ["ana-petrov", "ines-duarte", "tomas-greer", "carla-voss"];
  state.items = Object.fromEntries(ITEM_IDS.map((id) => [id, id === "credits" ? 999_999 : 24_000]));
  state.xp = {
    mining: 9_000_000,
    salvage: 9_000_000,
    skimming: 9_000_000,
    hydroponics: 9_000_000,
    refining: 9_000_000,
    fabrication: 9_000_000,
    construction: 9_000_000,
    survey: 9_000_000,
    research: 9_000_000,
    trade: 9_000_000,
  };
  return JSON.stringify(toDocument(state, 0));
}

/** Opens the game with its clock stopped, from `save` if given; returns what the console said. */
async function open(page: Page, save?: string): Promise<() => Promise<string[]>> {
  const watch = watchPage(page);
  if (save !== undefined) {
    await page.addInitScript((s) => localStorage.setItem("lsel-station.save", s), save);
  }
  await page.clock.install({ time: 0 });
  await page.goto(address());
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.clock.pauseAt(60_000);
  return () => watch.take();
}

async function texts(page: Page, selector: string): Promise<string[]> {
  return (await page.locator(selector).allTextContents()).map((t) => t.replace(/\s+/g, " ").trim());
}

/** Where the top bar's buttons and counts and the game's frame sit, in whole pixels. */
const placed = (page: Page) =>
  page.locator("main header button, .stock li, .game").evaluateAll((all) =>
    all.map((e) => {
      const r = e.getBoundingClientRect();
      return [r.x, r.y, r.width, r.height].map(Math.round);
    }),
  );

/** The game's frame and the department panel: top and height. */
const frames = (page: Page) =>
  page
    .locator(".game, .middle")
    .evaluateAll((all) =>
      all.map((e) =>
        [e.getBoundingClientRect().y, e.getBoundingClientRect().height].map(Math.round),
      ),
    );

const MINING_STOCK = ["Credits 0", "Iron ore 0", "Ice 0", "Rations 0"];

eachBrowser((browser) => {
  test(
    "the top bar shows the view's counts at 0 from the start, so the first ore moves nothing",
    async () => {
      const page = await browser().newPage({ viewport: LAPTOP });
      const problems = await open(page);
      expect(await texts(page, ".stock li")).toEqual(MINING_STOCK);
      const before = await placed(page);
      expect(before.length).toBe(9);

      await page.keyboard.press("Enter");
      await page.clock.fastForward(3000);
      expect(await texts(page, ".stock li")).toEqual([
        "Credits 0",
        "Iron ore 1",
        "Ice 0",
        "Rations 0",
      ]);
      expect(await placed(page)).toEqual(before);
      expect([await lselLayout(page), await problems()]).toEqual([LSEL_LAYOUT, []]);
    },
    TIMEOUT,
  );

  test(
    "on a phone one select picks the department, and the panel keeps its height however many are open",
    async () => {
      const early = await browser().newPage({ viewport: PHONE });
      const earlyProblems = await open(early);
      const pick = (page: Page) => page.getByRole("combobox", { name: "Department" });
      expect([
        await texts(early, "nav option"),
        await early.locator("nav button").first().isVisible(),
      ]).toEqual([
        ["Mining · Lv 1", "Refining · Lv 1", "Construction · Lv 1", "Map · 1 yours"],
        false,
      ]);
      const panel = await frames(early);

      await pick(early).selectOption("refining");
      expect([new URL(early.url()).hash, await texts(early, "section > header")]).toEqual([
        "#/refining",
        ["Refining Lv 1"],
      ]);

      const late = await browser().newPage({ viewport: PHONE });
      const lateProblems = await open(late, lateGame());
      expect(await texts(late, "nav option")).toEqual([
        "Mining · Lv 99",
        "Salvage · Lv 99",
        "Skimming · Lv 99",
        "Hydroponics · Lv 99",
        "Refining · Lv 99",
        "Fabrication · Lv 99",
        "Construction · Lv 99",
        "Survey · Lv 99",
        "Research · Lv 99",
        "Trade · Lv 99",
        "Map · 1 yours",
      ]);
      expect(await frames(late)).toEqual(panel);
      await pick(late).selectOption("map");
      expect([
        new URL(late.url()).hash,
        await texts(late, "section > header"),
        await frames(late),
        await lselLayout(late),
      ]).toEqual(["#/map", ["Map 1 of 36 charted"], panel, LSEL_LAYOUT]);
      expect([await earlyProblems(), await lateProblems()]).toEqual([[], []]);
    },
    TIMEOUT,
  );

  test(
    "late in the game every view fits at 1280×800 and the game keeps its place between them",
    async () => {
      const page = await browser().newPage({ viewport: LAPTOP });
      const problems = await open(page, lateGame());
      const game = await frames(page);
      const mapButton = page.locator("nav button", { hasText: "Map" });
      const inside = () =>
        mapButton.evaluate((b) => {
          const nav = b.closest("nav")?.getBoundingClientRect();
          return nav !== undefined && b.getBoundingClientRect().bottom <= nav.bottom;
        });
      expect([await texts(page, ".stock li"), await inside(), await lselLayout(page)]).toEqual([
        ["Credits 999,999", "Iron ore 24,000", "Ice 24,000", "Rations 24,000"],
        true,
        LSEL_LAYOUT,
      ]);
      for (const key of ["2", "3", "4", "5", "6", "7", "8", "9", "0"]) {
        await page.keyboard.press(key);
        expect([key, await frames(page)]).toEqual([key, game]);
      }

      await page.keyboard.press("m");
      expect([await texts(page, ".stock li"), await frames(page), await lselLayout(page)]).toEqual([
        ["Credits 999,999", "Claim beacons 24,000", "Depot kits 24,000", "Relay kits 24,000"],
        game,
        LSEL_LAYOUT,
      ]);
      await page.keyboard.press("o");
      expect([await frames(page), await lselLayout(page)]).toEqual([game, LSEL_LAYOUT]);
      await page.keyboard.press("o");
      await page.keyboard.press("h");
      expect([await frames(page), await lselLayout(page)]).toEqual([game, LSEL_LAYOUT]);
      await page.keyboard.press("1");
      expect([await frames(page), await inside(), await problems()]).toEqual([game, true, []]);
    },
    TIMEOUT,
  );
});
