// Two players in a room, each in their own browser context, against an in-process room server. Env: BROWSERS.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { upgrade } from "@sammysul/lsel/server";
import { browsers, launch, watchPage } from "@sammysul/lsel/testing";
import type { Puzzle } from "@yank-wars/engine";
import type { Browser, Page } from "playwright-core";
import { PUZZLES, picker } from "../../server/src/puzzles.ts";
import { Replayer } from "../../server/src/replay.ts";
import { type Conn, type Mismatch, Rooms } from "../../server/src/rooms.ts";
import type { RoundProbeState } from "../src/dev/roundProbe.ts";
import { startVite, typeKeys, VITE, type Vite } from "./lib.ts";

const replayer = new Replayer();
const mismatches: Mismatch[] = [];
const rooms = new Rooms({
  puzzles: PUZZLES,
  pick: picker(PUZZLES),
  verify: (p, log) => replayer.verify(p, log),
  mismatch: (m) => mismatches.push(m),
});
const socket = rooms.socket();
const server = Bun.serve<Conn>({
  hostname: "127.0.0.1",
  port: 0,
  fetch: (req, srv) => upgrade(socket, req, srv),
  websocket: socket.handler,
});

let vite: Vite;
beforeAll(async () => {
  vite = await startVite(undefined, { YW_ROOMS: `http://127.0.0.1:${server.port}` });
  const b = await launch("chromium");
  const p = await b.newPage();
  for (let i = 0; i < 2; i++) await p.goto(`${vite.base}/#/`, { waitUntil: "networkidle" });
  await b.close();
}, 60_000);
afterAll(() => {
  vite?.stop();
  rooms.close();
  replayer.close();
  server.stop(true);
});

async function probe(page: Page): Promise<RoundProbeState> {
  const s = await page.evaluate(() => window.__ywRound?.state() ?? null);
  if (s === null) throw new Error("no round on the page");
  return s;
}

async function phase(page: Page, want: string): Promise<RoundProbeState> {
  await page.waitForFunction((w) => window.__ywRound?.state()?.phase === w, want, {
    timeout: 10_000,
  });
  return probe(page);
}

async function texts(page: Page, selector: string): Promise<string[]> {
  return (await page.locator(selector).allTextContents()).map((t) => t.replace(/\s+/g, " ").trim());
}

async function rename(page: Page, name: string): Promise<void> {
  await page.locator("#room-name").fill(name);
  await page.locator("#room-name").press("Enter");
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

    async function player() {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();
      const watch = watchPage(page, { ignore: VITE });
      return { ctx, page, problems: watch.take };
    }

    test("lobby, a reload mid-round, the lock-ins, the result and a rematch", async () => {
      const a = await player();
      const b = await player();
      await a.page.goto(`${vite.base}/#/`, { waitUntil: "networkidle" });
      await a.page.locator(".table a.row").first().waitFor();
      await a.page.keyboard.press("f");
      await a.page.waitForFunction(() => /^#\/r\/[a-z2-7]{10}$/.test(location.hash));
      const hash = await a.page.evaluate(() => location.hash);
      await rename(a.page, "ada");
      await b.page.goto(`${vite.base}/${hash}`, { waitUntil: "networkidle" });
      await b.page.locator(".players li .who", { hasText: "ada" }).waitFor();
      await rename(b.page, "bob");
      await a.page.locator(".players li .who", { hasText: "bob" }).waitFor();
      expect(await texts(a.page, ".players li .who")).toEqual(["ada (you)", "bob"]);

      await a.page.keyboard.press("Enter");
      await b.page.keyboard.press("Enter");
      const first = await phase(a.page, "study");
      const p = PUZZLES.get(first.puzzle) as Puzzle;
      expect([(await phase(b.page, "study")).puzzle, p.difficulty]).toEqual([p.id, "easy"]);
      await a.page.keyboard.press("Space");
      await b.page.keyboard.press("Space");
      await phase(a.page, "playing");
      await phase(b.page, "playing");

      // bob types all but the last key, reloads, and finds the buffer as he left it
      const head = p.solution.slice(0, -1);
      await typeKeys(b.page, head);
      const before = await probe(b.page);
      await a.page.waitForFunction(
        (n) => document.querySelector(".opponent")?.textContent?.includes(`${n} keys`),
        head.length,
      );
      await b.page.reload({ waitUntil: "networkidle" });
      const after = await phase(b.page, "playing");
      expect([after.log, after.doc, after.cursor]).toEqual([before.log, before.doc, before.cursor]);

      await typeKeys(b.page, p.solution.slice(-1));
      await phase(b.page, "locked");
      await a.page.locator(".opponent .state", { hasText: "locked in" }).waitFor();
      expect(await texts(a.page, ".opponent span")).toEqual([
        "bob",
        `${p.solution.length} keys`,
        "locked in",
      ]);
      expect(await a.page.locator(".hud .grace").isVisible()).toBe(true);
      await typeKeys(a.page, p.solution);
      await phase(a.page, "locked");

      await a.page.locator(".card h2").waitFor();
      await b.page.locator(".card h2").waitFor();
      expect(await texts(a.page, ".card h2, .card .series")).toEqual(["bob wins", "0–1"]);
      expect(await texts(b.page, ".card h2, .card .series")).toEqual(["You win", "1–0"]);
      expect(mismatches).toEqual([]);

      await a.page.keyboard.press("r");
      await a.page.locator(".rematch", { hasText: "Waiting for bob" }).waitFor();
      await b.page.keyboard.press("r");
      await b.page.waitForFunction((id) => {
        const s = window.__ywRound?.state();
        return s?.phase === "study" && s.puzzle !== id;
      }, p.id);
      expect((await probe(a.page)).puzzle).toBe((await probe(b.page)).puzzle);

      const problems = [...(await a.problems()), ...(await b.problems())];
      await a.ctx.close();
      await b.ctx.close();
      expect(problems).toEqual([]);
    }, 60_000);
  });
}
