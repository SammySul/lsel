// The built game in real browsers, served by the real server.
// Run `bun run build` first. Env: BROWSERS=chromium,firefox,webkit
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { type Browser, chromium, firefox, type Page, webkit } from "playwright-core";
import { handler } from "../src/server/server.ts";
import { PALETTE } from "../src/web/scene/palette.ts";

const DIST = join(import.meta.dir, "../dist");
const ALL = { chromium, firefox, webkit };
const names = (process.env.BROWSERS?.split(",") ?? Object.keys(ALL)) as (keyof typeof ALL)[];

const TIMEOUT = 30_000;

let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  if (!existsSync(join(DIST, "index.html"))) throw new Error("no dist/: run `bun run build` first");
  server = Bun.serve({ port: 0, fetch: handler(DIST) });
});

afterAll(() => {
  server?.stop(true);
});

type AudioSpy = { contexts: AudioContext[]; shots: number[] };

/** Runs in the page before the game: records each audio context made and each one-shot sound started, in ms. */
function spyOnAudio(): void {
  const spy: AudioSpy = { contexts: [], shots: [] };
  Object.assign(window, { audioSpy: spy });
  const Real = window.AudioContext;
  window.AudioContext = class extends Real {
    constructor(options?: AudioContextOptions) {
      super(options);
      spy.contexts.push(this);
    }
  };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args) {
    if (!this.loop) spy.shots.push(Math.round((this.buffer?.duration ?? 0) * 1000));
    start.apply(this, args);
  };
}

/** What the page has done with audio so far. */
function audio(page: Page) {
  return page.evaluate(() => {
    const { contexts, shots } = (window as unknown as { audioSpy: AudioSpy }).audioSpy;
    return { contexts: contexts.map((c) => c.state), shots };
  });
}

/** The contexts once they all reach a state, waited for in real time: the audio clock ignores the stopped one. */
async function contextState(page: Page, wanted: AudioContextState): Promise<AudioContextState[]> {
  for (let i = 0; i < 60; i++) {
    const { contexts } = await audio(page);
    if (contexts.every((state) => state === wanted)) return contexts;
    await Bun.sleep(50);
  }
  return (await audio(page)).contexts;
}

