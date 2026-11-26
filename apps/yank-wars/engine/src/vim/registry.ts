// Finds the editor session behind the core's CodeMirror instance.

import type { CodeMirror } from "@replit/codemirror-vim";
import type { VimKey } from "../input/keys.ts";
import type { EditorSession } from "../session.ts";

export interface BoundSession {
  readonly session: EditorSession;
  /** feedKey's per-key path without the log bookkeeping: macros and :normal type through it */
  dispatch(key: VimKey): void;
}

const bound = new WeakMap<CodeMirror, BoundSession>();

export function bindSession(cm: CodeMirror, b: BoundSession): void {
  bound.set(cm, b);
}

// Core actions and ex commands only get the adapter instance.
export function boundTo(cm: unknown): BoundSession | undefined {
  return bound.get(cm as CodeMirror);
}
