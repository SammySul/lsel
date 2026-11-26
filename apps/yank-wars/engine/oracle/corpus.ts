// Loads the oracle cases by category and finds each category's vim fixture file.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { FixtureEntry, FixtureFile, OracleCase } from "./types.ts";
import { settingsOf } from "./types.ts";

export const CASES_DIR = join(import.meta.dir, "cases");

export interface Category {
  name: string;
  cases: readonly OracleCase[];
  fixturePath: string;
}

export function categoryNames(): string[] {
  return readdirSync(CASES_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => f.slice(0, -3))
    .sort();
}

async function loadCategory(name: string): Promise<Category> {
  const mod = (await import(join(CASES_DIR, `${name}.ts`))) as { default?: readonly OracleCase[] };
  if (!Array.isArray(mod.default)) {
    throw new Error(`cases/${name}.ts must \`export default defineCases([...])\``);
  }
  return { name, cases: mod.default, fixturePath: join(CASES_DIR, `${name}.vim.json`) };
}

/** Every category, checking that ids are unique across the corpus. */
export async function loadCorpus(only?: readonly string[]): Promise<Category[]> {
  const names = categoryNames();
  for (const n of only ?? []) {
    if (!names.includes(n)) throw new Error(`no category ${n}; have ${names.join(", ")}`);
  }
  const all = await Promise.all(names.map(loadCategory));
  const owner = new Map<string, string>();
  for (const cat of all) {
    for (const c of cat.cases) {
      const prev = owner.get(c.id);
      if (prev !== undefined) throw new Error(`case id ${c.id} is in both ${prev} and ${cat.name}`);
      owner.set(c.id, cat.name);
    }
  }
  return only === undefined || only.length === 0 ? all : all.filter((c) => only.includes(c.name));
}

export async function readFixtures(cat: Category): Promise<FixtureFile | undefined> {
  const f = Bun.file(cat.fixturePath);
  return (await f.exists()) ? ((await f.json()) as FixtureFile) : undefined;
}

/** Why a fixture entry no longer describes this case, or undefined if it does. */
export function staleness(c: OracleCase, e: FixtureEntry | undefined): string | undefined {
  if (e === undefined) return "no fixture";
  const s = settingsOf(c);
  if (e.start !== c.start) return "start changed";
  if (e.keys !== c.keys) return "keys changed";
  if (e.settings.tabSize !== s.tabSize || e.settings.indentUnit !== s.indentUnit) {
    return "settings changed";
  }
  return undefined;
}
