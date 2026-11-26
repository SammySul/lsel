// Runs a case through the real vim pinned in the dev shell and reads back buffer, cursor and mode.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseKeys, type VimKey } from "../src/input/keys.ts";
import { VIRTUAL_WINDOW_LINES } from "../src/vim/vimSetup.ts";
import { type Observed, type OracleCase, type OracleMode, settingsOf } from "./types.ts";

const VIM_NAME: Readonly<Record<string, string>> = { Ins: "Insert" };

/** One key as it goes inside a vim double-quoted string (`:help expr-quote`). */
function vimStringKey(key: VimKey): string {
  if (key === "<lt>") return "<";
  if (key === "<Space>") return " ";
  if (key === "\\") return "\\\\";
  if (key === '"') return '\\"';
  if (key.length === 1) return key;
  const inner = key.slice(1, -1);
  const m = /^((?:[CAS]-)*)(.+)$/.exec(inner);
  const mods = m?.[1] ?? "";
  const base = m?.[2] ?? inner;
  return `\\<${mods}${VIM_NAME[base] ?? base}>`;
}

export function vimString(keys: readonly VimKey[]): string {
  return keys.map(vimStringKey).join("");
}

const MODES: Readonly<Record<string, OracleMode>> = {
  n: "normal",
  i: "insert",
  R: "replace",
  v: "visual",
  V: "visual line",
  "^V": "visual block",
  c: "prompt",
};

/** vim's mode(1) through strtrans(), e.g. "niI" or "^V" */
export function modeOf(vimMode: string): OracleMode {
  if (/^ni[IRV]$/.test(vimMode)) return "insert-normal";
  if (vimMode.startsWith("no")) return "operator-pending";
  if (vimMode.startsWith("c")) return "prompt";
  const m = MODES[vimMode];
  if (m === undefined) throw new Error(`unexpected vim mode ${JSON.stringify(vimMode)}`);
  return m;
}

function quote(s: string): string {
  return `'${s.replaceAll("'", "''")}'`;
}

/** The whole vim session for one case; cursor and mode are read by a <Cmd> queued after the keys. */
export function driveScript(c: OracleCase, outPath: string): string {
  const s = settingsOf(c);
  const tab = s.indentUnit === "\t";
  const options = [
    `tabstop=${s.tabSize}`,
    `shiftwidth=${tab ? 0 : s.indentUnit.length}`,
    tab ? "noexpandtab" : "expandtab",
    "softtabstop=0",
    "noautoindent nosmartindent nocindent indentexpr=",
    "ignorecase smartcase",
    "backspace=indent,eol,start",
    "nowrap nomodeline",
    // the core's J always joins with one space
    "nojoinspaces",
    // one line more than the window, for the command line; columns keeps messages off the hit-enter prompt
    `lines=${VIRTUAL_WINDOW_LINES + 1} columns=200 cmdheight=1 laststatus=1`,
  ];
  return [
    `set ${options.join(" ")}`,
    `let s:out = ${quote(outPath)}`,
    "function! s:Write(d) abort",
    "  call writefile([json_encode(a:d)], s:out)",
    "  qa!",
    "endfunction",
    `if winheight(0) != ${VIRTUAL_WINDOW_LINES}`,
    `  call s:Write({'error': 'winheight is ' . winheight(0) . ', not ${VIRTUAL_WINDOW_LINES}'})`,
    "endif",
    "function! YwRecord() abort",
    "  call s:Write({'doc': join(getline(1, '$'), \"\\n\"), 'line': line('.'), 'col': col('.'),",
    "    \\ 'mode': strtrans(mode(1)), 'version': v:versionlong})",
    "endfunction",
    `call feedkeys("${vimString(parseKeys(c.keys))}\\<Cmd>call YwRecord()\\<CR>", "tx")`,
    "call s:Write({'error': 'the keys finished without reaching the recorder (did they swallow the <Cmd>?)'})",
    "",
  ].join("\n");
}

interface VimAnswer extends Observed {
  version: string;
}

export class OracleError extends Error {}

/** "9.2.1164" from `vim --version` */
export async function vimVersion(vim = "vim"): Promise<string> {
  const text = await new Response(Bun.spawn([vim, "--version"], { stdout: "pipe" }).stdout).text();
  const m = /IMproved (\d+\.\d+)[\s\S]*?Included patches: \d+-(\d+)/.exec(text);
  if (!m) throw new OracleError(`cannot read the version from ${vim} --version`);
  return `${m[1]}.${m[2]}`;
}

const TIMEOUT_MS = 5000;

function versionOf(long: number): string {
  return `${Math.floor(long / 1e6)}.${Math.floor(long / 1e4) % 100}.${long % 1e4}`;
}

export async function runVim(c: OracleCase, vim = "vim"): Promise<VimAnswer> {
  const dir = await mkdtemp(join(tmpdir(), "yw-oracle-"));
  try {
    const out = join(dir, "out.json");
    await Bun.write(join(dir, "start.txt"), `${c.start}\n`);
    await Bun.write(join(dir, "drive.vim"), driveScript(c, out));
    const proc = Bun.spawn(
      [vim, "-u", "NONE", "-U", "NONE", "-i", "NONE", "-n", "-N", "--not-a-term"].concat([
        "-S",
        join(dir, "drive.vim"),
        join(dir, "start.txt"),
      ]),
      { cwd: dir, stdin: "ignore", stdout: "ignore", stderr: "pipe", timeout: TIMEOUT_MS },
    );
    const code = await proc.exited;
    if (proc.signalCode !== null) {
      throw new OracleError(
        `${c.id}: vim did not finish within ${TIMEOUT_MS} ms (killed by ${proc.signalCode}); is it waiting for input?`,
      );
    }
    const file = Bun.file(out);
    if (!(await file.exists())) {
      const err = await new Response(proc.stderr).text();
      throw new OracleError(
        `${c.id}: vim exited ${code} without an answer: ${err.trim().slice(-300)}`,
      );
    }
    const raw = (await file.json()) as {
      error?: string;
      doc: string;
      line: number;
      col: number;
      mode: string;
      version: number;
    };
    if (raw.error !== undefined) throw new OracleError(`${c.id}: ${raw.error}`);
    return {
      doc: raw.doc,
      cursor: { line: raw.line, col: raw.col },
      mode: modeOf(raw.mode),
      version: versionOf(raw.version),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
