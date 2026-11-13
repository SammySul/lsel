// Oracle cases typed into the real player view: live editor === headless replay of its log === vim.
// Env: YW_BROWSERS, ORACLE_CATEGORY, ORACLE_CASE, YW_SAMPLE (n or "all", default 40), YW_SEED,
// YW_CLOCK_SAMPLE (undo cases re-run with the page clock jumping between keys, default 12).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { formatKeys, parseKeys, type VimKey } from "@yank-wars/engine";
import { loadCorpus, readFixtures, staleness } from "@yank-wars/engine/oracle/corpus";
import { DEVIATIONS } from "@yank-wars/engine/oracle/deviations";
import { replayCase } from "@yank-wars/engine/oracle/engine";
import type { FixtureEntry, Observed, OracleCase } from "@yank-wars/engine/oracle/types";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { playwrightKey } from "../browser/keys.ts";
import { knownFailure } from "../browser/known.ts";
import type { HarnessState } from "../src/dev/harness.ts";
import {
  browserNames,
  envList,
  launch,
  requireDevShell,
  sample,
  startVite,
  type Vite,
  watchPage,
} from "./lib.ts";

interface Item {
  c: OracleCase;
  category: string;
  fixture: FixtureEntry;
}

const SEED = Number(process.env.YW_SEED ?? 1);
const all: Item[] = [];
const stale = new Map<string, number>();
const onlyCase = envList(process.env.ORACLE_CASE);
for (const cat of await loadCorpus(envList(process.env.ORACLE_CATEGORY))) {
  const f = await readFixtures(cat);
  for (const c of cat.cases) {
    if (onlyCase !== undefined && !onlyCase.includes(c.id)) continue;
    const fixture = f?.cases[c.id];
    const why = staleness(c, fixture);
    if (why !== undefined || fixture === undefined)
      stale.set(cat.name, (stale.get(cat.name) ?? 0) + 1);
    else all.push({ c, category: cat.name, fixture });
  }
}
// Other categories may be mid-edit; `bun run oracle --check` is the gate for stale fixtures.
if (stale.size > 0) {
  const per = [...stale].map(([cat, n]) => `${cat} ${n}`).join(", ");
  console.warn(`skipping cases without an up-to-date vim answer: ${per}`);
}

const want = process.env.YW_SAMPLE ?? "40";
const items = want === "all" ? all : sample(all, Number(want), SEED);
const undoKeys = new Set(["u", "U", "<C-r>"]);
const undoItems = all.filter((i) => parseKeys(i.c.keys).some((k) => undoKeys.has(k)));
const clockItems = sample(undoItems, Number(process.env.YW_CLOCK_SAMPLE ?? 12), SEED);
console.log(
  `parity: ${items.length}/${all.length} cases, ${clockItems.length} with clock jumps (YW_SEED=${SEED})`,
);

function expected(item: Item): { want: Observed; label: string } {
  const dev = DEVIATIONS[item.c.id];
  if (dev !== undefined) {
    return {
      want: { doc: dev.engineDoc, cursor: dev.engineCursor, mode: dev.engineMode },
      label: `pinned engine output (${dev.kind} deviation)`,
    };
  }
  const f = item.fixture;
  return { want: { doc: f.doc, cursor: f.cursor, mode: f.mode }, label: "vim" };
}

const observed = (o: Observed): Observed => ({ doc: o.doc, cursor: o.cursor, mode: o.mode });

async function openHarness(page: Page, vite: Vite): Promise<void> {
  // The first load may re-optimize deps and reload the page; the second is the stable one.
  for (let i = 0; i < 2; i++) {
    await page.goto(`${vite.base}/harness.html`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__yw !== undefined);
  }
  // Cases then run on a remounted player, as after a retry (Firefox differs on a page's first mount).
  await page.evaluate(() => window.__yw?.mount({ id: "warm-up", start: "warm up" }));
  await page.keyboard.press("KeyW");
}

