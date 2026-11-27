import { rmSync } from "node:fs";
import { join } from "node:path";
import { parseKeys, type VimKey } from "@yank-wars/engine";
import type { Page } from "playwright-core";
import { playwrightKey } from "./keys.ts";

const WEB = join(import.meta.dir, "..");

export function envList(v: string | undefined): string[] | undefined {
  const out = v?.split(",").filter(Boolean);
  return out === undefined || out.length === 0 ? undefined : out;
}

// mulberry32: a reproducible shuffle for a given seed.
export function sample<T>(items: readonly T[], n: number, seed: number): T[] {
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

export interface Vite {
  base: string;
  stop(): void;
}

/** The DEV server (so the self-check badge and the probes exist); serves index.html and harness.html. */
export async function startVite(
  config = "e2e/vite.config.ts",
  env: Record<string, string> = {},
): Promise<Vite> {
  const port = await freePort();
  // a cache of its own: suites run side by side (`--parallel`), and two vites optimizing into one cache race
  const cacheDir = join(WEB, "node_modules/.vite-e2e", String(port));
  const proc = Bun.spawn(
    [
      "bun",
      "--bun",
      "vite",
      "--config",
      config,
      "--port",
      String(port),
      "--strictPort",
      "--host",
      "127.0.0.1",
    ],
    {
      cwd: WEB,
      stdout: "ignore",
      stderr: "pipe",
      env: { ...process.env, ...env, YW_VITE_CACHE: cacheDir },
    },
  );
  const stop = () => {
    proc.kill();
    rmSync(cacheDir, { recursive: true, force: true });
  };
  // Drained so vite never blocks on a full pipe; shown only if it fails to start.
  const stderr = new Response(proc.stderr).text();
  const base = `http://127.0.0.1:${port}`;
  const until = Date.now() + 30_000;
  while (Date.now() < until && proc.exitCode === null) {
    try {
      if ((await fetch(`${base}/harness.html`)).ok) return { base, stop };
    } catch {}
    await Bun.sleep(100);
  }
  stop();
  throw new Error(`vite did not serve ${base} within 30 s:\n${await stderr}`);
}

/** For watchPage's `ignore`: Vite's own chatter is not the app's. */
export const VITE = /\[vite\]/;

/** Types vim notation as US-layout key presses, one press per key. */
export async function typeKeys(page: Page, notation: string | readonly VimKey[]): Promise<void> {
  const keys = typeof notation === "string" ? parseKeys(notation) : notation;
  for (const k of keys) await page.keyboard.press(playwrightKey(k));
}

/** The result card's buttons, each `shown` when all of it is inside both the card and the window. */
export async function cardButtons(page: Page): Promise<string[]> {
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
  return page.evaluate(() => {
    const card = document.querySelector(".card")?.getBoundingClientRect();
    if (card === undefined) return ["no card"];
    return [...document.querySelectorAll(".card .actions button")].map((b) => {
      const r = b.getBoundingClientRect();
      const shown =
        r.top >= Math.max(0, card.top) &&
        r.left >= Math.max(0, card.left) &&
        r.bottom <= Math.min(innerHeight, card.bottom) &&
        r.right <= Math.min(innerWidth, card.right);
      return `${(b.textContent ?? "").replace(/\s+/g, " ").trim()}: ${shown ? "shown" : "cut off"}`;
    });
  });
}
