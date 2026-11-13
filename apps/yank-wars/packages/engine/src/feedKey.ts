import { forceParsing } from "@codemirror/language";
import { type CodeMirror as CM, CodeMirror, Vim, type vimState } from "@replit/codemirror-vim";
import { blockInsertCtrlO } from "./blockInsert.ts";
import { insertCommands, literalOf, recordInsertKey } from "./insertKeys.ts";
import { insertKeyTyped, insertRestarted } from "./insertRepeat.ts";
import { beforeInsertEdit, captureInsertStart, insertStartOf, noteArrow } from "./insertStart.ts";
import { toCoreKey, type VimKey } from "./keys.ts";
import { chAtVcol, vcolOf } from "./lines.ts";
import { inMacro, recordingOf, stopRecording, stopsRecording } from "./macro.ts";
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

type Move = "Left" | "Right" | "Up" | "Down" | "Home" | "End" | "DocStart" | "DocEnd";

const MOVES: Readonly<Record<string, Move>> = {
  "<Left>": "Left",
  "<Right>": "Right",
  "<Up>": "Up",
  "<Down>": "Down",
  "<Home>": "Home",
  "<End>": "End",
  "<C-Home>": "DocStart",
  "<C-End>": "DocEnd",
};

// i_CTRL-G U: the next cursor key on the line neither splits undo nor restarts the insert for "."
const keepInsert = new WeakSet<EditorSession>();
// After an insert-mode <C-g>, the key that names its command.
const ctrlGPending = new WeakSet<EditorSession>();

function moveTo(s: EditorSession, move: Move): void {
  if (move === "DocStart") s.cm.setCursor(0, 0);
  else if (move === "DocEnd") s.cm.setCursor(s.cm.lastLine(), lineLen(s, s.cm.lastLine()));
  else insertCommands[move](s.view);
}

function lineLen(s: EditorSession, line: number): number {
  return s.cm.getLine(line).length;
}

// :help ins-special-special: a cursor key splits undo, <Home>/<End> always, the others when they move.
function moveInInsert(s: EditorSession, move: Move): void {
  const before = s.view.state.selection;
  const line = s.cm.getCursor().line;
  moveTo(s, move);
  const moved = !s.view.state.selection.eq(before);
  if (keepInsert.has(s) && (move === "Left" || move === "Right")) {
    keepInsert.delete(s);
    if (s.cm.getCursor().line === line) return;
  }
  keepInsert.delete(s);
  if (move === "Home" || move === "End" || moved) splitInsert(s);
}

function splitInsert(s: EditorSession): void {
  s.clock.group++;
  noteArrow(s);
  insertRestarted(s);
}

// i_CTRL-G j/k: a line down or up, to the column where inserting started.
function ctrlGVertical(s: EditorSession, dir: 1 | -1): void {
  const cur = s.cm.getCursor();
  const to = cur.line + dir;
  if (to < 0 || to > s.cm.lastLine()) return;
  const start = insertStartOf(s) ?? cur;
  const ts = s.puzzle.tabSize;
  const vcol = vcolOf(s.cm.getLine(start.line), start.ch, ts);
  s.cm.setCursor(to, chAtVcol(s.cm.getLine(to), vcol, ts));
  splitInsert(s);
}

