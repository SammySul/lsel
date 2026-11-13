import { type EngineRun, replayCase } from "../engine.ts";
import type { Observed, OracleSettings } from "../types.ts";
import { OracleError, runVim } from "../vim.ts";

export interface Probe {
  start: string;
  keys: string;
  settings: OracleSettings;
}

/** What differs first, in the order a player would notice it. */
export type Kind = "doc" | "cursor" | "mode";

export interface Divergence {
  kind: Kind;
  /** the engine threw something no vim command produces (a JS error, an invalid JS regex) */
  crash: boolean;
  vim: Observed;
  engine: EngineRun;
}

const CRASH =
  /TypeError|RangeError|ReferenceError|SyntaxError|Invalid regular expression|Cannot read|is not a function|undefined|call stack|nested deeper/i;

export function compare(vim: Observed, engine: EngineRun): Divergence | undefined {
  const kind: Kind | undefined =
    vim.doc !== engine.doc
      ? "doc"
      : vim.cursor.line !== engine.cursor.line || vim.cursor.col !== engine.cursor.col
        ? "cursor"
        : vim.mode !== engine.mode
          ? "mode"
          : undefined;
  if (kind === undefined) return undefined;
  return { kind, crash: engine.errors.some((e) => CRASH.test(e.message)), vim, engine };
}

export function engineOf(p: Probe): EngineRun {
  return replayCase({ id: "fuzz-probe", ...p });
}

function seconds(etime: string): number {
  const [d, rest] = etime.includes("-") ? etime.split("-") : ["0", etime];
  return (rest ?? "").split(":").reduce((s, x) => s * 60 + Number(x), Number(d) * 86400);
}

export const NO_SHELL = "/usr/bin/false";
const STUCK_SECONDS = 8;

/** SIGKILLs this process's vim children older than STUCK_SECONDS; runVim's SIGTERM is sometimes ignored. */
export function reapStuckVims(): void {
  const kids = Bun.spawnSync(["pgrep", "-P", String(process.pid)])
    .stdout.toString()
    .trim();
  if (kids === "") return;
  const ps = Bun.spawnSync(["ps", "-o", "pid=,etime=,comm=", "-p", kids.split(/\s+/).join(",")]);
  for (const line of ps.stdout.toString().trim().split("\n")) {
    const [pid, etime, comm] = line.trim().split(/\s+/);
    if (pid && etime && comm?.endsWith("vim") && seconds(etime) >= STUCK_SECONDS) {
      process.kill(Number(pid), "SIGKILL");
    }
  }
}

/** vim's answers, memoised; undefined when vim cannot answer (waits for input, quits, hangs). */
export class VimAnswers {
  private readonly memo = new Map<string, Promise<Observed | undefined>>();
  calls = 0;
  /** runVim failures that were not OracleErrors, for the run summary */
  readonly odd: string[] = [];

  constructor(private readonly vim: string) {
    // shrinking builds ex lines the grammar never would (`:gr`, `:!`); none may reach a shell
    if (process.env.SHELL !== NO_SHELL) throw new Error(`VimAnswers needs SHELL=${NO_SHELL}`);
    setInterval(reapStuckVims, 2000).unref();
  }

  forget(p: Probe): void {
    this.memo.delete(JSON.stringify([p.settings, p.start, p.keys]));
  }

  answer(p: Probe): Promise<Observed | undefined> {
    const k = JSON.stringify([p.settings, p.start, p.keys]);
    let a = this.memo.get(k);
    if (a === undefined) {
      this.calls++;
      a = runVim({ id: "fuzz-probe", ...p }, this.vim).then(
        (r) => ({ doc: r.doc, cursor: r.cursor, mode: r.mode }),
        (e: unknown) => {
          // runVim also throws plain errors (modeOf knows no select mode); a probe it cannot read is unanswered
          if (!(e instanceof OracleError))
            this.odd.push(e instanceof Error ? e.message : String(e));
          return undefined;
        },
      );
      this.memo.set(k, a);
    }
    return a;
  }
}

/** How the engine diverges from vim on p, which vim ends in normal mode; engineNormal skips vim (slow on those) when the engine does not. */
export async function divergence(
  answers: VimAnswers,
  p: Probe,
  opts: { engineNormal?: boolean } = {},
): Promise<Divergence | undefined> {
  const engine = engineOf(p);
  if (opts.engineNormal && engine.mode !== "normal") return undefined;
  const vim = await answers.answer(p);
  if (vim === undefined || vim.mode !== "normal") return undefined;
  return compare(vim, engine);
}
