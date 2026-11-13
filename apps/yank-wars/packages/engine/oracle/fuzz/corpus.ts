import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FixtureFile, OracleCase } from "../types.ts";
import { defineCases } from "../types.ts";
import { generateCase } from "./grammar.ts";

// Not under cases/: differential.test.ts loops the whole corpus in single tests, which 3000 more cases push past bun's timeout.
// Deeper local runs need no change here: `fuzz/run.ts --count 20000` (or `--seed 2`) fuzzes live against vim.
export const FUZZ_SEED = 1;
export const FUZZ_COUNT = 3000;
/** generated beyond FUZZ_COUNT so the corpus stays FUZZ_COUNT long after dropping what vim cannot answer */
export const FUZZ_SLACK = 200;
export const FIXTURE_PATH = join(import.meta.dir, "fuzz.vim.json");
export const UNANSWERED_PATH = join(import.meta.dir, "fuzz.unanswered.json");

/** Written by fuzz/answer.ts: candidates vim could not answer or did not end in normal mode, and why. */
export interface Unanswered {
  vim: string;
  cases: Record<string, string>;
}

export function readUnanswered(): Unanswered | undefined {
  return existsSync(UNANSWERED_PATH)
    ? (JSON.parse(readFileSync(UNANSWERED_PATH, "utf8")) as Unanswered)
    : undefined;
}

function toCase(seed: number, index: number): OracleCase {
  const { id, start, keys, settings } = generateCase(seed, index);
  return { id, start, keys, settings };
}

/** Every candidate answer.ts asks vim about. */
export function candidateCases(): OracleCase[] {
  return Array.from({ length: FUZZ_COUNT + FUZZ_SLACK }, (_, i) => toCase(FUZZ_SEED, i));
}

/** The committed fuzz corpus: the first FUZZ_COUNT usable candidates. */
export function fuzzCases(skip = readUnanswered()): readonly OracleCase[] {
  const out: OracleCase[] = [];
  for (const c of candidateCases()) {
    if (out.length === FUZZ_COUNT) break;
    if (skip?.cases[c.id] === undefined) out.push(c);
  }
  return defineCases(out);
}

export async function readFuzzFixture(): Promise<FixtureFile | undefined> {
  const f = Bun.file(FIXTURE_PATH);
  return (await f.exists()) ? ((await f.json()) as FixtureFile) : undefined;
}
