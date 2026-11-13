import { forceParsing, indentUnit } from "@codemirror/language";
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { CodeMirror, getCM, type Pos, Vim, vim } from "@replit/codemirror-vim";
import { blockInsertModeChange } from "./blockInsert.ts";
import { backFromCtrlO, dispatchKey } from "./feedKey.ts";
import { type UndoClock, undoHistory } from "./history.ts";
import { insertKeymap, syncDotRegister } from "./insertKeys.ts";
import { insertStarted } from "./insertRepeat.ts";
import { noteModeChange } from "./insertStart.ts";
import { languageExtension } from "./languages.ts";
import { resetMacros } from "./macro.ts";
import { installPrompt, type PromptState } from "./prompt.ts";
import type { Puzzle } from "./puzzle.ts";
import { bindSession } from "./registry.ts";
import { resetSearch } from "./search.ts";
import { resetSubstitute } from "./substitute.ts";
import { changeTracker } from "./track.ts";
import { resetVimRegexState } from "./vimRegex.ts";
import { applyEngineOptions, lockEngine, VIRTUAL_WINDOW_LINES } from "./vimSetup.ts";

export interface EditorSession {
  readonly puzzle: Puzzle;
  readonly view: EditorView;
  readonly cm: CodeMirror;
  readonly target: string;
  readonly clock: UndoClock;
  prompt: PromptState | null;
  message: { text: string; long: boolean } | null;
  inExCallback: boolean;
  feeding: boolean;
  keysFed: number;
  solved: boolean;
  lastError: string | null;
}

export interface SessionOptions {
  parent: HTMLElement;
  extraExtensions?: readonly Extension[];
}

export function engineExtensions(puzzle: Puzzle, clock: UndoClock): Extension[] {
  return [
    vim(),
    EditorState.allowMultipleSelections.of(true),
    EditorState.tabSize.of(puzzle.tabSize),
    indentUnit.of(puzzle.indentUnit),
    languageExtension(puzzle.language),
    undoHistory(clock),
    insertKeymap,
    changeTracker,
    EditorView.contentAttributes.of({
      autocorrect: "off",
      autocapitalize: "off",
      spellcheck: "false",
    }),
  ];
}

// On a blank line vim stops on its last character, never past it.
function startColumn(doc: string): number {
  const first = doc.split("\n", 1)[0] ?? "";
  const i = first.search(/[^ \t]/);
  return i === -1 ? Math.max(0, first.length - 1) : i;
}

export function createSession(puzzle: Puzzle, opts: SessionOptions): EditorSession {
  lockEngine();
  Vim.resetVimGlobalState_();
  resetVimRegexState();
  resetSubstitute();
  resetSearch();
  resetMacros();
  applyEngineOptions();

  const clock: UndoClock = { group: 0 };
  const view = new EditorView({
    state: EditorState.create({
      doc: puzzle.start,
      // vim (and VimGolf) opens a file on line 1's first non-blank.
      selection: EditorSelection.cursor(startColumn(puzzle.start)),
      extensions: [...engineExtensions(puzzle, clock), ...(opts.extraExtensions ?? [])],
    }),
    parent: opts.parent,
  });
  const cm = getCM(view);
  if (!cm) throw new Error("vim() did not attach a CodeMirror adapter");

  // Line arithmetic instead of pixel geometry, so j/k never depend on layout.
  const findPosV = cm.findPosV.bind(cm);
  cm.findPosV = (start, amount, unit, goal) => {
    if (unit !== "line" && unit !== "page") return findPosV(start, amount, unit, goal);
    const want = start.line + (unit === "page" ? amount * VIRTUAL_WINDOW_LINES : amount);
    const line = Math.max(0, Math.min(view.state.doc.lines - 1, want));
    const pos: Pos & { hitSide?: boolean } = new CodeMirror.Pos(
      line,
      Math.min(start.ch, cm.getLine(line).length),
    );
    if (line !== want) pos.hitSide = true;
    return pos;
  };

  const s: EditorSession = {
    puzzle,
    view,
    cm,
    target: puzzle.target,
    clock,
    prompt: null,
    message: null,
    inExCallback: false,
    feeding: false,
    keysFed: 0,
    solved: false,
    lastError: null,
  };
  installPrompt(s);
  let inInsert = false;
  bindSession(cm, {
    session: s,
    // Replayed keys arrive inside @q's or :normal's vim operation, which defers the change events '.' records (index.js:636-666).
    dispatch(key) {
      const outer = cm.curOp;
      cm.curOp = null;
      try {
        dispatchKey(s, key);
      } finally {
        if (cm.curOp) cm.onBeforeEndOperation();
        cm.curOp = outer;
      }
    },
  });

  // The core registers this before CM6's listeners (vim.js:320-327), so no CM6 handler can block it.
  const onPaste = cm.state.vim?.onPasteFn;
  if (onPaste) view.contentDOM.removeEventListener("paste", onPaste, false);
  // Its only other user is the insert-mode keydown listener (vim.js:3121), which records <BS>/<Del> a second time in browsers.
  const detached = {};
  cm.getInputField = () => detached as HTMLElement;

  cm.on("vim-mode-change", (e: { mode: string }) => {
    const insert = e.mode === "insert" || e.mode === "replace";
    const entering = insert && !inInsert;
    if (inInsert && !insert) {
      blockInsertModeChange(s, e.mode);
      syncDotRegister();
    }
    inInsert = insert;
    if (entering) {
      insertStarted(s);
      backFromCtrlO(s);
    }
    noteModeChange(s, e.mode);
  });

  forceParsing(view, view.state.doc.length, 1e9);
  return s;
}

export function destroySession(s: EditorSession): void {
  s.view.destroy();
}
