// . and a count repeat an insert as the keys typed in it (vim's redo buffer), so <C-w>, <BS>, <C-r> and friends repeat as typed.

import { Vim } from "@replit/codemirror-vim";
import type { VimKey } from "../input/keys.ts";
import type { EditorSession } from "../session.ts";
import { blockDotCount } from "./blockInsert.ts";
import { boundTo } from "./registry.ts";

const typed = new WeakMap<EditorSession, VimKey[]>();

const EXITS = new Set(["<Esc>", "<C-c>", "<C-[>"]);
const INSERT_HERE = {
  keys: "i",
  type: "action",
  action: "enterInsertMode",
  isEdit: true,
  actionArgs: { insertAt: "inplace" },
};

function playing(): boolean {
  return Vim.getVimGlobalState_().macroModeState.isPlaying;
}

export function insertStarted(s: EditorSession): void {
  // Back from <C-o> the insert goes on; its next edit starts the new one.
  if (playing() || restarting.has(s)) return;
  typed.set(s, []);
}

const restarting = new WeakSet<EditorSession>();

/** After a cursor key or <C-o> (start_arrow()): a count is dropped, and the next edit starts a new insert that . repeats at the cursor. */
export function insertRestarted(s: EditorSession): void {
  if (playing()) return;
  restarting.add(s);
  const vim = s.cm.state.vim;
  if (vim) (vim as { insertModeRepeat?: number | undefined }).insertModeRepeat = undefined;
}

export function insertKeyTyped(s: EditorSession, key: VimKey): void {
  if (playing()) return;
  if (EXITS.has(key)) {
    restarting.delete(s);
    return;
  }
  if (restarting.has(s)) {
    restarting.delete(s);
    typed.set(s, []);
    const vim = s.cm.state.vim;
    if (vim) {
      (vim as { lastEditActionCommand: unknown }).lastEditActionCommand = INSERT_HERE;
      vim.lastEditInputState = vim.inputState;
    }
  }
  typed.get(s)?.push(key);
}

let replaying = false;

export function repeatInsert(cm: unknown, repeat: number): boolean {
  const b = boundTo(cm);
  // <C-r>. inside the repeated keys asks for the last insert again: the core's own change list answers that.
  if (b === undefined || replaying) return false;
  const keys = [...(typed.get(b.session) ?? [])];
  const times = blockDotCount(b.session) ?? repeat;
  replaying = true;
  try {
    for (let i = 0; i < times; i++) for (const k of keys) b.dispatch(k);
  } finally {
    replaying = false;
  }
  return true;
}