/** Every way the case's run disagrees with itself, the replay or the oracle; [] when it passes. */
async function runCase(
  page: Page,
  item: Item,
  take: () => Promise<string[]>,
  between?: (i: number) => Promise<void>,
): Promise<string[]> {
  const { c } = item;
  const keys = parseKeys(c.keys);
  await take();
  await page.evaluate((m) => window.__yw?.mount(m), {
    id: c.id,
    start: c.start,
    ...(c.settings === undefined ? {} : { settings: c.settings }),
  });
  for (const [i, k] of keys.entries()) {
    await page.keyboard.press(playwrightKey(k));
    await between?.(i);
  }
  const st = (await page.evaluate(() => window.__yw?.state())) as HarnessState;
  const out: string[] = [];
  const live = observed(st);
  if (JSON.stringify(st.log) !== JSON.stringify(keys)) {
    out.push(`log: typed ${JSON.stringify(keys)}, logged ${JSON.stringify(st.log)}`);
  }
  const replayed = observed(
    replayCase({
      id: c.id,
      start: c.start,
      keys: formatKeys(st.log as VimKey[]),
      ...(c.settings === undefined ? {} : { settings: c.settings }),
    }),
  );
  if (JSON.stringify(live) !== JSON.stringify(replayed)) {
    out.push(`live ${JSON.stringify(live)} != replay of its log ${JSON.stringify(replayed)}`);
  }
  const { want, label } = expected(item);
  if (JSON.stringify(live) !== JSON.stringify(want)) {
    out.push(`live ${JSON.stringify(live)} != ${label} ${JSON.stringify(want)}`);
  }
  if (st.blocked.length > 0) out.push(`blocked: ${st.blocked.join(", ")}`);
  if (!st.focused) out.push("the editor lost focus");
  for (const p of await take()) out.push(`page: ${p}`);
  return out;
}

function verdict(browser: string, item: Item, problems: string[]): void {
  const known = knownFailure(item.c.id, browser);
  const what = `${JSON.stringify(item.c.start)} + ${item.c.keys}`;
  if (known !== undefined) {
    // Listed in browser/known.ts: it must still fail, or the entry has to go.
    expect({ what, stillFailing: problems.length > 0 }).toEqual({ what, stillFailing: true });
    return;
  }
  expect({ what, problems }).toEqual({ what, problems: [] });
}

let vite: Vite;
beforeAll(async () => {
  await requireDevShell();
  vite = await startVite();
});
afterAll(() => vite?.stop());

for (const name of browserNames()) {
  describe(name, () => {
    let browser: Browser;
    let page: Page;
    let take: () => Promise<string[]>;
    beforeAll(async () => {
      browser = await launch(name);
      page = await browser.newPage();
      take = watchPage(page).take;
      await openHarness(page, vite);
    }, 60_000);
    afterAll(async () => {
      await browser?.close();
    });

    for (const item of items) {
      test(`${item.category}/${item.c.id}`, async () => {
        verdict(name, item, await runCase(page, item, take));
      });
    }

    describe("page clock jumping between keys", () => {
      let ctx: BrowserContext;
      let clockPage: Page;
      let clockTake: () => Promise<string[]>;
      let wall = Date.UTC(2026, 0, 1);
      beforeAll(async () => {
        ctx = await browser.newContext();
        await ctx.clock.install({ time: wall });
        clockPage = await ctx.newPage();
        clockTake = watchPage(clockPage).take;
        await openHarness(clockPage, vite);
      }, 60_000);
      afterAll(async () => {
        await ctx?.close();
      });

      for (const item of clockItems) {
        test(`${item.category}/${item.c.id}`, async () => {
          // Wall clock leaps an hour forward or a minute back; performance.now and timers advance 10 s.
          const between = async (i: number) => {
            wall += i % 2 === 0 ? 3_600_000 : -60_000;
            await clockPage.clock.setSystemTime(wall);
            await clockPage.clock.fastForward(10_000);
            wall += 10_000;
          };
          verdict(name, item, await runCase(clockPage, item, clockTake, between));
        });
      }
    });
  });
}
