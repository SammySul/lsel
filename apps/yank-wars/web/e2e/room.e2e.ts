// Two players in a room, the daily board and accounts, each player in their own browser context, against an in-process server. Env: BROWSERS.
import { Database } from "bun:sqlite";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { type Routes, upgrade } from "@sammysul/lsel/server";
import { eachBrowser, launch, watchPage } from "@sammysul/lsel/testing";
import { dailyPuzzle, dayOf, type Puzzle } from "@yank-wars/engine";
import type { Page } from "playwright-core";
import { api } from "../../server/src/api.ts";
import { Board } from "../../server/src/daily.ts";
import { fakeGitHub } from "../../server/src/fakeGitHub.ts";
import { PUZZLES, picker } from "../../server/src/puzzles.ts";
import { Replayer } from "../../server/src/replay.ts";
import { type Conn, type Mismatch, Rooms } from "../../server/src/rooms.ts";
import type { RoundProbeState } from "../src/dev/roundProbe.ts";
import { startVite, typeKeys, VITE, type Vite } from "./lib.ts";

const replayer = new Replayer();
const mismatches: Mismatch[] = [];
const rooms = new Rooms({
  puzzles: PUZZLES,
  // easy only, so the reload halfway through a solution stays quick
  pick: picker(new Map([...PUZZLES].filter(([, p]) => p.difficulty === "easy"))),
  verify: (p, log) => replayer.verify(p, log),
  mismatch: (m) => mismatches.push(m),
});
const socket = rooms.socket();
const board = new Board(":memory:");
const github = fakeGitHub();
// /api needs Vite's address, which players use and GitHub sends them back to: made once Vite is up
let apiRoutes: Routes | undefined;
const server = Bun.serve<Conn>({
  hostname: "127.0.0.1",
  port: 0,
  fetch: async (req, srv) =>
    (await apiRoutes?.(req, new URL(req.url))) ?? upgrade(socket, req, srv),
  websocket: socket.handler,
});

