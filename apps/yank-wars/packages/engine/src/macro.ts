import { Vim, type vimState } from "@replit/codemirror-vim";
import { isVimKey, parseKeys, type VimKey } from "./keys.ts";
import type { BoundSession } from "./registry.ts";
import type { EditorSession } from "./session.ts";

// Far below where any browser's stack runs out, so a recursive macro stops at the same key everywhere.
export const MAX_MACRO_DEPTH = 100;

interface Recording {
  readonly register: string;
  readonly keys: VimKey[];
}

const recordings = new WeakMap<EditorSession, Recording>();
let depth = 0;

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

export function charKey(c: string): VimKey | undefined {
  const k = LITERAL_KEY[c] ?? c;
  return isVimKey(k) ? k : undefined;
}

// The core's tokenizer (vim.js:6785), so yanked text runs as it did: <Esc> is a key, newlines are skipped.
const REGISTER_TOKEN = /<(?:[CSMA]-)*\w+>|./giu;

export function registerKeys(text: string): VimKey[] {
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
export function runEx(b: BoundSession, input: string): void {
  const s = b.session;
  const outer = s.inExCallback;
  s.inExCallback = true;
  try {
    Vim.handleEx(s.cm as Parameters<typeof Vim.handleEx>[0], input);
  } finally {
    s.inExCallback = outer;
  }
}

// Like vim's typeahead: the register's keys go through the same path as typed keys.
export function playRegister(b: BoundSession, name: string): void {
  const reg = Vim.getRegisterController().getRegister(name);
  nested(() => {
    if (name === ":") {
      const input = reg.keyBuffer[0];
      if (input) runEx(b, input);
      return;
    }
    const keys = reg.keyBuffer.flatMap(registerKeys);
    for (const k of keys) b.dispatch(k);
  });
}

function hasPendingInput(vim: vimState): boolean {
  return vim.inputState.keyBuffer.length > 0 || Boolean(vim.inputState.operator);
}

// :help :normal: an unfinished command is aborted as if <Esc> was typed.
export function runNormal(b: BoundSession, text: string): void {
  const s = b.session;
  for (const c of text) {
    const k = charKey(c);
    if (k !== undefined) b.dispatch(k);
  }
  const vim = s.cm.state.vim;
  if (s.prompt !== null || vim?.insertMode || (vim && hasPendingInput(vim)))
    b.dispatch("<Esc>" as VimKey);
}
