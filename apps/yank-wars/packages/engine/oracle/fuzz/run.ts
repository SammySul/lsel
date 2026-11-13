// nix develop -c bun packages/engine/oracle/fuzz/run.ts [--seed S] [--count N] [--from I] [--ids a,b] [--no-shrink] [--concurrency C] [--json out.json]: fuzz against vim live, shrink every divergence; writes no fixture.
import "../../../../test/dom.ts";
import { type Divergence, divergence, NO_SHELL, type Probe, VimAnswers } from "./check.ts";
import { FUZZ_COUNT, FUZZ_SEED } from "./corpus.ts";
import { type FuzzCase, generateCase } from "./grammar.ts";
import { type Shrunk, shrink } from "./shrink.ts";

interface Args {
  seed: number;
  count: number;
  from: number;
  ids: string[];
  shrink: boolean;
  concurrency: number;
  json: string | undefined;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    seed: FUZZ_SEED,
    count: FUZZ_COUNT,
    from: 0,
    ids: [],
    shrink: true,
    concurrency: 16,
    json: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${flag} needs a value`);
      return v;
    };
    if (flag === "--seed") a.seed = Number(value());
    else if (flag === "--count") a.count = Number(value());
    else if (flag === "--from") a.from = Number(value());
    else if (flag === "--ids") a.ids = value().split(",");
    else if (flag === "--no-shrink") a.shrink = false;
    else if (flag === "--concurrency") a.concurrency = Number(value());
    else if (flag === "--json") a.json = value();
    else throw new Error(`unknown flag ${flag}`);
  }
  return a;
}

async function mapLimit<T, R>(items: readonly T[], n: number, f: (t: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await f(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}

function casesOf(a: Args): FuzzCase[] {
  if (a.ids.length > 0) {
    return a.ids.map((id) => {
      const m = /^fuzz-(\d+)-(\d+)$/.exec(id);
      if (!m) throw new Error(`not a fuzz id: ${id}`);
      return generateCase(Number(m[1]), Number(m[2]));
    });
  }
  return Array.from({ length: a.count }, (_, i) => generateCase(a.seed, a.from + i));
}

/** Counts vary between repros of one bug; this folds them. */
export function signature(p: Probe, d: Divergence): string {
  return `${d.kind}${d.crash ? "+crash" : ""} ${p.keys.replace(/[1-9][0-9]*/g, "N")}`;
}

interface Failure {
  id: string;
  original: Probe;
  divergence: Divergence;
  shrunk: Shrunk | undefined;
}

function show(p: Probe, d: Divergence): string {
  const o = (x: { doc: string; cursor: { line: number; col: number }; mode: string }) =>
    `${JSON.stringify(x.doc)} ${x.cursor.line}:${x.cursor.col} ${x.mode}`;
  const errs = d.engine.errors.map((e) => `#${e.index} ${e.message}`).join("; ");
  return [
    `    start:  ${JSON.stringify(p.start)}${p.settings.indentUnit === "\t" ? " (tabs)" : ""}`,
    `    keys:   ${p.keys}`,
    `    vim:    ${o(d.vim)}`,
    `    engine: ${o(d.engine)}${errs ? `  errors: ${errs}` : ""}`,
  ].join("\n");
}

async function main() {
  if (process.env.SHELL !== NO_SHELL) {
    // vim takes 'shell' from the environment it inherits, which only a fresh process can change
    const p = Bun.spawn([process.execPath, ...process.argv.slice(1)], {
      env: { ...process.env, SHELL: NO_SHELL },
      stdio: ["inherit", "inherit", "inherit"],
    });
    process.exit(await p.exited);
  }
  const a = parseArgs(process.argv.slice(2));
  const vim = Bun.which("vim");
  if (vim === null || !vim.startsWith("/nix/store/")) {
    console.error(
      `fuzz: vim is ${vim ?? "missing"}; run inside the dev shell (nix develop -c ...)`,
    );
    process.exit(2);
  }
  const answers = new VimAnswers(vim);
  const cases = casesOf(a);
  const t0 = performance.now();
  let unanswered = 0;
  let notNormal = 0;
  const scan = async (c: FuzzCase) => {
    const probe: Probe = { start: c.start, keys: c.keys, settings: c.settings };
    const v = await answers.answer(probe);
    const d = await divergence(answers, probe);
    return { c, probe, v, d };
  };
  const scanned = await mapLimit(cases, a.concurrency, scan);
  // a loaded machine makes slow answers look like hangs; ask once more, alone
  for (const [i, s] of scanned.entries()) {
    if (s.v !== undefined) continue;
    answers.forget(s.probe);
    scanned[i] = await scan(s.c);
  }
  for (const s of scanned) {
    if (s.v === undefined) unanswered++;
    else if (s.v.mode !== "normal") notNormal++;
  }
  const found = scanned.map(({ c, probe, d }) => (d === undefined ? undefined : { c, probe, d }));
  const open = found.filter((f) => f !== undefined);
  console.log(
    `${cases.length} case(s): ${open.length} diverge, ` +
      `${unanswered} vim could not answer, ${notNormal} not ending in normal mode ` +
      `(${Math.round(performance.now() - t0)} ms)`,
  );
  const t1 = performance.now();
  let done = 0;
  const results: Failure[] = await mapLimit(open, a.concurrency, async (f) => {
    const shrunk = a.shrink
      ? await shrink(
          (p) => divergence(answers, p, { engineNormal: f.d.kind !== "mode" }),
          f.c.start,
          f.c.chunks,
          f.c.settings,
          f.d,
        )
      : undefined;
    if (a.shrink && ++done % 25 === 0) console.error(`  shrunk ${done}/${open.length}`);
    return { id: f.c.id, original: f.probe, divergence: f.d, shrunk };
  });
  if (a.shrink) {
    console.log(
      `shrunk ${results.length} in ${Math.round(performance.now() - t1)} ms, ${answers.calls} vim run(s) in all`,
    );
    if (answers.odd.length > 0) {
      console.log(`${answers.odd.length} probe(s) runVim could not read, e.g. ${answers.odd[0]}`);
    }
  }
  const groups = new Map<string, Failure[]>();
  for (const r of results) {
    const best = r.shrunk ?? { probe: r.original, divergence: r.divergence };
    const k = signature(best.probe, best.divergence);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const sorted = [...groups.entries()].sort((x, y) => y[1].length - x[1].length);
  for (const [k, rs] of sorted) {
    const best = rs
      .map((r) => r.shrunk ?? { probe: r.original, divergence: r.divergence })
      .sort(
        (x, y) =>
          x.probe.keys.length + x.probe.start.length - y.probe.keys.length - y.probe.start.length,
      )[0] as Shrunk;
    console.log(`\n[${rs.length}] ${k}`);
    console.log(show(best.probe, best.divergence));
    console.log(
      `    cases:  ${rs
        .map((r) => r.id)
        .slice(0, 8)
        .join(" ")}${rs.length > 8 ? " ..." : ""}`,
    );
  }
  if (a.json !== undefined) {
    await Bun.write(
      a.json,
      `${JSON.stringify(
        results.map((r) => ({
          id: r.id,
          original: r.original,
          kind: r.divergence.kind,
          shrunk: r.shrunk && {
            probe: r.shrunk.probe,
            vim: r.shrunk.divergence.vim,
            engine: r.shrunk.divergence.engine,
            signature: signature(r.shrunk.probe, r.shrunk.divergence),
          },
        })),
        null,
        2,
      )}\n`,
    );
  }
  if (open.length > 0) process.exit(1);
}

await main();
