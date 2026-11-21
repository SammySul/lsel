// Types oracle cases into the real player view; env BROWSERS=chromium,firefox,webkit ORACLE_CATEGORY=a,b ORACLE_CASE=id YW_SAMPLE=n YW_SEED=s.
import { browsers, launch, watchPage } from "@sammysul/lsel/testing";
import { parseKeys } from "@yank-wars/engine";
import { loadCorpus, readFixtures, staleness } from "@yank-wars/engine/oracle/corpus";
import { DEVIATIONS } from "@yank-wars/engine/oracle/deviations";
import type { FixtureEntry, Observed, OracleCase } from "@yank-wars/engine/oracle/types";
import type { Page } from "playwright-core";
import { envList, sample, startVite, VITE } from "../e2e/lib.ts";
import type { HarnessState } from "../src/dev/harness.ts";
import { playwrightKey } from "./keys.ts";
import { knownFailure } from "./known.ts";

interface Item {
  c: OracleCase;
  category: string;
  fixture: FixtureEntry | undefined;
}

function expected(item: Item): { want: Observed; label: string } {
  const dev = DEVIATIONS[item.c.id];
  if (dev !== undefined) {
    return {
      want: { doc: dev.engineDoc, cursor: dev.engineCursor, mode: dev.engineMode },
      label: `pinned engine output (${dev.kind} deviation)`,
    };
  }
  const f = item.fixture as FixtureEntry;
  return { want: { doc: f.doc, cursor: f.cursor, mode: f.mode }, label: "vim" };
}

async function runCase(page: Page, item: Item, take: () => Promise<string[]>): Promise<string[]> {
  const { c } = item;
  const keys = parseKeys(c.keys);
  await take();
  await page.evaluate((m) => window.__yw?.mount(m), {
    id: c.id,
    start: c.start,
    ...(c.settings === undefined ? {} : { settings: c.settings }),
  });
  for (const k of keys) await page.keyboard.press(playwrightKey(k));
  const st = (await page.evaluate(() => window.__yw?.state())) as HarnessState;
  const out: string[] = [];
  const { want, label } = expected(item);
  const got: Observed = { doc: st.doc, cursor: st.cursor, mode: st.mode };
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    out.push(`  want (${label}): ${JSON.stringify(want)}`, `  got:  ${JSON.stringify(got)}`);
  }
  if (JSON.stringify(st.log) !== JSON.stringify(keys)) {
    out.push(`  log: typed ${JSON.stringify(keys)}`, `       logged ${JSON.stringify(st.log)}`);
  }
  if (st.blocked.length > 0) out.push(`  blocked: ${st.blocked.join(", ")}`);
  if (!st.focused) out.push("  the editor lost focus");
  for (const p of await take()) out.push(`  page: ${p}`);
  return out;
}

async function main() {
  const names = browsers();
  const onlyCase = envList(process.env.ORACLE_CASE);
  let items: Item[] = [];
  for (const cat of await loadCorpus(envList(process.env.ORACLE_CATEGORY))) {
    const f = await readFixtures(cat);
    for (const c of cat.cases) {
      if (onlyCase === undefined || onlyCase.includes(c.id)) {
        items.push({ c, category: cat.name, fixture: f?.cases[c.id] });
      }
    }
  }
  const stale = items.filter((i) => staleness(i.c, i.fixture) !== undefined);
  if (stale.length > 0) {
    for (const i of stale)
      console.error(`${i.c.id}: ${staleness(i.c, i.fixture)}; run bun run oracle ${i.category}`);
    process.exit(1);
  }
  const n = Number(process.env.YW_SAMPLE ?? 0);
  if (n > 0) {
    const seed = Number(process.env.YW_SEED ?? 1);
    items = sample(items, n, seed);
    console.log(
      `sample of ${items.length} (YW_SEED=${seed}): ${items.map((i) => i.c.id).join(" ")}`,
    );
  }

  const vite = await startVite("vite.config.ts");
  let failed = 0;
  try {
    for (const name of names) {
      const browser = await launch(name);
      try {
        const page = await browser.newPage();
        const { take } = watchPage(page, { ignore: VITE });
        // The first load may re-optimize deps and reload the page; the second is the stable one.
        for (let i = 0; i < 2; i++) {
          await page.goto(`${vite.base}/harness.html`, { waitUntil: "networkidle" });
          await page.waitForFunction(() => window.__yw !== undefined);
        }
        // Every case then runs on a remounted player, as after a retry; the first mount on a page can behave differently.
        await page.evaluate(() => window.__yw?.mount({ id: "warm-up", start: "warm up" }));
        await page.keyboard.press("KeyW");
        let ok = 0;
        let known = 0;
        for (const item of items) {
          const out = await runCase(page, item, take);
          const k = knownFailure(item.c.id, name);
          const what = `${item.category}/${item.c.id}: ${JSON.stringify(item.c.start)} + ${item.c.keys}`;
          if (k !== undefined && out.length > 0) known++;
          else if (k !== undefined) {
            failed++;
            console.log(`${name} FAIL ${what}\n  passes now: remove it from web/browser/known.ts`);
          } else if (out.length === 0) ok++;
          else {
            failed++;
            console.log(`${name} FAIL ${what}`);
            for (const line of out) console.log(line);
          }
        }
        const knownNote = known > 0 ? `, ${known} known failure(s) (known.ts)` : "";
        console.log(`${name} ${browser.version()}: ${ok}/${items.length} ok${knownNote}`);
      } finally {
        await browser.close();
      }
    }
  } finally {
    vite.stop();
  }
  if (failed > 0) process.exit(1);
}

await main();
