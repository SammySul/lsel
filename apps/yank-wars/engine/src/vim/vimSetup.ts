// Installs the whole vim layer into the core once, and blocks the commands Yank Wars disables.

import {
  type ActionFn,
  CodeMirror,
  type CodeMirrorV,
  type MotionFn,
  type OperatorFn,
  Vim,
  type vimKey,
} from "@replit/codemirror-vim";
import { installBlockInsert } from "./blockInsert.ts";
import { executeEx, exHook } from "./ex.ts";
import { installIncrement } from "./increment.ts";
import { repeatInsert } from "./insertRepeat.ts";
import { deleteBackInInsert } from "./insertStart.ts";
import { chAtVcol, cursorVcol, replaceMotion } from "./lines.ts";
import { endMacroRun, macroAborted, noteFailure, playRegister, startRecording } from "./macro.ts";
import { installMotions } from "./motions.ts";
import { installOperators } from "./operators.ts";
import { boundTo } from "./registry.ts";
import { installSearch } from "./search.ts";
import { installTextObjects } from "./textObjects.ts";
import { installUndo } from "./undo.ts";
import { vimRegExp } from "./vimRegex.ts";

export const VIRTUAL_WINDOW_LINES = 30;

// Exact built-in names and shortNames (vim.js:272-309), so defineEx replaces the commandMap_ entry.
const BLOCKED_EX: readonly (readonly [string, string])[] = [
  ["colorscheme", "colo"],
  ["map", "map"],
  ["imap", "im"],
  ["nmap", "nm"],
  ["vmap", "vm"],
  ["omap", "om"],
  ["noremap", "no"],
  ["nnoremap", "nn"],
  ["vnoremap", "vn"],
  ["inoremap", "ino"],
  ["onoremap", "ono"],
  ["unmap", "unmap"],
  ["mapclear", "mapc"],
  ["nmapclear", "nmapc"],
  ["vmapclear", "vmapc"],
  ["imapclear", "imapc"],
  ["omapclear", "omapc"],
  ["set", "se"],
  ["setlocal", "setl"],
  ["setglobal", "setg"],
];

function notify(cm: CodeMirrorV, text: string): void {
  const div = document.createElement("div");
  div.textContent = text;
  cm.openNotification(div, { bottom: true, duration: 5000 });
}

const blocked = (text: string) => (cm: CodeMirrorV) => notify(cm, text);

function firstNonBlank(cm: CodeMirrorV, line: number): number {
  const text = cm.getLine(line);
  const i = text.search(/\S/);
  return i === -1 ? text.length : i;
}

function lineStart(cm: CodeMirrorV, line: number) {
  const l = Math.max(0, Math.min(cm.lastLine(), line));
  return new CodeMirror.Pos(l, firstNonBlank(cm, l));
}

// Core motions, actions and operators run with `this` bound to their table (vim.js:2043, 1745, 2177).
interface Motions {
  moveByLines: MotionFn;
  moveByDisplayLines: MotionFn;
  moveByScroll: MotionFn;
  moveToColumn: MotionFn;
  moveToEol: MotionFn;
}
interface Actions {
  replace: ActionFn;
  continuePaste(
    cm: CodeMirrorV,
    args: Parameters<ActionFn>[1],
    vim: Parameters<ActionFn>[2],
    text: string,
    register: unknown,
  ): void;
}
interface Operators {
  change: OperatorFn;
}

const isClipboard = (name: string | null | undefined) => name === "+" || name === "*";

let locked = false;

const coreRegExp = (pattern: string, ignoreCase: boolean, smartCase: boolean) =>
  vimRegExp(pattern, "m", ignoreCase, smartCase);

