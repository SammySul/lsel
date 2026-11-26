// q and @: macros recorded and replayed as keys, stopping when a command fails, and :normal.

import { Vim, type vimState } from "@replit/codemirror-vim";
import { isVimKey, parseKeys, type VimKey } from "../input/keys.ts";
import type { EditorSession } from "../session.ts";
import type { BoundSession } from "./registry.ts";

// Far below where any browser's stack runs out, so a recursive macro stops at the same key everywhere.
const MAX_MACRO_DEPTH = 100;

interface Recording {
  readonly register: string;
  readonly keys: VimKey[];
}

const recordings = new WeakMap<EditorSession, Recording>();
let depth = 0;
// vim flushes typeahead when a command fails or errors: the running macros (and :normal) stop there.
let failed = false;
let aborted = false;

export function inMacro(): boolean {
  return depth > 0;
}

export function noteFailure(): void {
  failed = true;
}

export function resetMacros(): void {
  failed = false;
  aborted = false;
  depth = 0;
}

export function recordingOf(s: EditorSession): Recording | undefined {
  return recordings.get(s);
}

export function startRecording(s: EditorSession, register: string): void {
  recordings.set(s, { register, keys: [] });
}

// vim's q stops recording only as a command (a count is dropped): not as an argument (fq, "q, @q) or after dq.
export function stopsRecording(s: EditorSession, vim: vimState, key: VimKey): boolean {
  return (
    key === "q" &&
    recordings.has(s) &&
    !vim.insertMode &&
    /^\d*$/.test(vim.inputState.keyBuffer.join("")) &&
    !vim.inputState.operator
  );
}

export function stopRecording(s: EditorSession): void {
  const rec = recordings.get(s);
  if (rec === undefined) return;
  recordings.delete(s);
  const reg = Vim.getRegisterController().getRegister(rec.register);
  const append = rec.register !== rec.register.toLowerCase();
  reg.keyBuffer = [...(append ? reg.keyBuffer : []), ...rec.keys];
  reg.insertModeChanges = [];
  reg.searchQueries = [];
  reg.linewise = false;
  reg.blockwise = false;
}

const LITERAL_KEY: Readonly<Record<string, string>> = {
  "<": "<lt>",
  " ": "<Space>",
  "\t": "<Tab>",
};

// Control characters (a <C-v><Esc> typed into :normal) run as their keys.
const CONTROL_KEY: Readonly<Record<string, string>> = {
  "\r": "<CR>",
  "\u001b": "<Esc>",
  "\b": "<BS>",
};

function charKey(c: string): VimKey | undefined {
  let k = LITERAL_KEY[c] ?? CONTROL_KEY[c] ?? c;
  const code = c.charCodeAt(0);
  if (k === c && c.length === 1 && code >= 1 && code <= 26 && c !== "\n") {
    k = `<C-${String.fromCharCode(code + 96)}>`;
  }
  return isVimKey(k) ? k : undefined;
}

// The core's tokenizer (vim.js:6785), so yanked text runs as it did: <Esc> is a key, newlines are skipped.
const REGISTER_TOKEN = /<(?:[CSMA]-)*\w+>|./giu;

function registerKeys(text: string): VimKey[] {
  const keys: VimKey[] = [];
  for (const [tok] of text.matchAll(REGISTER_TOKEN)) {
    if (tok.length > 1 && tok.startsWith("<")) {
      try {
        keys.push(...parseKeys(tok));
        continue;
      } catch {}
    }
    for (const c of tok) {
      const k = charKey(c);
      if (k !== undefined) keys.push(k);
    }
  }
  return keys;
}

function nested(run: () => void): void {
  if (depth >= MAX_MACRO_DEPTH) throw new Error(`macro nested deeper than ${MAX_MACRO_DEPTH}`);
  depth++;
  try {
    run();
  } finally {
    depth--;
  }
}

// Runs inside the key that started it, so an ex command is one undo step, as when typed.
function runEx(b: BoundSession, input: string): void {
  const s = b.session;
  const outer = s.inExCallback;
  s.inExCallback = true;
  try {
    Vim.handleEx(s.cm as Parameters<typeof Vim.handleEx>[0], input);
  } finally {
    s.inExCallback = outer;
  }
}

/** One key of a macro or :normal; false once it failed, which ends them. */
function typeahead(b: BoundSession, key: VimKey): boolean {
  failed = false;
  try {
    b.dispatch(key);
  } catch (e) {
    // Thrown through the core's handleKey it would reset the vim state (vim.js:1050-1060); keep it here.
    b.session.lastError = e instanceof Error ? e.message : String(e);
    failed = true;
  }
  if (failed) aborted = true;
  failed = false;
  return !aborted;
}

// Like vim's typeahead: the register's keys go through the same path as typed keys.
export function playRegister(b: BoundSession, name: string): void {
  const reg = Vim.getRegisterController().getRegister(name);
  const outer = depth === 0;
  try {
    nested(() => {
      if (name === ":") {
        const input = reg.keyBuffer[0];
        if (!input) return;
        try {
          runEx(b, input);
        } catch (e) {
          b.session.lastError = e instanceof Error ? e.message : String(e);
          aborted = true;
        }
        return;
      }
      const keys = reg.keyBuffer.flatMap(registerKeys);
      for (const k of keys) if (!typeahead(b, k)) break;
    });
  } catch (e) {
    b.session.lastError = e instanceof Error ? e.message : String(e);
    aborted = true;
  } finally {
    if (outer) {
      if (aborted) failed = false;
    }
  }
}

/** True when the macro run that just ended stopped early; an outer @ loop ends with it. */
export function macroAborted(): boolean {
  return aborted;
}

export function endMacroRun(): void {
  if (depth === 0) aborted = false;
}

function hasPendingInput(vim: vimState): boolean {
  return vim.inputState.keyBuffer.length > 0 || Boolean(vim.inputState.operator);
}

// :help :normal: an unfinished command is aborted as if <Esc> was typed.
export function runNormal(b: BoundSession, text: string): void {
  const s = b.session;
  const was = aborted;
  aborted = false;
  for (const c of text) {
    const k = charKey(c);
    if (k !== undefined && !typeahead(b, k)) break;
  }
  aborted = was;
  const vim = s.cm.state.vim;
  if (s.prompt !== null || vim?.insertMode || (vim && hasPendingInput(vim)))
    b.dispatch("<Esc>" as VimKey);
}