let vite: Vite;
beforeAll(async () => {
  vite = await startVite(undefined, { YW_ROOMS: `http://127.0.0.1:${server.port}` });
  apiRoutes = await api({
    accounts: new Database(":memory:", { create: true, strict: true }),
    board,
    origin: vite.base,
    secret: "an e2e secret, long enough for Better Auth",
    github: { clientId: "id", clientSecret: "secret" },
    puzzles: PUZZLES,
    verify: (p, log) => replayer.verify(p, log),
  });
  const b = await launch("chromium");
  const p = await b.newPage();
  for (let i = 0; i < 2; i++) await p.goto(`${vite.base}/#/`, { waitUntil: "networkidle" });
  await b.close();
}, 60_000);
afterAll(() => {
  vite?.stop();
  rooms.close();
  board.close();
  replayer.close();
  github.restore();
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

let players = 0;

eachBrowser((browser) => {
  /** A browser of its own; `login` is who GitHub's sign-in page would sign in. */
  async function player(login = "nobody") {
    const ctx = await browser().newContext({
      viewport: { width: 1280, height: 800 },
      // each its own address, as cloudflared reports it: Better Auth limits sign-ins per address
      extraHTTPHeaders: { "cf-connecting-ip": `10.0.0.${++players}` },
    });
    // GitHub's sign-in page: straight back to the site, the code naming `login`
    await ctx.route("https://github.com/login/oauth/authorize**", (route) => {
      const asked = new URL(route.request().url());
      const back = new URL(asked.searchParams.get("redirect_uri") ?? "");
      back.searchParams.set("code", login);
      back.searchParams.set("state", asked.searchParams.get("state") ?? "");
      // a page that sends the browser on: WebKit's Playwright can't answer with a redirect
      return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><meta http-equiv="refresh" content="0;url=${back.href.replaceAll("&", "&amp;")}">`,
      });
    });
    const page = await ctx.newPage();
    // WebKit notes its compatibility quirks for github.com, whose page the test only fakes
    const watch = watchPage(page, {
      ignore: new RegExp(
        `${VITE.source}|^warning: https://github\\.com/\\S+ has active WebKit quirks`,
      ),
    });
    return { ctx, page, problems: watch.take };
  }

  test("the daily: a solved run goes on the board under the name typed there, and the list counts the streak", async () => {
    const a = await player();
    const day = dayOf(Date.now());
    const p = dailyPuzzle(PUZZLES.values(), day);
    if (p === undefined) throw new Error(`no daily on day ${day}`);
    await a.page.goto(`${vite.base}/#/`, { waitUntil: "networkidle" });
    await a.page.locator(".table a.row").first().waitFor();
    await a.page.keyboard.press("d");
    await a.page.locator(".hud h1").waitFor();
    expect(await texts(a.page, ".hud h1")).toEqual([p.title]);
    await a.page.keyboard.press("Space");
    await typeKeys(a.page, p.solution);
    const you = a.page.locator('section[aria-label="Today\'s board"] li.you');
    await you.waitFor();
    expect(await you.locator(".name").textContent()).toBe("anonymous (you)");
    expect(await you.locator(".num").first().textContent()).toBe(`${p.solution.length} keys`);
    const name = a.page.getByRole("textbox", { name: "Name on the board" });
    await name.fill("ada");
    await name.press("Enter");
    await a.page.locator("li.you .name", { hasText: "ada (you)" }).waitFor();
    await a.page.goto(`${vite.base}/#/`, { waitUntil: "networkidle" });
    expect(await texts(a.page, ".start > button, .start > .aside")).toEqual([
      "Quick play p",
      `Daily #${day} ✓ d`,
      "Play a friend f",
      "1-day streak",
      "Sign in with GitHub",
    ]);
    const problems = await a.problems();
    await a.ctx.close();
    expect(problems).toEqual([]);
  }, 60_000);

  test("an account: a guest's daily goes with them to GitHub, and another browser signed in to it has the streak, the best and the name", async () => {
    const login = `octo-${players}`;
    github.user(login, 1_000 + players);
    const day = dayOf(Date.now());
    const p = dailyPuzzle(PUZZLES.values(), day);
    if (p === undefined) throw new Error(`no daily on day ${day}`);
    const start = (page: Page) => texts(page, ".start > button, .start > .aside");

    const a = await player(login);
    await a.page.goto(`${vite.base}/#/daily`, { waitUntil: "networkidle" });
    await a.page.locator(".hud h1").waitFor();
    await a.page.keyboard.press("Space");
    await typeKeys(a.page, p.solution);
    await a.page.locator("li.you .name", { hasText: "anonymous (you)" }).waitFor();
    const name = a.page.getByRole("textbox", { name: "Name on the board" });
    await name.fill("ada");
    await name.press("Enter");
    await a.page.locator("li.you .name", { hasText: "ada (you)" }).waitFor();
    await a.page.goto(`${vite.base}/#/`, { waitUntil: "networkidle" });
    await a.page.getByRole("button", { name: "Sign in with GitHub" }).click();
    await a.page.locator(".start .account", { hasText: "ada on GitHub" }).waitFor();

    const b = await player(login);
    await b.page.goto(`${vite.base}/#/`, { waitUntil: "networkidle" });
    await b.page.getByRole("button", { name: "Sign in with GitHub" }).waitFor();
    expect(await start(b.page)).toEqual([
      "Quick play p",
      `Daily #${day} d`,
      "Play a friend f",
      "Sign in with GitHub",
    ]);
    await b.page.getByRole("button", { name: "Sign in with GitHub" }).click();
    await b.page.locator(".start .account", { hasText: "ada on GitHub" }).waitFor();
    expect(await start(b.page)).toEqual([
      "Quick play p",
      `Daily #${day} ✓ d`,
      "Play a friend f",
      "1-day streak",
      "ada on GitHub · Sign out",
    ]);
    expect(await texts(b.page, ".progress")).toEqual([
      `1 of ${PUZZLES.size} solved · 1 at par or better`,
    ]);
    await b.page.getByRole("button", { name: "Sign out" }).click();
    await b.page.getByRole("button", { name: "Sign in with GitHub" }).waitFor();

    const problems = [...(await a.problems()), ...(await b.problems())];
    await a.ctx.close();
    await b.ctx.close();
    expect(problems).toEqual([]);
  }, 60_000);

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