/** Opens the game with its clock stopped, so a test moves time by exact amounts. */
async function open(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`uncaught: ${e.message}`));
  await page.addInitScript(spyOnAudio);
  await page.clock.install({ time: 0 });
  await page.goto(server.url.href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.clock.pauseAt(60_000);
  return problems;
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

for (const name of names) {
  describe(name, () => {
    let browser: Browser;
    beforeAll(async () => {
      browser = await ALL[name].launch({ headless: true });
    });
    afterAll(async () => {
      await browser?.close();
    });

    test(
      "the page is in lsel's look under the strict CSP, with a quiet console",
      async () => {
        const page = await browser.newPage();
        const problems = await open(page);
        expect(await page.getByRole("heading", { level: 1 }).textContent()).toBe("Lsel");
        const look = await page.evaluate(() => ({
          background: getComputedStyle(document.body).backgroundColor,
          fontLoaded: document.fonts.check('14px "JetBrains Mono"'),
        }));
        expect(look).toEqual({ background: "rgb(18, 18, 18)", fontLoaded: true });
        expect(problems).toEqual([]);
      },
      TIMEOUT,
    );

    test(
      "Enter puts Ana on the iron asteroid: an ore every 3 s, level 2 after 12, and x stops her",
      async () => {
        const page = await browser.newPage();
        const problems = await open(page);
        const read = () =>
          texts(page, ".stock", "section > header", ".facts span >> nth=0", "footer");
        const idle = "Ana Petrov everything +3% › idle";
        const mining = "Ana Petrov everything +3% › Mining";
        expect(await texts(page, "nav button")).toEqual([
          "1 Mining 1",
          "5 Refining 1",
          "7 Construction 1",
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
        expect(problems).toEqual([]);
      },
      TIMEOUT,
    );

    test(
      "ore is refined until it runs out, a Habitat is built from plate and water, and Ines joins",
      async () => {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
          "Habitat I 10:00 20 iron plate, 10 water Assign Ana Petrov Enter",
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
          "Habitat I 10:00 20 iron plate, 10 water Ana Petrov Stop x",
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
        expect((await audio(page)).shots.slice(-3)).toEqual([880, 460, 620]);
        // what is left over after the Habitat depends on the seed's mastery rolls
        expect((await texts(page, "section li >> nth=0"))[0]).toMatch(
          /^Reactor I 15:00 30 iron plate, 15 water Short of \d+ iron plate, \d+ water Assign Ana Petrov Enter$/,
        );
        expect(await texts(page, "section li >> nth=1", "footer .crew")).toEqual([
          "Core II 2:00:00 60 copper wire, 30 glass Construction level 15",
          "Ana Petrov everything +3% › idle",
          "Ines Duarte mining +10% › idle",
        ]);

        // two slots: the faster miner is offered first, then whoever is left
        await key("1");
        await key("Enter");
        await key("j");
        await key("Enter");
        expect(await texts(page, "footer .crew")).toEqual([
          "Ana Petrov everything +3% › Mining",
          "Ines Duarte mining +10% › Mining",
        ]);
        expect(await scene.getAttribute("aria-label")).toBe(
          "The station in orbit above a planet. A drone waits to mine the ice asteroid. A drone waits to mine the iron asteroid.",
        );
        expect(problems).toEqual([]);
      },
      TIMEOUT,
    );

    test(
      "a department's address survives a reload",
      async () => {
        const page = await browser.newPage();
        await open(page);
        await page.keyboard.press("5");
        expect([new URL(page.url()).hash, await texts(page, "section > header")]).toEqual([
          "#/refining",
          ["Refining Lv 1"],
        ]);
        await page.reload({ waitUntil: "networkidle" });
        expect(await texts(page, "section > header")).toEqual(["Refining Lv 1"]);
      },
      TIMEOUT,
    );

    test(
      "the scene uses only its palette, at a whole-number scale, and shows the job",
      async () => {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
        const page = await browser.newPage({ reducedMotion: "reduce" });
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
        const page = await browser.newPage();
        const problems = await open(page);
        const soundOn = () =>
          page.getByRole("button", { name: "Sound" }).getAttribute("aria-pressed");
        expect([await audio(page), await soundOn()]).toEqual([{ contexts: [], shots: [] }, "true"]);

        // the assign blip, then the bar finishing 3 s later
        await page.keyboard.press("Enter");
        await page.clock.runFor(3000);
        expect(await contextState(page, "running")).toEqual(["running"]);
        expect((await audio(page)).shots).toEqual([115, 82]);

        // ten more bars and a level-up, caught up in one jump: silence
        await page.clock.fastForward(33_000);
        expect(await texts(page, ".stock")).toEqual(["Iron ore 12"]);
        expect((await audio(page)).shots).toEqual([115, 82]);

        await page.keyboard.press("s");
        await page.clock.runFor(3000);
        expect(await contextState(page, "suspended")).toEqual(["suspended"]);
        expect([(await audio(page)).shots, await soundOn()]).toEqual([[115, 82], "false"]);

        // the setting is kept on this device, and a muted game never opens audio
        await page.reload({ waitUntil: "networkidle" });
        await page.keyboard.press("Enter");
        expect([await audio(page), await soundOn()]).toEqual([
          { contexts: [], shots: [] },
          "false",
        ]);
        await page.keyboard.press("s");
        expect([await contextState(page, "running"), await soundOn()]).toEqual([
          ["running"],
          "true",
        ]);
        expect(problems).toEqual([]);
      },
      TIMEOUT,
    );
  });
}
