import { forceParsing, indentUnit } from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { CodeMirror, getCM, type Pos, Vim, vim } from "@replit/codemirror-vim";
import { dispatchKey } from "./feedKey.ts";
import { type UndoClock, undoHistory } from "./history.ts";
import { insertKeymap } from "./insertKeys.ts";
import { noteModeChange } from "./insertStart.ts";
import { languageExtension } from "./languages.ts";
import { installPrompt, type PromptState } from "./prompt.ts";
import type { Puzzle } from "./puzzle.ts";
import { bindSession } from "./registry.ts";
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
    EditorView.contentAttributes.of({
      autocorrect: "off",
      autocapitalize: "off",
      spellcheck: "false",
    }),
  ];
}

export function createSession(puzzle: Puzzle, opts: SessionOptions): EditorSession {
  lockEngine();
  Vim.resetVimGlobalState_();
  applyEngineOptions();

  const clock: UndoClock = { group: 0 };
  const view = new EditorView({
    state: EditorState.create({
      doc: puzzle.start,
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

  cm.on("vim-mode-change", (e: { mode: string }) => noteModeChange(s, e.mode));

  forceParsing(view, view.state.doc.length, 1e9);
  return s;
}

export function destroySession(s: EditorSession): void {
  s.view.destroy();
}
