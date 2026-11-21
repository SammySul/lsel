// bun run oracle [--check] [category...]: answers every case with the pinned vim and writes cases/<category>.vim.json.
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { CASES_DIR, type Category, categoryNames, loadCorpus, readFixtures } from "./corpus.ts";
import type { FixtureEntry, FixtureFile } from "./types.ts";
import { settingsOf } from "./types.ts";
import { OracleError, runVim, vimVersion } from "./vim.ts";

const CONCURRENCY = 8;

async function mapLimit<T, R>(items: readonly T[], f: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await f(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return out;
}

function serialize(f: FixtureFile): string {
  return `${JSON.stringify(f, null, 2)}\n`;
}

async function answer(cat: Category, vim: string, version: string) {
  const errors: string[] = [];
  const entries = await mapLimit(cat.cases, async (c) => {
    try {
      const a = await runVim(c, vim);
      if (a.version !== version)
        throw new OracleError(`${c.id}: v:versionlong says ${a.version}, --version ${version}`);
      const e: FixtureEntry = {
        start: c.start,
        keys: c.keys,
        settings: settingsOf(c),
        doc: a.doc,
        cursor: a.cursor,
        mode: a.mode,
      };
      return [c.id, e] as const;
    } catch (e) {
      if (!(e instanceof OracleError)) throw e;
      errors.push(e.message);
      return undefined;
    }
  });
  const cases: Record<string, FixtureEntry> = {};
  for (const kv of entries) if (kv !== undefined) cases[kv[0]] = kv[1];
  return { file: { vim: version, cases } satisfies FixtureFile, errors };
}

function diffEntries(old: FixtureFile | undefined, now: FixtureFile): string[] {
  if (old === undefined) return ["fixture file missing"];
  const out: string[] = [];
  if (old.vim !== now.vim) out.push(`made with vim ${old.vim}, PATH has vim ${now.vim}`);
  for (const [id, e] of Object.entries(now.cases)) {
    const o = old.cases[id];
    if (o === undefined) out.push(`${id}: no fixture`);
    else if (JSON.stringify(o) !== JSON.stringify(e))
      out.push(`${id}: stale (case or vim answer changed)`);
  }
  for (const id of Object.keys(old.cases)) {
    if (!(id in now.cases)) out.push(`${id}: fixture for a case that no longer exists`);
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const only = args.filter((a) => a !== "--check");
  const vim = Bun.which("vim");
  if (vim === null || !vim.startsWith("/nix/store/")) {
    console.error(
      `oracle: vim is ${vim ?? "missing"}; run inside the dev shell (nix develop -c bun run oracle)`,
    );
    process.exit(2);
  }
  const version = await vimVersion(vim);
  const corpus = await loadCorpus(only);
  let failed = false;
  for (const cat of corpus) {
    const { file, errors } = await answer(cat, vim, version);
    const old = await readFixtures(cat);
    for (const e of errors) console.error(`  error ${e}`);
    if (errors.length > 0) failed = true;
    const diff = diffEntries(old, file);
    const n = Object.keys(file.cases).length;
    if (check) {
      if (diff.length > 0) {
        failed = true;
        console.error(`${cat.name}: ${diff.length} problem(s); run \`bun run oracle ${cat.name}\``);
        for (const d of diff) console.error(`  ${d}`);
      } else console.log(`${cat.name}: ${n} case(s) up to date (vim ${file.vim})`);
      continue;
    }
    if (diff.length > 0 || old === undefined) await Bun.write(cat.fixturePath, serialize(file));
    console.log(`${cat.name}: ${n} case(s), ${diff.length} change(s) (vim ${file.vim})`);
    for (const d of diff) console.log(`  ${d}`);
  }
  if (only.length === 0) {
    const names = new Set(categoryNames());
    for (const f of readdirSync(CASES_DIR).filter((f) => f.endsWith(".vim.json"))) {
      if (names.has(f.slice(0, -".vim.json".length))) continue;
      if (check) {
        failed = true;
        console.error(`${f}: fixture without a case file`);
      } else {
        rmSync(join(CASES_DIR, f));
        console.log(`${f}: removed (no case file)`);
      }
    }
  }
  if (failed) process.exit(1);
}

await main();
