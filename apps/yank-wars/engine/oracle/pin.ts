// Pins every case where the engine differs from vim into deviations.json, under a group of deviations.ts.
// bun engine/oracle/pin.ts   (run from the repo root; needs no vim)
// Run it only after deciding a difference stays; the test suite fails on any pinned case that changes.
import "../../test/dom.ts";
import { join } from "node:path";
import { loadCorpus, readFixtures } from "./corpus.ts";
import { DEVIATION_GROUPS } from "./deviations.ts";
import { type EngineRun, replayCase } from "./engine.ts";
import type { FixtureEntry, Observed, OracleCase } from "./types.ts";

// Case ids the corpus authors named after the feature; first match wins.
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

function observed(o: Observed): Observed {
  return { doc: o.doc, cursor: o.cursor, mode: o.mode };
}

function same(a: Observed, b: Observed): boolean {
  return JSON.stringify(observed(a)) === JSON.stringify(observed(b));
}

function classify(c: OracleCase, vim: Observed, got: EngineRun): string {
  for (const [rx, g] of ID_RULES) if (rx.test(c.id)) return g;
  return vim.doc === got.doc ? "cursor" : "other";
}

async function main() {
  const items: [OracleCase, FixtureEntry | undefined][] = [];
  for (const cat of await loadCorpus()) {
    const f = await readFixtures(cat);
    for (const c of cat.cases) items.push([c, f?.cases[c.id]]);
  }

  const out: Record<string, unknown> = {};
  const per: Record<string, number> = {};
  for (const [c, e] of items) {
    if (e === undefined) continue;
    const got = replayCase(c);
    if (same(got, e)) continue;
    const group = classify(c, e, got);
    if (DEVIATION_GROUPS[group] === undefined) throw new Error(`no group ${group}`);
    per[group] = (per[group] ?? 0) + 1;
    out[c.id] = { group, engineDoc: got.doc, engineCursor: got.cursor, engineMode: got.mode };
  }
  const path = join(import.meta.dir, "deviations.json");
  await Bun.write(path, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`${Object.keys(out).length} pinned deviations`, per);
}

await main();
