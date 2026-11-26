// The HUD's view of a session: mode, pending keys, prompt and message.

import type { EditorSession } from "./session.ts";
import { recordingOf } from "./vim/macro.ts";

export type VimMode = "normal" | "insert" | "replace" | "visual" | "visual line" | "visual block";

export interface HudState {
  mode: VimMode;
  insertModeReturn: boolean;
  pending: string;
  prompt: { prefix: string; value: string } | null;
  message: string | null;
  recording: string | null;
  error: string | null;
}

const MODES: ReadonlySet<string> = new Set<VimMode>([
  "normal",
  "insert",
  "replace",
  "visual",
  "visual line",
  "visual block",
]);

function isMode(m: string | undefined): m is VimMode {
  return m !== undefined && MODES.has(m);
}

export function sessionSnapshot(s: EditorSession): HudState {
  const vim = s.cm.state.vim;
  // The adapter sets vim.mode only on the first vim-mode-change, so a fresh editor has none.
  const named = isMode(vim?.mode) ? vim.mode : "normal";
  const mode = vim?.insertMode && s.cm.state.overwrite ? "replace" : named;
  return {
    mode,
    insertModeReturn: vim?.insertModeReturn ?? false,
    pending: vim?.status ?? "",
    prompt: s.prompt === null ? null : { prefix: s.prompt.prefix, value: s.prompt.value },
    message: s.message?.text ?? null,
    recording: recordingOf(s)?.register ?? null,
    error: s.lastError,
  };
}
