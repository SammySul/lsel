// nix develop -c bun packages/engine/oracle/fuzz/answer.ts [--check]: the only writer of fuzz.vim.json and fuzz.unanswered.json.
import type { FixtureEntry, FixtureFile } from "../types.ts";
import { settingsOf } from "../types.ts";
import { OracleError, runVim, vimVersion } from "../vim.ts";
import { reapStuckVims } from "./check.ts";
import {
  candidateCases,
  FIXTURE_PATH,
  FUZZ_COUNT,
  fuzzCases,
  readFuzzFixture,
  readUnanswered,
  UNANSWERED_PATH,
  type Unanswered,
} from "./corpus.ts";

const CONCURRENCY = 16;

// the id is the key already, and which signal ended a hung vim depends on timing
function reason(id: string, message: string): string {
  return message.replace(`${id}: `, "").replace(/ \(killed by SIG[A-Z]+\)/, "");
}

function json(x: unknown): string {
  return `${JSON.stringify(x, null, 2)}\n`;
}

async function main() {
  const check = process.argv.includes("--check");
  const vim = Bun.which("vim");
  if (vim === null || !vim.startsWith("/nix/store/")) {
    console.error(`fuzz answer: vim is ${vim ?? "missing"}; run inside the dev shell`);
    process.exit(2);
  }
  setInterval(reapStuckVims, 2000).unref();
  const version = await vimVersion(vim);
  const candidates = candidateCases();
  const answers = new Map<string, FixtureEntry>();
  const unanswered: Unanswered = { vim: version, cases: {} };
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < candidates.length) {
        const c = candidates[next++];
        if (c === undefined) continue;
        try {
          const a = await runVim(c, vim);
          if (a.version !== version) throw new Error(`${c.id}: vim version changed mid-run`);
          answers.set(c.id, {
            start: c.start,
            keys: c.keys,
            settings: settingsOf(c),
            doc: a.doc,
            cursor: a.cursor,
            mode: a.mode,
          });
        } catch (e) {
          if (!(e instanceof OracleError)) throw e;
          unanswered.cases[c.id] = reason(c.id, e.message);
        }
      }
    }),
  );
  // a loaded machine makes slow answers look like hangs; a miss counts only if it misses again alone
  for (const c of candidates) {
    if (unanswered.cases[c.id] === undefined) continue;
    try {
      const a = await runVim(c, vim);
      answers.set(c.id, {
        start: c.start,
        keys: c.keys,
        settings: settingsOf(c),
        doc: a.doc,
        cursor: a.cursor,
        mode: a.mode,
      });
      delete unanswered.cases[c.id];
    } catch (e) {
      if (!(e instanceof OracleError)) throw e;
    }
  }
  // the grammar means every case to end in normal mode; one that does not is unusable, not a test
  for (const [id, e] of answers) {
    if (e.mode !== "normal") unanswered.cases[id] = `vim ends in ${e.mode} mode`;
  }
  const corpus = fuzzCases(unanswered);
  if (corpus.length < FUZZ_COUNT) {
    console.error(`fuzz: only ${corpus.length} answerable cases; raise FUZZ_SLACK`);
    process.exit(1);
  }
  // only the misses that shaped the corpus, in id order
  const last = Number(corpus[corpus.length - 1]?.id.split("-")[2]);
  const kept: Unanswered = { vim: version, cases: {} };
  for (const c of candidates) {
    const why = unanswered.cases[c.id];
    if (why !== undefined && Number(c.id.split("-")[2]) < last) kept.cases[c.id] = why;
  }
  const file: FixtureFile = { vim: version, cases: {} };
  for (const c of corpus) file.cases[c.id] = answers.get(c.id) as FixtureEntry;
  const same =
    json(await readFuzzFixture()) === json(file) && json(readUnanswered()) === json(kept);
  const misses = Object.keys(kept.cases).length;
  if (check) {
    if (same) console.log(`fuzz: ${corpus.length} case(s) up to date (vim ${version})`);
    else {
      console.error("fuzz: fixture out of date; run fuzz/answer.ts");
      const old = await readFuzzFixture();
      const was = readUnanswered()?.cases ?? {};
      for (const id of new Set([...Object.keys(was), ...Object.keys(kept.cases)])) {
        if (was[id] !== kept.cases[id]) console.error(`  ${id}: ${was[id]} -> ${kept.cases[id]}`);
      }
      for (const [id, e] of Object.entries(file.cases)) {
        const o = old?.cases[id];
        if (o !== undefined && json(o) !== json(e)) console.error(`  ${id}: vim's answer changed`);
      }
    }
    process.exit(same ? 0 : 1);
  }
  if (!same) {
    await Bun.write(FIXTURE_PATH, json(file));
    await Bun.write(UNANSWERED_PATH, json(kept));
  }
  console.log(
    `fuzz: ${corpus.length} case(s) answered, ${misses} candidate(s) vim could not answer, ` +
      `${same ? "unchanged" : "written"} (vim ${version})`,
  );
  for (const [id, why] of Object.entries(kept.cases)) console.log(`  unanswered ${id}: ${why}`);
}

await main();
