import { forceParsing } from "@codemirror/language";
import { type CodeMirror as CM, CodeMirror, Vim, type vimState } from "@replit/codemirror-vim";
import { insertCommands, literalOf, recordInsertKey } from "./insertKeys.ts";
import { beforeInsertEdit, captureInsertStart, noteArrow } from "./insertStart.ts";
import { toCoreKey, type VimKey } from "./keys.ts";
import { recordingOf, stopRecording, stopsRecording } from "./macro.ts";
import { routePromptKey } from "./prompt.ts";
import type { EditorSession } from "./session.ts";

export interface KeyResult {
  solved: boolean;
  docChanged: boolean;
  error: string | null;
}

// The adapter's ViewPlugin instance; index.d.ts types cm.state.vimPlugin as any.
interface VimPluginLike {
  readonly query: unknown;
  readonly blockCursor: { scheduleRedraw(): void };
}

function vimPluginOf(cm: CM): VimPluginLike {
  return cm.state.vimPlugin as VimPluginLike;
}

type Move = "Left" | "Right" | "Up" | "Down" | "Home" | "End";

const MOVES: Readonly<Record<string, Move>> = {
  "<Left>": "Left",
  "<Right>": "Right",
  "<Up>": "Up",
  "<Down>": "Down",
  "<Home>": "Home",
  "<End>": "End",
};

// :help ins-special-special: a cursor key splits undo, <Home>/<End> always, the others when they move.
function moveInInsert(s: EditorSession, move: Move): void {
  const before = s.view.state.selection;
  insertCommands[move](s.view);
  if (move === "Home" || move === "End" || !s.view.state.selection.eq(before)) {
    s.clock.group++;
    noteArrow(s);
  }
}

// Insert-mode keys the core leaves unhandled; the adapter's DOM path (index.js:1489-1498) does this natively.
function insertFallback(s: EditorSession, key: VimKey): void {
  const lit = literalOf(key);
  const move = Object.hasOwn(MOVES, key) ? MOVES[key] : undefined;
  if (move !== undefined) {
    moveInInsert(s, move);
    return;
  }
  if (key === "<BS>" || key === "<Del>" || lit !== undefined) beforeInsertEdit(s);
  if (s.cm.state.overwrite) {
    if (key === "<BS>") {
      recordInsertKey("Backspace");
      CodeMirror.commands.cursorCharLeft(s.cm);
    } else if (key === "<CR>") s.cm.replaceSelection("\n");
    else if (key === "<Del>") {
      recordInsertKey("Delete");
      insertCommands.Delete(s.view);
    } else if (lit !== undefined) {
      // One vim op, or its selection-only dispatch (index.js:721) reads as a cursor move and drops the '.' record (vim.js:6898).
      s.cm.operation(() => {
        if (s.cm.curOp) s.cm.curOp.isVimOp = true;
        s.cm.overWriteSelection(lit);
      });
    }
  } else if (key === "<BS>") {
    recordInsertKey("Backspace");
    insertCommands.Backspace(s.view);
  } else if (key === "<Del>") {
    recordInsertKey("Delete");
    insertCommands.Delete(s.view);
  }
  // Same call as the core's own '.' replay (vim.js:7054).
  else if (lit !== undefined) s.cm.replaceSelection(lit);
  // <C-v>, <PageUp>, <S-Left>, ...: counted no-ops on both sides.
}

function vimOf(s: EditorSession): vimState {
  return Vim.maybeInitVimState_(s.cm);
}

// One key through the editor, whether typed or replayed by a macro or :normal.
export function dispatchKey(s: EditorSession, key: VimKey): void {
  let vim = vimOf(s);
  // One undo group per normal/visual key; insert sessions, prompts and ex commands inherit theirs.
  if (!vim.insertMode && s.prompt === null && !s.inExCallback) s.clock.group++;
  if (s.prompt !== null) {
    routePromptKey(s, key);
    return;
  }
  if (stopsRecording(s, vim, key)) {
    vim.inputState.keyBuffer.length = 0;
    stopRecording(s);
    return;
  }
  const core = toCoreKey(key);
  if (core === "<Esc>" && !vim.insertMode && !vim.visualMode && vimPluginOf(s.cm).query) {
    const st = vim.searchState_;
    if (st) {
      s.cm.removeOverlay(st.getOverlay());
      st.setOverlay(null);
    }
  }
  // multiSelectHandleKey's multiselect-<Esc> branch reads it (vim.js:7116).
  vim.status = (vim.status || "") + core;
  const handled = Vim.multiSelectHandleKey(s.cm, core, "user");
  // The state object is replaced when handleKey throws (vim.js:1050-1060).
  vim = vimOf(s);
  if (!handled && vim.insertMode) insertFallback(s, key);
  captureInsertStart(s);
}

export function feedKey(s: EditorSession, key: VimKey): KeyResult {
  if (s.solved) return { solved: true, docChanged: false, error: null };
  s.keysFed++;
  s.lastError = null;
  s.feeding = true;
  const before = s.view.state.doc;
  const recording = recordingOf(s);
  try {
    dispatchKey(s, key);
  } catch (e) {
    // Ex errors and core crashes; the core has already reset its state, and the key still counts.
    s.lastError = e instanceof Error ? e.message : String(e);
  } finally {
    s.feeding = false;
  }
  // A macro holds what was typed, not what a register replayed; the q that stops it is left out.
  if (recording !== undefined && recordingOf(s) === recording) recording.keys.push(key);
  // A complete tree before the next key, so = and >> never depend on the parse budget.
  forceParsing(s.view, s.view.state.doc.length, 1e9);
  vimPluginOf(s.cm).blockCursor.scheduleRedraw();
  s.solved = s.view.state.doc.toString() === s.target;
  return { solved: s.solved, docChanged: !s.view.state.doc.eq(before), error: s.lastError };
}