export function lockEngine(): void {
  if (locked) return;
  locked = true;
  for (const [name, short] of BLOCKED_EX) {
    Vim.defineEx(name, short, blocked("mappings and :set are disabled in Yank Wars"));
  }
  Vim.defineEx("write", "w", blocked("lock-in is automatic"));
  Vim.mapclear();
  Vim.suppressErrorLogging = true;
  // Our patch of the core (patches/): every nopcre pattern goes through vim's dialect, not translateRegex.
  (Vim as unknown as { vimRegExp: typeof coreRegExp }).vimRegExp = coreRegExp;
  CodeMirror.commands.newlineAndIndent = (cm) => cm.replaceSelection("\n");

  // The clipboard's only call sites (vim.js:1515, 3253), so "+p, :pu +, :y + and :g/x/pu + never reach it.
  const controller = Object.getPrototypeOf(Vim.getRegisterController()) as {
    pushText(name: string | null | undefined, ...rest: unknown[]): void;
  };
  const pushText = controller.pushText;
  controller.pushText = function (name, ...rest) {
    pushText.call(this, isClipboard(name) ? undefined : name, ...rest);
  };
  Vim.defineAction("paste", function (this: Actions, cm, args, vim) {
    if (isClipboard(args.registerName)) delete args.registerName;
    const register = Vim.getRegisterController().getRegister(args.registerName);
    this.continuePaste(cm, args, vim, register.toString(), register);
  });

  Vim.defineAction("scroll", () => {});
  Vim.defineAction("scrollToCursor", () => {});
  Vim.defineMotion("moveToTopLine", (cm, _head, args) => lineStart(cm, args.repeat - 1));
  Vim.defineMotion("moveToMiddleLine", (cm) =>
    lineStart(cm, Math.floor(Math.min(cm.lastLine(), VIRTUAL_WINDOW_LINES - 1) / 2)),
  );
  Vim.defineMotion("moveToBottomLine", (cm, _head, args) =>
    lineStart(cm, Math.min(cm.lastLine(), VIRTUAL_WINDOW_LINES - 1) - args.repeat + 1),
  );
  Vim.defineMotion("moveByPage", (cm, head, args) => {
    const n = (VIRTUAL_WINDOW_LINES - 2) * args.repeat;
    return lineStart(cm, head.line + (args.forward ? n : -n));
  });
  // Port of vim.js:2398-2441 without pixel goals that fails like vim on the first/last line (dj there deletes nothing).
  // lastHPos is vim's curswant, a screen column, so j and k keep the column across tabs.
  Vim.defineMotion("moveByLines", function (this: Motions, cm, head, args, vim) {
    const ts = boundTo(cm)?.session.puzzle.tabSize ?? 8;
    let vcol = cursorVcol(cm.getLine(head.line), head.ch, ts);
    switch (vim.lastMotion) {
      case this.moveByLines:
      case this.moveByDisplayLines:
      case this.moveByScroll:
      case this.moveToColumn:
      case this.moveToEol:
        vcol = vim.lastHPos;
        break;
      default:
        vim.lastHPos = vcol;
    }
    const repeat = args.repeat + (args.repeatOffset ?? 0);
    const want = args.forward ? head.line + repeat : head.line - repeat;
    const last = cm.lastLine();
    if ((want < 0 && head.line === 0) || (want > last && head.line === last)) return null;
    const line = Math.max(0, Math.min(last, want));
    // A block after $ stays ragged-right through j and k (the core keeps head.ch Infinity, vim.js:2095).
    if (vcol === Number.POSITIVE_INFINITY && vim.visualBlock && !args.toFirstChar)
      return new CodeMirror.Pos(line, Number.POSITIVE_INFINITY);
    let ch = chAtVcol(cm.getLine(line), vcol, ts);
    if (args.toFirstChar) {
      ch = firstNonBlank(cm, line);
      vim.lastHPos = cursorVcol(cm.getLine(line), ch, ts);
    }
    return new CodeMirror.Pos(line, ch);
  });
  // | goes to a screen column.
  Vim.defineMotion("moveToColumn", (cm, head, args, vim) => {
    const ts = boundTo(cm)?.session.puzzle.tabSize ?? 8;
    vim.lastHPos = args.repeat - 1;
    const text = cm.getLine(head.line);
    return new CodeMirror.Pos(
      head.line,
      Math.min(chAtVcol(text, args.repeat - 1, ts), Math.max(0, text.length - 1)),
    );
  });
  Vim.defineMotion("moveByScroll", function (this: Motions, cm, head, args, vim, inputState) {
    // No count arrives as 0 (vim.js:2028-2042).
    args.repeat = args.repeat || Math.floor(VIRTUAL_WINDOW_LINES / 2);
    return this.moveByLines(cm, head, args, vim, inputState);
  });
  Vim.defineMotion("moveByDisplayLines", function (this: Motions, cm, head, args, vim, inputState) {
    return this.moveByLines(cm, head, args, vim, inputState);
  });
  // Both run CM6's smart home (vim.js:140, 2575); with no wrapping they are 0 and ^.
  Vim.mapCommand("g0", "motion", "moveToStartOfLine", undefined, {});
  Vim.mapCommand("g^", "motion", "moveToFirstNonWhiteSpaceCharacter", undefined, {});

  // vim fails when the count runs past the end of the line: 5rx on abc changes nothing.
  Vim.defineAction("countedReplace", function (this: Actions, cm, args, vim) {
    const cur = cm.getCursor();
    if (!vim.visualMode && cur.ch + args.repeat > cm.getLine(cur.line).length) {
      noteFailure();
      return;
    }
    this.replace(cm, args, vim);
  });
  Vim.mapCommand("r<character>", "action", "countedReplace", undefined, { isEdit: true });

  // noautoindent: cc, S and linewise c also delete the indent, which the core keeps (vim.js:2732).
  Vim.defineOperator("changeNoIndent", function (this: Operators, cm, args, ranges, anchor, head) {
    const moveTo = this.change(cm, args, ranges, anchor, head);
    if (args.linewise && !cm.state.vim.visualMode) {
      const cur = cm.getCursor();
      if (cur.ch > 0) cm.replaceRange("", new CodeMirror.Pos(cur.line, 0), cur);
    }
    return moveTo;
  });
  Vim.mapCommand("c", "operator", "changeNoIndent", undefined, {});
  // S expands to cc through a noremap keyToKey (vim.js:101), which skips mapped commands.
  Vim._mapCommand({
    keys: "S",
    type: "operatorMotion",
    operator: "changeNoIndent",
    motion: "expandToLine",
    motionArgs: { linewise: true },
    context: "normal",
  } as vimKey);

  // Insert-mode <C-w>/<C-u> stop once at the insert start (:help i_CTRL-U, 'backspace' start).
  Vim.defineAction("deleteBackWord", (cm) => deleteBackInInsert(boundTo(cm)?.session, "word"));
  Vim.defineAction("deleteBackLine", (cm) => deleteBackInInsert(boundTo(cm)?.session, "line"));
  Vim.mapCommand("<C-w>", "action", "deleteBackWord", undefined, { context: "insert" });
  Vim.mapCommand("<C-u>", "action", "deleteBackLine", undefined, { context: "insert" });

  // Macros are keys, like vim; the core's change-list recording drops ex commands and cursor keys (vim.js:6768-6801).
  Vim.defineAction("enterMacroRecordMode", (cm, args) => {
    const name = args.selectedCharacter;
    const b = boundTo(cm);
    if (b === undefined || !Vim.getRegisterController().isValidRegister(name)) return;
    startRecording(b.session, name);
    Vim.getVimGlobalState_().macroModeState.latestRegister = name;
  });
  Vim.defineAction("replayMacro", (cm, args) => {
    const b = boundTo(cm);
    if (b === undefined) return;
    const ms = Vim.getVimGlobalState_().macroModeState;
    let name = args.selectedCharacter ?? "";
    if (name === "@") name = ms.latestRegister ?? "";
    else ms.latestRegister = name;
    for (let i = 0; i < (args.repeat || 1) && !macroAborted(); i++) playRegister(b, name);
    endMacroRun();
  });
  // Our patch of the core: command lines go to ex.ts first; what it does not know, the core runs.
  (Vim as unknown as { exHook: typeof exHook }).exHook = exHook;
  installSearch(replaceMotion);
  installOperators();
  installMotions();
  installTextObjects();
  installUndo();
  installIncrement();
  installBlockInsert();
  (Vim as unknown as { onFailure: () => void }).onFailure = noteFailure;
  (Vim as unknown as { repeatInsert: typeof repeatInsert }).repeatInsert = repeatInsert;
  // & is :s (no flags) and g& is :%s//~/& (:help &, g&).
  Vim.defineAction("repeatSubstitute", (cm, args) => {
    executeEx(cm, (args as { global?: boolean }).global ? "%s//~/&" : "s");
  });
  Vim.mapCommand("&", "action", "repeatSubstitute", {}, { isEdit: true });
  Vim.mapCommand("g&", "action", "repeatSubstitute", { global: true } as never, { isEdit: true });
}

export function applyEngineOptions(): void {
  Vim.setOption("pcre", false);
}
