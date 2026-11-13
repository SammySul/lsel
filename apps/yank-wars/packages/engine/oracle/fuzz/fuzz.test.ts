import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { staleness } from "../corpus.ts";
import { DEVIATIONS } from "../deviations.ts";
import { type EngineRun, replayCase } from "../engine.ts";
import type { Observed } from "../types.ts";
import { compare } from "./check.ts";
import { fuzzCases, readFuzzFixture } from "./corpus.ts";

// ORACLE_CATEGORY=fuzz picks these alone; any other selection leaves them out
const only = process.env.ORACLE_CATEGORY?.split(",").filter(Boolean);
const selected = only === undefined || only.includes("fuzz");
const cases = selected ? fuzzCases() : [];
const fixture = await readFuzzFixture();
const ANSWER = "nix develop -c bun packages/engine/oracle/fuzz/answer.ts";

function vimOf(id: string): Observed | undefined {
  const e = fixture?.cases[id];
  return e && { doc: e.doc, cursor: e.cursor, mode: e.mode };
}

describe("fuzz: engine vs vim", () => {
  for (const c of cases) {
    test(c.id, () => {
      const e = fixture?.cases[c.id];
      const why = staleness(c, e);
      const vim = vimOf(c.id);
      if (why !== undefined || vim === undefined)
        throw new Error(`${c.id}: ${why}; run \`${ANSWER}\``);
      const got = replayCase(c);
      const d = compare(vim, got);
      const dev = DEVIATIONS[c.id];
      if (dev !== undefined) {
        if (d === undefined)
          throw new Error(`${c.id} now matches vim: remove it from oracle/deviations.json`);
        expect({ doc: got.doc, cursor: got.cursor, mode: got.mode }).toEqual({
          doc: dev.engineDoc,
          cursor: dev.engineCursor,
          mode: dev.engineMode,
        });
        return;
      }
      if (d === undefined) return;
      const o = (x: Observed) =>
        `${JSON.stringify(x.doc)} ${x.cursor.line}:${x.cursor.col} ${x.mode}`;
      throw new Error(
        [
          `engine differs from vim (${d.kind}) on ${JSON.stringify(c.start)} + ${c.keys}`,
          `  vim:    ${o(vim)}`,
          `  engine: ${o(got)}`,
          ...(got.errors.length > 0 ? [`  engine errors: ${JSON.stringify(got.errors)}`] : []),
          `Shrink it: nix develop -c bun packages/engine/oracle/fuzz/run.ts --ids ${c.id}`,
        ].join("\n"),
      );
    });
  }
});

describe.skipIf(!selected)("fuzz corpus", () => {
  afterEach(() => setSystemTime());

  test("vim answered every case and ended each in normal mode", () => {
    const modes = new Map<string, string[]>();
    for (const c of cases) {
      const m = vimOf(c.id)?.mode ?? "unanswered";
      if (m !== "normal") modes.set(m, [...(modes.get(m) ?? []), c.id]);
    }
    expect(Object.fromEntries(modes)).toEqual({});
  });

  test("the fixture holds no case the corpus lacks", () => {
    const ids = new Set(cases.map((c) => c.id));
    expect(Object.keys(fixture?.cases ?? {}).filter((id) => !ids.has(id))).toEqual([]);
  });

  test("every 10th case replays identically in reverse order and with a jumping clock", () => {
    const sample = cases.filter((_, i) => i % 10 === 0);
    const first = new Map(sample.map((c) => [c.id, replayCase(c)]));
    const base = Date.UTC(2026, 0, 1);
    for (const c of [...sample].reverse()) {
      const again = replayCase(c, {
        beforeKey: (i) => setSystemTime(new Date(base + (i % 2 === 0 ? i * 3_600_000 : -i * 1000))),
      });
      setSystemTime();
      expect({ id: c.id, ...again }).toEqual({ id: c.id, ...(first.get(c.id) as EngineRun) });
    }
  }, 30_000);
});
