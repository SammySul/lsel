import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { parseKeys, replay } from "../src/index.ts";
import { loadCorpus, readFixtures, staleness } from "./corpus.ts";
import { type EngineRun, puzzleOf, replayCase } from "./engine.ts";
import { KNOWN } from "./known.ts";
import type { FixtureEntry, Observed, OracleCase } from "./types.ts";
import { vimVersion } from "./vim.ts";

// ORACLE_CATEGORY=seed,motions-counts bun test engine/oracle
const only = process.env.ORACLE_CATEGORY?.split(",").filter(Boolean);
const corpus = await loadCorpus(only);
const fixtures = new Map<string, FixtureEntry | undefined>();
const owner = new Map<string, string>();
for (const cat of corpus) {
  const f = await readFixtures(cat);
  for (const c of cat.cases) {
    fixtures.set(c.id, f?.cases[c.id]);
    owner.set(c.id, cat.name);
  }
}
const allCases: OracleCase[] = corpus.flatMap((c) => [...c.cases]);

function observed(r: Observed): Observed {
  return { doc: r.doc, cursor: r.cursor, mode: r.mode };
}

function vimOf(c: OracleCase): Observed {
  const e = fixtures.get(c.id);
  const why = staleness(c, e);
  if (why !== undefined || e === undefined) {
    throw new Error(`${c.id}: ${why}; run \`nix develop -c bun run oracle ${owner.get(c.id)}\``);
  }
  return observed(e);
}

function same(a: Observed, b: Observed): boolean {
  return JSON.stringify(observed(a)) === JSON.stringify(observed(b));
}

function report(c: OracleCase, vim: Observed, got: EngineRun): string {
  return [
    `engine differs from vim on ${c.id}: ${JSON.stringify(c.start)} + ${c.keys}`,
    `  vim:    ${JSON.stringify(vim)}`,
    `  engine: ${JSON.stringify(observed(got))}`,
    ...(got.errors.length > 0 ? [`  engine errors: ${JSON.stringify(got.errors)}`] : []),
    "Fix the engine, or list the case under its reason in oracle/known.ts.",
  ].join("\n");
}

describe("engine vs vim", () => {
  for (const cat of corpus) {
    describe(cat.name, () => {
      for (const c of cat.cases) {
        test(c.id, () => {
          const vim = vimOf(c);
          const got = replayCase(c);
          const why = KNOWN.get(c.id);
          if (why === undefined) {
            if (!same(got, vim)) throw new Error(report(c, vim, got));
          } else if (same(got, vim)) {
            throw new Error(`${c.id} now matches vim: remove it from oracle/known.ts (${why})`);
          }
        });
      }
    });
  }
});

describe("corpus-wide", () => {
  afterEach(() => setSystemTime());

  // These replay the whole corpus, several seconds in all.
  const LONG = 300_000;

  test(
    "replayCase is replay() with stopAtSolve false",
    () => {
      for (const c of allCases) {
        const r = replay(puzzleOf(c), parseKeys(c.keys), { stopAtSolve: false });
        const mine = replayCase(c);
        expect({ id: c.id, doc: r.doc, errors: r.errors }).toEqual({
          id: c.id,
          doc: mine.doc,
          errors: mine.errors,
        });
      }
    },
    LONG,
  );

  test(
    "a second pass in reverse order gives identical results (no global state leaks)",
    () => {
      const first = new Map(allCases.map((c) => [c.id, replayCase(c)]));
      for (const c of [...allCases].reverse()) {
        expect({ id: c.id, ...replayCase(c) }).toEqual({
          id: c.id,
          ...(first.get(c.id) as EngineRun),
        });
      }
    },
    LONG,
  );

  test(
    "undo grouping ignores wall-clock time",
    () => {
      const base = Date.UTC(2026, 0, 1);
      for (const c of allCases) {
        const still = replayCase(c);
        // Pauses of hours, and the clock running backwards, between keys.
        const jumpy = replayCase(c, {
          beforeKey: (i) =>
            setSystemTime(new Date(base + (i % 2 === 0 ? i * 3_600_000 : -i * 1000))),
        });
        setSystemTime();
        expect({ id: c.id, ...observed(jumpy) }).toEqual({ id: c.id, ...observed(still) });
      }
    },
    LONG,
  );

  // CI never reruns vim (`bun run oracle --check` is manual), so a vim bump must show up here.
  test("every answer file was made with the dev shell's vim", async () => {
    const vim = await vimVersion();
    const made = await Promise.all(
      corpus.map(async (cat) => ({ category: cat.name, vim: (await readFixtures(cat))?.vim })),
    );
    expect(made.filter((m) => m.vim !== vim)).toEqual([]);
  });

  test("every case in known.ts is in the corpus", () => {
    if (only !== undefined) return;
    const ids = new Set(allCases.map((c) => c.id));
    expect([...KNOWN.keys()].filter((id) => !ids.has(id))).toEqual([]);
  });
});
