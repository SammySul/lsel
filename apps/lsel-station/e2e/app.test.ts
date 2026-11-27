// The built game in real browsers on the real server: `bun run build` first; BROWSERS=chromium,firefox,webkit picks.

import { expect, test } from "bun:test";
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
import type { Page } from "playwright-core";
import { toDocument } from "../src/save/document.ts";
import { openSaves } from "../src/server/saves.ts";
import { syncRoutes } from "../src/server/sync.ts";
import { newGame } from "../src/sim/state.ts";
import { PALETTE } from "../src/web/scene/palette.ts";

const TIMEOUT = 30_000;
const address = serveBuilt(join(import.meta.dir, "../dist"), syncRoutes(openSaves(":memory:")));

type AudioSpy = { contexts: AudioContext[]; shots: number[]; calls: string[] };

/** Records the game's audio calls: a context with no audio device (the CI runner) stays suspended, so tests assert those. */
function spyOnAudio(): void {
  const spy: AudioSpy = { contexts: [], shots: [], calls: [] };
  Object.assign(window, { audioSpy: spy });
  const Real = window.AudioContext;
  window.AudioContext = class extends Real {
    constructor(options?: AudioContextOptions) {
      super(options);
      spy.contexts.push(this);
    }
  };
  for (const method of ["resume", "suspend"] as const) {
    const real = AudioContext.prototype[method];
    AudioContext.prototype[method] = function () {
      spy.calls.push(method);
      return real.call(this);
    };
  }
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args) {
    if (!this.loop) spy.shots.push(Math.round((this.buffer?.duration ?? 0) * 1000));
    start.apply(this, args);
  };
}

/** What the page has done with audio so far. */
function audio(page: Page) {
  return page.evaluate(() => {
    const { contexts, shots, calls } = (window as unknown as { audioSpy: AudioSpy }).audioSpy;
    return { contexts: contexts.length, shots, calls: [...calls] };
  });
}

/** The page's name, once start() has mounted the game. */
const mounted = (page: Page) => page.getByRole("heading", { level: 1 }).waitFor();

/** Opens the game with its clock stopped, so a test moves time by exact amounts. `query` can fix the seed. */
async function open(page: Page, query = ""): Promise<() => Promise<string[]>> {
  const watch = watchPage(page);
  await page.addInitScript(spyOnAudio);
  await page.clock.install({ time: 0 });
  await page.goto(address() + query);
  await mounted(page);
  await page.evaluate(() => document.fonts.ready);
  await page.clock.pauseAt(60_000);
  return () => watch.take();
}

/** The scene's size and the distinct colors in it, as hex. */
function scene(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) throw new Error("no scene canvas");
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const colors = new Set<string>();
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const rgb = ((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0);
      colors.add(`#${rgb.toString(16).padStart(6, "0")}`);
      sum = (Math.imul(sum, 31) + rgb) | 0;
    }
    return {
      colors: [...colors],
      sum,
      scale: [canvas.clientWidth / canvas.width, canvas.clientHeight / canvas.height],
    };
  });
}

/** The texts of these places on the page, with whitespace collapsed. */
async function texts(page: Page, ...selectors: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const selector of selectors) {
    for (const text of await page.locator(selector).allTextContents()) {
      out.push(text.replace(/\s+/g, " ").trim());
    }
  }
  return out;
}

const seconds = (page: Page, s: number) => page.clock.fastForward(s * 1000);

/** A saved game, at the stopped clock's start, with these credits and what Construction needs to build Hold I. */
function holdReady(credits: number): string {
  const state = newGame(7);
  state.items = { credits, "iron-plate": 15, water: 10 };
  state.xp = { construction: 60 };
  return JSON.stringify(toDocument(state, 0));
}

/** Where each top bar button and count sits. */
const topBar = (page: Page) =>
  page
    .locator("main header button, .stock li")
    .evaluateAll((all) =>
      all.map((e) => [e.getBoundingClientRect().x, e.getBoundingClientRect().y]),
    );