function ctrlGCommand(s: EditorSession, key: VimKey): void {
  if (key === "j" || key === "<C-j>" || key === "<Down>") ctrlGVertical(s, 1);
  else if (key === "k" || key === "<C-k>" || key === "<Up>") ctrlGVertical(s, -1);
  else if (key === "u") s.clock.group++;
  else if (key === "U") keepInsert.add(s);
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
  } else if (key === "<C-y>" || key === "<C-e>") {
    // The character at the same screen column in the line above (<C-y>) or below (<C-e>).
    const pos = s.cm.getCursor();
    const other = pos.line + (key === "<C-y>" ? -1 : 1);
    if (other < 0 || other > s.cm.lastLine()) return;
    const ts = s.puzzle.tabSize;
    const text = s.cm.getLine(other);
    const ch = chAtVcol(text, vcolOf(s.cm.getLine(pos.line), pos.ch, ts), ts);
    if (ch < text.length) s.cm.replaceSelection(text[ch] as string);
  } else if (key === "<Tab>" && s.puzzle.indentUnit !== "\t") {
    // 'expandtab': spaces to the next tabstop ('softtabstop' 0).
    const pos = s.cm.getCursor();
    const ts = s.puzzle.tabSize;
    s.cm.replaceSelection(" ".repeat(ts - (vcolOf(s.cm.getLine(pos.line), pos.ch, ts) % ts)));
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
// Insert-mode keys vim binds to others: <C-h> is <BS>, <C-j> and <C-m> are <CR> (:help i_CTRL-H).
const INSERT_ALIAS: Readonly<Record<string, VimKey>> = {
  "<C-h>": "<BS>" as VimKey,
  "<C-j>": "<CR>" as VimKey,
  "<C-m>": "<CR>" as VimKey,
};

export function dispatchKey(s: EditorSession, typed: VimKey): void {
  let vim = vimOf(s);
  const key =
    vim.insertMode && s.prompt === null && vim.inputState.keyBuffer.length === 0
      ? (INSERT_ALIAS[typed] ?? typed)
      : typed;
  // One undo group per normal/visual key; insert sessions, prompts and ex commands inherit theirs.
  // A macro run is one undo step, like the @ that started it (u undoes all of @q).
  if (!vim.insertMode && s.prompt === null && !s.inExCallback && !inMacro()) s.clock.group++;
  if (s.prompt !== null) {
    routePromptKey(s, key);
    clampToLine(s);
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
  if (vim.insertMode && vim.inputState.keyBuffer.length === 0) {
    if (ctrlGPending.delete(s)) {
      insertKeyTyped(s, key);
      ctrlGCommand(s, key);
      return;
    }
    if (key === "<C-g>") {
      insertKeyTyped(s, key);
      ctrlGPending.add(s);
      return;
    }
  }
  // multiSelectHandleKey's multiselect-<Esc> branch reads it (vim.js:7116).
  vim.status = (vim.status || "") + core;
  // A typed < would partially match the insert keymap's "<C-w>" text and arm a 200 ms timer (vim.js:950-965).
  const typedLt = core === "<" && vim.insertMode && vim.inputState.keyBuffer.length === 0;
  const wasInsert = vim.insertMode;
  const here = s.cm.getCursor();
  const atEol =
    wasInsert && here.ch > 0 && here.ch >= s.cm.getLine(here.line).length
      ? { line: here.line }
      : null;
  if (wasInsert) {
    if (key === "<C-o>") {
      blockInsertCtrlO(s);
      insertRestarted(s);
    } else if (!Object.hasOwn(MOVES, key) || keepInsert.has(s)) insertKeyTyped(s, key);
  }
  const handled = !typedLt && Vim.multiSelectHandleKey(s.cm, core, "user");
  // The state object is replaced when handleKey throws (vim.js:1050-1060).
  vim = vimOf(s);
  if (!handled && vim.insertMode) insertFallback(s, key);
  captureInsertStart(s);
  if (key === "<C-o>" && wasInsert && !vim.insertMode) ctrlOFrom.set(s, atEol);
  clampToLine(s);
}

// i_CTRL-O remembers whether the cursor was past the end of the line (vim's ins_at_eol).
const ctrlOFrom = new WeakMap<EditorSession, { line: number } | null>();

export function backFromCtrlO(s: EditorSession): void {
  if (!ctrlOFrom.has(s)) return;
  const from = ctrlOFrom.get(s);
  ctrlOFrom.delete(s);
  const vim = s.cm.state.vim;
  const cur = s.cm.getCursor();
  const len = s.cm.getLine(cur.line).length;
  // edit.c: back in Insert mode the cursor goes past the end again if it was there, or if curswant is past it ($).
  const want = vim?.lastHPos ?? 0;
  const past =
    want === Number.POSITIVE_INFINITY ||
    (from !== null &&
      from !== undefined &&
      want > vcolOf(s.cm.getLine(cur.line), cur.ch, s.puzzle.tabSize));
  if (len > 0 && cur.ch === len - 1 && ((from && from.line === cur.line) || past)) {
    s.cm.setCursor(cur.line, len);
  }
}

// Normal mode never leaves the cursor past the last character (check_cursor_col()).
function clampToLine(s: EditorSession): void {
  const vim = s.cm.state.vim;
  if (!vim || vim.insertMode || vim.visualMode || s.prompt !== null) return;
  const cur = s.cm.getCursor();
  const len = s.cm.getLine(cur.line).length;
  if (len > 0 && cur.ch >= len) s.cm.setCursor(cur.line, len - 1);
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
