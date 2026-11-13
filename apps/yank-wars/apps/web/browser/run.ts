// Types oracle cases into the real player view; env YW_BROWSERS=chromium,firefox,webkit ORACLE_CATEGORY=a,b ORACLE_CASE=id YW_SAMPLE=n YW_SEED=s.
import { join } from "node:path";
import { parseKeys } from "@yank-wars/engine";
import { loadCorpus, readFixtures, staleness } from "@yank-wars/engine/oracle/corpus";
import { DEVIATIONS } from "@yank-wars/engine/oracle/deviations";
import type { FixtureEntry, Observed, OracleCase } from "@yank-wars/engine/oracle/types";
import { type BrowserType, chromium, firefox, type Page, webkit } from "playwright-core";
import type { HarnessState } from "../src/dev/harness.ts";
import { playwrightKey } from "./keys.ts";
import { knownFailure } from "./known.ts";
import { playwrightDrift } from "./version.ts";

const WEB = join(import.meta.dir, "..");
const BROWSERS: Readonly<Record<string, BrowserType>> = { chromium, firefox, webkit };

interface Item {
  c: OracleCase;
  category: string;
  fixture: FixtureEntry | undefined;
}

function list(env: string | undefined): string[] | undefined {
  const v = env?.split(",").filter(Boolean);
  return v === undefined || v.length === 0 ? undefined : v;
}

// mulberry32: a reproducible sample for a given YW_SEED.
function sample<T>(items: T[], n: number, seed: number): T[] {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy.slice(0, n);
}

async function freePort(): Promise<number> {
  const s = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = s.port;
  s.stop(true);
  return port;
}

async function startVite(): Promise<{ url: string; stop(): void }> {
  const port = await freePort();
  const proc = Bun.spawn(
    ["bun", "--bun", "vite", "--port", String(port), "--strictPort", "--host", "127.0.0.1"],
    { cwd: WEB, stdout: "ignore", stderr: "pipe" },
  );
  // Drained so vite never blocks on a full pipe; shown only if it fails to start.
  const stderr = new Response(proc.stderr).text();
  const url = `http://127.0.0.1:${port}/harness.html`;
  const until = Date.now() + 30_000;
  while (Date.now() < until && proc.exitCode === null) {
    try {
      if ((await fetch(url)).ok) return { url, stop: () => proc.kill() };
    } catch {}
    await Bun.sleep(100);
  }
  proc.kill();
  throw new Error(`vite did not serve ${url} within 30 s:\n${await stderr}`);
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

async function runCase(page: Page, item: Item, problems: string[]): Promise<string[]> {
  const { c } = item;
  const keys = parseKeys(c.keys);
  problems.length = 0;
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
  // One more round trip, so console args requested above have arrived.
  await page.evaluate(() => 0);
  for (const p of problems) out.push(`  page: ${p}`);
  return out;
}

async function main() {
  const drift = await playwrightDrift();
  if (drift.length > 0 || process.env.PLAYWRIGHT_BROWSERS_PATH === undefined) {
    for (const d of drift) console.error(d);
    console.error(
      "test:browser needs the dev shell's browsers: nix develop -c bun run test:browser",
    );
    process.exit(2);
  }
  const names = list(process.env.YW_BROWSERS) ?? Object.keys(BROWSERS);
  for (const n of names) if (!(n in BROWSERS)) throw new Error(`unknown browser ${n}`);
  const onlyCase = list(process.env.ORACLE_CASE);
  let items: Item[] = [];
  for (const cat of await loadCorpus(list(process.env.ORACLE_CATEGORY))) {
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

  const vite = await startVite();
  let failed = 0;
  try {
    for (const name of names) {
      const browser = await (BROWSERS[name] as BrowserType).launch({ headless: true });
      try {
        const page = await browser.newPage();
        const problems: string[] = [];
        page.on("console", (m) => {
          if (m.type() !== "warning" && m.type() !== "error") return;
          // Synchronously, so the line lands in this case; the args are spelled out as JSON.
          const at = problems.push(`${m.type()}: ${m.text()}`) - 1;
          void Promise.all(m.args().map((a) => a.jsonValue().catch(() => "?"))).then((v) => {
            problems[at] =
              `${m.type()}: ${v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")}`;
          });
        });
        page.on("pageerror", (e) => problems.push(`uncaught: ${e.message}`));
        // The first load may re-optimize deps and reload the page; the second is the stable one.
        for (let i = 0; i < 2; i++) {
          await page.goto(vite.url, { waitUntil: "networkidle" });
          await page.waitForFunction(() => window.__yw !== undefined);
        }
        // Every case then runs on a remounted player, as after a retry; the first mount on a page can behave differently.
        await page.evaluate(() => window.__yw?.mount({ id: "warm-up", start: "warm up" }));
        await page.keyboard.press("KeyW");
        let ok = 0;
        let known = 0;
        for (const item of items) {
          const out = await runCase(page, item, problems);
          const k = knownFailure(item.c.id, name);
          const what = `${item.category}/${item.c.id}: ${JSON.stringify(item.c.start)} + ${item.c.keys}`;
          if (k !== undefined && out.length > 0) known++;
          else if (k !== undefined) {
            failed++;
            console.log(
              `${name} FAIL ${what}\n  passes now: remove it from apps/web/browser/known.ts`,
            );
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