eachBrowser((browser) => {
  test(
    "the page is in lsel's look under the strict CSP, with a quiet console",
    async () => {
      const page = await browser().newPage();
      const problems = await open(page);
      expect(await page.getByRole("heading", { level: 1 }).textContent()).toBe("Lsel");
      expect(await lselLook(page)).toEqual(LSEL_LOOK);
      expect(await lselLayout(page)).toEqual(LSEL_LAYOUT);
      expect(await problems()).toEqual([]);
    },
    TIMEOUT,
  );

  test(
    "Enter puts Ana on the iron asteroid: an ore every 3 s, level 2 after 12, and x stops her",
    async () => {
      const page = await browser().newPage();
      const problems = await open(page);
      const read = () => texts(page, ".stock", "section > header", ".facts span >> nth=0", ".crew");
      const idle = "Ana Petrov everything +3% › idle";
      const mining = "Ana Petrov everything +3% › Mining";
      expect(await texts(page, "nav button")).toEqual([
        "1 Mining 1",
        "5 Refining 1",
        "7 Construction 1",
        "m Map 1",
      ]);
      expect(await read()).toEqual(["", "Mining Lv 1", "xp 0 / 60", idle]);

      await page.keyboard.press("Enter");
      await page.clock.fastForward(2800);
      expect(await read()).toEqual(["", "Mining Lv 1", "xp 0 / 60", mining]);
      await page.clock.fastForward(200);
      expect(await read()).toEqual(["Iron ore 1", "Mining Lv 1", "xp 5 / 60", mining]);
      await page.clock.fastForward(33_000);
      expect(await read()).toEqual(["Iron ore 12", "Mining Lv 2", "xp 60 / 126", mining]);

      await page.keyboard.press("x");
      await page.clock.fastForward(6000);
      expect(await read()).toEqual(["Iron ore 12", "Mining Lv 2", "xp 60 / 126", idle]);
      expect(await problems()).toEqual([]);
    },
    TIMEOUT,
  );

  test(
    "the top bar holds still on a phone while a count grows from 1 to 500 and the Hold fills",
    async () => {
      const page = await browser().newPage({ viewport: { width: 390, height: 844 } });
      const problems = await open(page);
      await page.keyboard.press("Enter");
      await seconds(page, 3);
      expect(await texts(page, ".stock li")).toEqual(["Iron ore 1"]);
      const first = await topBar(page);
      expect(first.length).toBe(5);

      await seconds(page, 33);
      expect(await texts(page, ".stock li")).toEqual(["Iron ore 12"]);
      expect(await topBar(page)).toEqual(first);
      // a gap this long is caught up on behind a progress bar, with no timer to wait on
      await seconds(page, 2 * 60 * 60);
      await page.locator(".stock li", { hasText: "full" }).waitFor();
      expect(await texts(page, ".stock li")).toEqual(["Iron ore 500 full"]);
      expect(await topBar(page)).toEqual(first);
      expect(await problems()).toEqual([]);
    },
    TIMEOUT,
  );

  test(
    "the top bar holds still on a phone as Hold I is built, and sits the same with 999,999 credits",
    async () => {
      const opened = async (credits: number) => {
        const page = await browser().newPage({ viewport: { width: 390, height: 844 } });
        await page.addInitScript(
          (save) => localStorage.setItem("lsel-station.save", save),
          holdReady(credits),
        );
        const problems = await open(page, "#/construction");
        return { page, problems };
      };
      const { page, problems } = await opened(5);
      const hold = page.locator("section li", {
        has: page.locator(".line >> nth=0", { hasText: /^Hold I(?!I)/ }),
      });
      expect(await texts(page, ".stock li")).toEqual(["Credits 5", "Iron plate 15", "Water 10"]);
      const first = await topBar(page);
      expect(first.length).toBe(7);

      await hold.getByRole("button", { name: /Assign/ }).click();
      await seconds(page, 10 * 60);
      await page.getByRole("progressbar").waitFor({ state: "detached" });
      expect([await hold.count(), await texts(page, ".stock li", ".crew")]).toEqual([
        0,
        ["Credits 5", "Iron plate 0", "Water 0", "Ana Petrov everything +3% › idle"],
      ]);
      expect(await topBar(page)).toEqual(first);

      const { page: rich, problems: richProblems } = await opened(999_999);
      expect(await texts(rich, ".stock li")).toEqual([
        "Credits 999,999",
        "Iron plate 15",
        "Water 10",
      ]);
      expect([await topBar(rich), await problems(), await richProblems()]).toEqual([first, [], []]);
    },
    TIMEOUT,
  );

  test(
    "ore is refined until it runs out, a Habitat is built from plate and water, and Ines joins",
    async () => {
      const page = await browser().newPage({ viewport: { width: 1280, height: 800 } });
      const problems = await open(page);
      const key = (k: string) => page.keyboard.press(k);
      const selected = async () => (await texts(page, "li[aria-current=true]"))[0] ?? "";

      // enough ore and ice for 20 plate and 10 water
      await key("Enter");
      await seconds(page, 130);
      await key("x");
      await key("j");
      await key("Enter");
      await seconds(page, 70);
      await key("x");

      // refining stops by itself when the ore is gone, and says what it waits for
      await key("5");
      await key("Enter");
      await seconds(page, 120);
      expect(await selected()).toMatch(
        /^Iron plate 4\.0 s 2 iron ore → 1 iron plate .*Ana Petrov, waiting for [12] iron ore Stop x/,
      );
      await key("x");
      await key("j");
      await key("Enter");
      await seconds(page, 60);
      expect(await selected()).toMatch(/Ana Petrov, waiting for [12] ice Stop x/);
      await key("x");

      // the project is paid for at once and shows in the scene while it is built
      await key("7");
      expect(await selected()).toBe(
        "Habitat I 10:00 20 iron plate, 10 water Built once. One more job at a time, and a new crew member to work it. Stopping keeps the progress. Assign Ana Petrov Enter",
      );
      await key("Enter");
      await seconds(page, 300);
      const scene = page.getByRole("img");
      expect([
        await selected(),
        await page
          .locator("li[aria-current=true] [role=progressbar]")
          .getAttribute("aria-valuenow"),
        await scene.getAttribute("aria-label"),
      ]).toEqual([
        "Habitat I 10:00 20 iron plate, 10 water Built once. One more job at a time, and a new crew member to work it. Stopping keeps the progress. Ana Petrov Stop x",
        "52",
        "The station in orbit above a planet. Habitat I is being built.",
      ]);

      // finished while watching: the module, the recruit and the level are announced and sounded
      await seconds(page, 280);
      await page.clock.runFor(3000);
      expect(await texts(page, ".notices p")).toEqual([
        "Habitat I built",
        "Ines Duarte joined the crew",
        "Construction level 5",
      ]);
      expect((await audio(page)).shots.slice(-3)).toEqual([680, 500, 440]);
      // what is left over after the Habitat depends on the seed's mastery rolls
      const rows = await texts(page, "section li");
      expect(rows[0]).toMatch(
        /^Workshop I 12:00 25 iron plate, 10 water Built once. Opens Fabrication. Stopping keeps the progress. Short of \d+ iron plate, \d+ water Assign Ana Petrov Enter$/,
      );
      expect(rows[1]).toMatch(
        /^Hold I 10:00 15 iron plate, 10 water Short of \d+ iron plate, \d+ water Assign Ana Petrov$/,
      );
      expect(rows.slice(3)).toEqual([
        "Greenhouse I 15:00 10 basic parts, 20 iron plate, 20 water Construction level 6",
        "Scanner I 20:00 20 basic parts, 30 iron plate Construction level 8",
        "Lab I 25:00 30 basic parts, 30 iron plate, 10 water Construction level 10",
        "Skimmer bay I 30:00 40 basic parts, 40 iron plate Construction level 12",
        "Market office I 30:00 30 basic parts, 40 iron plate Construction level 14",
        "Claim beacon 10:00 10 basic parts, 20 iron plate → 1 claim beacon Construction level 8",
        "Depot kit 8:00 15 basic parts, 20 iron plate → 1 depot kit Construction level 10",
        "Relay kit 8:00 20 basic parts, 10 iron plate → 1 relay kit Construction level 12",
        "Core II 2:00:00 60 copper wire, 30 glass Construction level 15",
        "Habitat II 1:00:00 40 copper wire, 20 glass Construction level 15",
      ]);
      expect(await texts(page, ".crew li")).toEqual([
        "Ana Petrov everything +3% › idle",
        "Ines Duarte mining +10% › idle",
      ]);

      // two slots: the faster miner is offered first, then whoever is left
      await key("1");
      await key("Enter");
      await key("j");
      await key("Enter");
      expect(await texts(page, ".crew li")).toEqual([
        "Ana Petrov everything +3% › Mining",
        "Ines Duarte mining +10% › Mining",
      ]);
      expect(await scene.getAttribute("aria-label")).toBe(
        "The station in orbit above a planet. A drone waits to mine the ice asteroid. A drone waits to mine the iron asteroid.",
      );
      expect(await problems()).toEqual([]);
    },
    TIMEOUT,
  );

  test(
    "a Workshop opens Fabrication, its tug opens Salvage, and a Greenhouse bed grows algae by itself",
    async () => {
      const page = await browser().newPage({ viewport: { width: 1280, height: 800 } });
      const problems = await open(page);
      const row = (name: string) =>
        page
          .locator("section li", { has: page.locator(".line >> nth=0", { hasText: name }) })
          .first();
      const rowText = async (name: string) =>
        (await texts(page, "section li")).find((t) => t.startsWith(name));
      /** Puts whoever is free on a row for a while, then takes them off if they are still on it. */
      const work = async (department: string, name: string, s: number) => {
        await page.keyboard.press(department);
        await row(name)
          .getByRole("button", { name: /Assign/ })
          .click();
        await seconds(page, s);
        const stop = row(name).getByRole("button", { name: /Stop/ });
        if ((await stop.count()) > 0) await stop.first().click();
      };

      // 291 and 96 bars of mining, then 144 and 45 of refining: less than was mined, whatever was rolled
      await work("1", "Iron asteroid", 850);
      await work("1", "Ice asteroid", 280);
      await work("5", "Iron plate", 560);
      await work("5", "Water", 175);
      await work("7", "Habitat I", 590);
      expect(await texts(page, "nav button")).toEqual([
        "1 Mining 16",
        "5 Refining 14",
        "7 Construction 5",
        "m Map 1",
      ]);

      await work("7", "Workshop I", 705);
      expect((await texts(page, "nav button")).slice(-3)).toEqual([
        "6 Fabrication 1",
        "7 Construction 8",
        "m Map 1",
      ]);

      // basic parts, then the tug, which is made once and stays
      await work("6", "Basic parts", 130);
      expect(await rowText("Salvage tug")).toMatch(
        /^Salvage tug 8:00 15 basic parts, 10 iron plate → Opens Salvage Assign (Ana Petrov|Ines Duarte)$/,
      );
      await page.keyboard.press("6");
      await row("Salvage tug")
        .getByRole("button", { name: /Assign/ })
        .click();
      // a job takes its inputs on the next tick, and shows from then on
      await seconds(page, 1);
      expect(await page.getByRole("img").getAttribute("aria-label")).toBe(
        "The station in orbit above a planet. The workshop is at work.",
      );
      await seconds(page, 463);
      await page.clock.runFor(3000);
      expect(
        await texts(page, ".notices p >> nth=0", "[aria-label=Done] li", "nav button >> nth=1"),
      ).toEqual(["Salvage tug ready", "Salvage tug Opens Salvage", "2 Salvage 1"]);
      expect((await audio(page)).shots.at(-2)).toBe(500);
      await page.keyboard.press("2");
      expect(await texts(page, "section li")).toEqual([
        "Cargo wreck 5.0 s one of iron plate, water, basic parts, hydrogen mastery 1 Repeats until you stop it. Each haul is one of these, at random, and it waits while the Hold is full of any. Assign Ana Petrov Enter",
      ]);

      // a bed is planted with a key and harvested with nobody on it
      await work("7", "Greenhouse I", 880);
      await page.keyboard.press("4");
      expect(await texts(page, "[aria-label=Beds] li")).toEqual([
        "Bed 1, empty Plant algae for 2 water b",
        "Bed 2, empty Plant algae for 2 water",
      ]);
      await page.keyboard.press("b");
      expect([
        await texts(page, "[aria-label=Beds] li"),
        await page.getByRole("img").getAttribute("aria-label"),
      ]).toEqual([
        ["Bed 1, algae 5:00", "Bed 2, empty Plant algae for 2 water b"],
        "The station in orbit above a planet. 1 bed is growing.",
      ]);
      await seconds(page, 300);
      expect([
        (await texts(page, "[aria-label=Beds] li"))[0],
        (await texts(page, ".stock li")).at(0),
      ]).toEqual(["Bed 1, empty Plant algae for 2 water b", "Algae 4"]);
      expect(await problems()).toEqual([]);
    },
    TIMEOUT,
  );

  test(
    "on seed 7 a lane is charted, Ring 2 is claimed as a Mine, and the Co-op buys iron plate",
    async () => {
      const page = await browser().newPage({ viewport: { width: 1280, height: 800 } });
      const problems = await open(page, "?seed=7");
      const key = (k: string) => page.keyboard.press(k);
      const row = (name: string) =>
        page
          .locator("section li", { has: page.locator(".line >> nth=0", { hasText: name }) })
          .first();
      const work = async (department: string, name: string, s: number) => {
        await key(department);
        await row(name)
          .getByRole("button", { name: /Assign/ })
          .click();
        await seconds(page, s);
        const stop = row(name).getByRole("button", { name: /Stop/ });
        if ((await stop.count()) > 0) await stop.first().click();
      };
      const scene = () => page.getByRole("img").getAttribute("aria-label");

      // the map starts with home alone
      await key("m");
      expect([
        new URL(page.url()).hash,
        await texts(page, "section > header", "section li"),
        await scene(),
      ]).toEqual([
        "#/map",
        ["Map 1 of 36 charted", "Home Home ring, yours Your station."],
        "The sector map: 1 sector charted, 1 yours. Selected: Home, yours.",
      ]);

      await work("1", "Iron asteroid", 700);
      await work("1", "Ice asteroid", 150);
      await work("5", "Iron plate", 420);
      await work("5", "Water", 80);
      await work("7", "Habitat I", 590);
      await key("1");
      await row("Iron asteroid")
        .getByRole("button", { name: /Assign/ })
        .click();
      await work("7", "Workshop I", 705);
      await work("5", "Iron plate", 800);
      await work("6", "Basic parts", 300);
      await work("7", "Scanner I", 1180);
      await work("8", "Home ring scan", 40);
      await work("8", "Chart a lane", 480);
      await key("m");
      expect(await texts(page, "section li > .row > .line:first-child")).toEqual([
        "Home Home ring, yours",
        "Ring 1 Home ring, pirates",
        "Ring 2 Home ring, unclaimed",
        "Ring 3 Home ring, unclaimed",
        "Ring 4 Home ring, unclaimed",
      ]);

      // a beacon claims the selected sector with Enter, and the outpost is set up as a Mine
      await work("7", "Claim beacon", 590);
      await key("m");
      await key("j");
      await key("j");
      expect((await texts(page, "li[aria-current=true]"))[0]).toBe(
        "Ring 2 Home ring, unclaimed Claim with a beacon Enter",
      );
      await key("Enter");
      await page.getByRole("button", { name: "Mine", exact: true }).click();
      await page.clock.runFor(3000);
      expect([
        (await texts(page, "li[aria-current=true]"))[0],
        await texts(page, ".notices p"),
        await scene(),
      ]).toEqual([
        // grouped buttons are laid out by CSS, with no text between them
        "Ring 2 Home ring, yours MineTrade hubFarm A trickle of iron ore and ice. A change costs 200 credits. Install a depot (0)Install a relay (0) Depot: half again its output. Relay: a quarter more output for neighboring outposts. Kits come from Construction. 0 of 3 add-ons",
        ["Ring 2 is yours"],
        "The sector map: 5 sectors charted, 2 yours. Selected: Ring 2, yours.",
      ]);

      // charting from Ring 2 finds the Co-op, whose market buys plate once there is a Market office
      await work("8", "Chart a lane", 360);
      await work("7", "Market office I", 1790);
      await key("0");
      expect((await texts(page, "section li"))[0]).toBe(
        "Sell 10 iron plate 30.0 s 10 iron plate → 40 credits mastery 1 A run to the market and back. Each sale of a good pays 3% less, down to 30% less, and each step comes back in 5 minutes. Assign Ana Petrov Enter",
      );
      await key("Enter");
      await seconds(page, 31);
      expect(await texts(page, ".stock li >> nth=0")).toEqual(["Credits 40"]);
      // credits stay in the top bar on every view
      await key("1");
      expect([await texts(page, ".stock li >> nth=0"), await problems()]).toEqual([
        ["Credits 40"],
        [],
      ]);
    },
    TIMEOUT,
  );

  test(
    "a department's address survives a reload",
    async () => {
      const page = await browser().newPage();
      await open(page);
      await page.keyboard.press("5");
      expect([new URL(page.url()).hash, await texts(page, "section > header")]).toEqual([
        "#/refining",
        ["Refining Lv 1"],
      ]);
      await page.reload();
      await mounted(page);
      expect(await texts(page, "section > header")).toEqual(["Refining Lv 1"]);
    },
    TIMEOUT,
  );

  test(
    "the scene uses only its palette, at a whole-number scale, and shows the job",
    async () => {
      const page = await browser().newPage({ viewport: { width: 1280, height: 800 } });
      await open(page);
      const label = () => page.getByRole("img").getAttribute("aria-label");
      expect(await label()).toBe("The station in orbit above a planet.");

      const palette: string[] = Object.values(PALETTE);
      const idle = await scene(page);
      expect(idle.colors.filter((c) => !palette.includes(c))).toEqual([]);
      expect(idle.scale).toEqual([3, 3]);
      const shown = (colors: string[]) =>
        [PALETTE.hull, PALETTE.solar, PALETTE.planet2, PALETTE.rock, PALETTE.beam].filter((c) =>
          colors.includes(c),
        );
      expect(shown(idle.colors)).toEqual([
        PALETTE.hull,
        PALETTE.solar,
        PALETTE.planet2,
        PALETTE.rock,
      ]);

      await page.keyboard.press("Enter");
      await page.clock.fastForward(1500);
      const mining = await scene(page);
      expect(await label()).toBe(
        "The station in orbit above a planet. A drone is mining the iron asteroid.",
      );
      expect(shown(mining.colors)).toEqual([
        PALETTE.hull,
        PALETTE.solar,
        PALETTE.planet2,
        PALETTE.rock,
        PALETTE.beam,
      ]);
      expect(mining.colors.filter((c) => !palette.includes(c))).toEqual([]);
    },
    TIMEOUT,
  );

  test(
    "with reduced motion the scene holds still while the game runs",
    async () => {
      const page = await browser().newPage({ reducedMotion: "reduce" });
      await open(page);
      await page.keyboard.press("Enter");
      await page.clock.fastForward(1000);
      const before = await scene(page);
      await page.clock.fastForward(4000);
      const after = await scene(page);
      expect(await texts(page, ".stock")).toEqual(["Iron ore 1"]);
      expect([before.colors.includes(PALETTE.beam), after.sum]).toEqual([true, before.sum]);
    },
    TIMEOUT,
  );

  test(
    "sound starts with the first key press, plays what happens live, and stays off once muted",
    async () => {
      const page = await browser().newPage();
      const problems = await open(page);
      const soundOn = () =>
        page.getByRole("button", { name: "Sound" }).getAttribute("aria-pressed");
      expect([await audio(page), await soundOn()]).toEqual([
        { contexts: 0, shots: [], calls: [] },
        "true",
      ]);

      // the key press makes and starts the one context; the assign blip, then the bar finishing 3 s later
      await page.keyboard.press("Enter");
      await page.clock.runFor(3000);
      expect(await audio(page)).toEqual({ contexts: 1, shots: [106, 114], calls: ["resume"] });

      // ten more bars and a level-up, caught up in one jump: silence
      await page.clock.fastForward(33_000);
      expect(await texts(page, ".stock")).toEqual(["Iron ore 12"]);
      expect((await audio(page)).shots).toEqual([106, 114]);

      await page.keyboard.press("s");
      await page.clock.runFor(3000);
      // a context the browser could not start is asked again on every key press, so count only the end
      const muted = await audio(page);
      expect([muted.contexts, muted.shots, muted.calls.at(-1), await soundOn()]).toEqual([
        1,
        [106, 114],
        "suspend",
        "false",
      ]);

      // the setting is kept on this device, and a muted game never opens audio
      await page.reload();
      await mounted(page);
      await page.keyboard.press("Enter");
      expect([await audio(page), await soundOn()]).toEqual([
        { contexts: 0, shots: [], calls: [] },
        "false",
      ]);
      await page.keyboard.press("s");
      expect([await audio(page), await soundOn()]).toEqual([
        { contexts: 1, shots: [], calls: ["resume"] },
        "true",
      ]);
      expect(await problems()).toEqual([]);
    },
    TIMEOUT,
  );
});
