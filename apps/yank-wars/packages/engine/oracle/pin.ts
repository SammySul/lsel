// Pins every case where the engine differs from vim into deviations.json, under a group of deviations.ts.
// bun packages/engine/oracle/pin.ts [--shrunk fuzz-run.json]   (run from the repo root; needs no vim)
// Run it only after deciding a difference stays; the test suite fails on any pinned case that changes.
import "../../../test/dom.ts";
import { join } from "node:path";
import { loadCorpus, readFixtures } from "./corpus.ts";
import { DEVIATION_GROUPS, DEVIATIONS } from "./deviations.ts";
import { type EngineRun, replayCase } from "./engine.ts";
import { fuzzCases, readFuzzFixture } from "./fuzz/corpus.ts";
import type { FixtureEntry, Observed, OracleCase } from "./types.ts";

// Case ids the corpus authors named after the feature, then key patterns (for shrunk fuzz repros); first match wins.
const ID_RULES: readonly (readonly [RegExp, string])[] = [
  [/win-ctrl|^mc-.*(ctrl-[dfbue]-|-H-|-M-|-L-|zz)|^ci-(page|s)-(up|down)$/, "virtual-window"],
  [/R-BS|R-ctrl-w|replace-bs/, "replace-bs"],
  [/^irv-R-|replace/, "replace-mode"],
  [
    /dot-ctrl-[ur]|dot-insert-ctrl-r|count-override|dot-3o|dec-count-dot|ctrl-x-dot-count/,
    "dot-repeat",
  ],
  [/^irv-.*ctrl-(n|p|k|x)\b|ctrl-(n|p)-/, "insert-keys"],
  [/expression|expr/, "expression"],
  [/ctrl-(a|at|g|r-ctrl-r|d|t)\b|ctrl-d-|curswant/, "insert-ctrl"],
  [/sen|sent|min-(is|as)-/, "sentence"],
  [/dollar-before-ctrl-v/, "curswant"],
  [/-b-|block|blockwise/, "visual-block"],
  [/reg-|register/, "registers"],
  [/percent/, "percent"],
  [/-mark-|jumplist|^ci-(backtick|quote)-/, "marks"],
  [/undo-U/, "line-undo"],
  [/g-minus|g-plus/, "undo-tree"],
  [/-gi|gv/, "gi-gv"],
  [/forced/, "forced-motion"],
  [/q-yank-line|q-delete-line|q-dq|q-append|esc-in-macro/, "macro"],
  [/^irv-(mx-)?[vV]-/, "visual"],
  [
    /-w-count|iw-empty|aw-empty|aw-count|ap-count|para-count|para-ws|pp-ap|ip-blank|ap-end|in-quotes|par-in-quotes/,
    "text-objects",
  ],
];

const KEY_RULES: readonly (readonly [RegExp, string])[] = [
  [/<C-[dufbey]>|(^|[^a-z"'`@q])[HML]/, "virtual-window"],
  [/R[^<]*<(BS|C-w)>/, "replace-bs"],
  [/<C-[npxk]>/, "insert-keys"],
  [/\\=|<C-r>=/, "expression"],
  [/<C-[a@g]>|<C-r><C-r>/, "insert-ctrl"],
  [/[()]|[ia]s/, "sentence"],
  [/%/, "percent"],
  [/<C-v>/, "visual-block"],
  [/"[0-9A-Z.:/-]|@@/, "registers"],
  [/[`'][[\]^.]|<C-o>|<C-i>|m[a-z].*[`']/, "marks"],
  [/U/, "line-undo"],
  [/gi|gv/, "gi-gv"],
  [/[dcy<>]v|[dcy<>]V/, "forced-motion"],
  [/[ia][wWp]/, "text-objects"],
  [/[vV]/, "visual"],
];

function observed(o: Observed): Observed {
  return { doc: o.doc, cursor: o.cursor, mode: o.mode };
}

function same(a: Observed, b: Observed): boolean {
  return JSON.stringify(observed(a)) === JSON.stringify(observed(b));
}

function classify(
  c: OracleCase,
  vim: Observed,
  got: EngineRun,
  shrunkKeys: string | undefined,
): string {
  const fuzz = c.id.startsWith("fuzz-");
  // Corpus cases go by their id (named after the feature); fuzz cases by a shrunk repro when one is given.
  const keys = fuzz ? shrunkKeys : undefined;
  if (!fuzz) for (const [rx, g] of ID_RULES) if (rx.test(c.id)) return g;
  if (keys !== undefined) for (const [rx, g] of KEY_RULES) if (rx.test(keys)) return g;
  if (vim.doc === got.doc && (keys !== undefined || !fuzz)) return "cursor";
  const kept = DEVIATIONS[c.id]?.group;
  if (fuzz && kept !== undefined) return kept;
  return fuzz ? "fuzz-unreduced" : "other";
}

async function main() {
  const argv = process.argv.slice(2);
  const shrunkPath = argv[argv.indexOf("--shrunk") + 1];
  const shrunk = new Map<string, string>();
  if (argv.includes("--shrunk") && shrunkPath) {
    const data = (await Bun.file(shrunkPath).json()) as { id: string; shrunk?: { keys: string } }[];
    for (const d of Array.isArray(data) ? data : []) if (d.shrunk) shrunk.set(d.id, d.shrunk.keys);
  }
  const items: [OracleCase, FixtureEntry | undefined][] = [];
  for (const cat of await loadCorpus()) {
    const f = await readFixtures(cat);
    for (const c of cat.cases) items.push([c, f?.cases[c.id]]);
  }
  const ff = await readFuzzFixture();
  for (const c of fuzzCases()) items.push([c, ff?.cases[c.id]]);

  const out: Record<string, unknown> = {};
  const per: Record<string, number> = {};
  for (const [c, e] of items) {
    if (e === undefined) continue;
    const got = replayCase(c);
    if (same(got, e)) continue;
    const group = classify(c, e, got, shrunk.get(c.id));
    if (DEVIATION_GROUPS[group] === undefined) throw new Error(`no group ${group}`);
    per[group] = (per[group] ?? 0) + 1;
    out[c.id] = { group, engineDoc: got.doc, engineCursor: got.cursor, engineMode: got.mode };
  }
  const path = join(import.meta.dir, "deviations.json");
  await Bun.write(path, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`${Object.keys(out).length} pinned deviations`, per);
}

await main();
