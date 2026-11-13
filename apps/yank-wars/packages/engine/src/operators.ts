import {
  type CodeMirror as CM,
  CodeMirror,
  type MotionArgs,
  type Pos,
  Vim,
} from "@replit/codemirror-vim";
import { shiftLine, shiftUnit } from "./ex.ts";
import { undoSteps } from "./history.ts";
import {
  firstNonBlank,
  joinLines,
  replaceAction,
  replaceMotion,
  replaceOperator,
  vcolOf,
} from "./lines.ts";
import { noteFailure } from "./macro.ts";
import { boundTo } from "./registry.ts";
import {
  blockObject,
  moveByParagraph,
  type ObjectRange,
  quoteObject,
  tagObject,
} from "./textObjects.ts";

// Operators and motions where the core differs from vim (:help exclusive-linewise, :help d, :help >>, :help J).

const lineLength = (cm: CM, line: number) => cm.getLine(line).length;

/** inindent(0): only blanks before the position. */
function inIndent(cm: CM, pos: Pos): boolean {
  const m = /^[ \t]*/.exec(cm.getLine(pos.line));
  return pos.ch <= (m?.[0].length ?? 0);
}

// The core's clipToLine (vim.js:3997): w and W under an operator stop at the end of the last word's line (fwd_word's eol).
function clipWordToLine(cm: CM, start: Pos, end: Pos): void {
  const selection = cm.getRange(start, end);
  if (!/\n\s*$/.test(selection)) return;
  const lines = selection.split("\n");
  lines.pop();
  let line = lines.pop();
  for (
    ;
    lines.length > 0 && line !== undefined && line !== "" && /^\s*$/.test(line);
    line = lines.pop()
  ) {
    end.line--;
    end.ch = 0;
  }
  if (line) {
    end.line--;
    end.ch = lineLength(cm, end.line);
  } else end.ch = 0;
}

interface RangeOp {
  operator: string;
  motion: string;
  motionArgs: MotionArgs & { wordEnd?: boolean; inclusive?: boolean };
  start: Pos;
  end: Pos;
}

/** do_pending_operator()'s exclusive adjustment and op_delete()'s linewise exception; true makes the range linewise. */
export function adjustOperatorRange(cm: CM, op: RangeOp): boolean {
  const { start, end, motionArgs } = op;
  let inclusive = !!motionArgs.inclusive;
  // <BS> wrapping back puts the cursor on the previous line's end so the line break goes (CA_NO_ADJ_OP_END).
  if (op.motion === "moveLeftWrap") return false;
  if (op.motion === "moveByWords" && motionArgs.forward && !motionArgs.wordEnd) {
    clipWordToLine(cm, start, end);
  } else if (!inclusive && end.ch === 0 && end.line > start.line) {
    end.line--;
    if (inIndent(cm, start)) return true;
    end.ch = lineLength(cm, end.line);
    inclusive = false;
  }
  if (op.operator === "delete" && end.line > start.line) {
    const rest = cm.getLine(end.line).slice(end.ch + (inclusive ? 1 : 0));
    if (/^[ \t]*$/.test(rest) && inIndent(cm, start)) return true;
  }
  return false;
}

export function installOperators(): void {
  (Vim as unknown as { adjustOperatorRange: typeof adjustOperatorRange }).adjustOperatorRange =
    adjustOperatorRange;

  // dd, cc, yy, >> with a count: cursor_down() fails only from the last line, otherwise it stops there.
  replaceMotion("expandToLine", (cm, head, args) => {
    const repeat = args.repeat ?? 1;
    if (repeat > 1 && head.line === cm.lastLine()) return null as unknown as Pos;
    return new CodeMirror.Pos(Math.min(cm.lastLine(), head.line + repeat - 1), Infinity);
  });

  // > and <: whole shiftwidths from the current indent, empty lines untouched (shift_line()).
  const coreIndent = replaceOperator(
    "indent",
    function (this: unknown, cm, args, ranges, anchor, head) {
      const vim = cm.state.vim;
      if (vim?.visualBlock) {
        const u = shiftUnit(cm);
        const times = args.repeat || 1;
        if (!args.indentRight) return coreIndent.call(this, cm, args, ranges, anchor, head);
        let cursor = ranges[0]?.anchor as Pos;
        for (let i = ranges.length - 1; i >= 0; i--) {
          const r = ranges[i] as { anchor: Pos; head: Pos };
          cursor =
            r.anchor.line < r.head.line ||
            (r.anchor.line === r.head.line && r.anchor.ch <= r.head.ch)
              ? r.anchor
              : r.head;
          if (lineLength(cm, cursor.line) <= cursor.ch) continue;
          const pad = u.useTabs ? "\t".repeat(times) : " ".repeat(u.width * times);
          cm.replaceRange(pad, cursor, cursor);
        }
        return cursor;
      }
      const times = vim?.visualMode ? args.repeat || 1 : 1;
      const first = ranges[0] as { anchor: Pos; head: Pos };
      const from = Math.min(first.anchor.line, first.head.line);
      let to = Math.max(first.anchor.line, first.head.line);
      const end = first.anchor.line > first.head.line ? first.anchor : first.head;
      if (to > from && end.ch === 0) to--;
      if (args.linewise && (first.head.line > cm.lastLine() || first.anchor.line > cm.lastLine()))
        to = Math.min(to, cm.lastLine());
      const u = shiftUnit(cm);
      for (let l = from; l <= Math.min(to, cm.lastLine()); l++)
        shiftLine(cm, l, args.indentRight ? times : -times, u);
      return new CodeMirror.Pos(from, firstNonBlank(cm.getLine(from)));
    },
  );

  // J, gJ and visual J join with vim's spacing (do_join()).
  replaceAction("joinLines", (cm, args, vim) => {
    let line: number;
    let count: number;
    if (vim.visualMode) {
      const a = vim.sel.anchor.line;
      const h = vim.sel.head.line;
      line = Math.min(a, h);
      count = Math.max(2, Math.abs(a - h) + 1);
    } else {
      line = cm.getCursor().line;
      count = Math.max(2, args.repeat ?? 1);
      if (line === cm.lastLine()) {
        noteFailure();
        return;
      }
    }
    if (line + count - 1 > cm.lastLine()) {
      if (vim.visualMode && line === cm.lastLine()) {
        // Nothing to join: back to normal mode with the cursor where it was.
        Vim.exitVisualMode(cm as Parameters<typeof Vim.exitVisualMode>[0]);
        return;
      }
      count = cm.lastLine() - line + 1;
    }
    const col = joinLines(cm, line, count, !(args as { keepSpaces?: boolean }).keepSpaces);
    if (vim.visualMode) Vim.exitVisualMode(cm as Parameters<typeof Vim.exitVisualMode>[0], false);
    cm.setCursor(new CodeMirror.Pos(line, Math.min(col, Math.max(0, lineLength(cm, line) - 1))));
  });

  // + - _ and <CR> are linewise (:help linewise); <CR> is a motion, not the core's j^ mapping, so d<CR> works.
  Vim.mapCommand(
    "+",
    "motion",
    "moveByLines",
    { forward: true, toFirstChar: true, linewise: true } as never,
    {},
  );
  Vim.mapCommand(
    "-",
    "motion",
    "moveByLines",
    { forward: false, toFirstChar: true, linewise: true } as never,
    {},
  );
  Vim.mapCommand(
    "_",
    "motion",
    "moveByLines",
    { forward: true, toFirstChar: true, repeatOffset: -1, linewise: true } as never,
    {},
  );
  // No context: a "normal" entry does not match once an operator is pending (vim.js commandMatches).
  for (const k of ["<CR>", "<C-m>"]) {
    Vim.mapCommand(
      k,
      "motion",
      "moveByLines",
      { forward: true, toFirstChar: true, linewise: true } as never,
      {},
    );
  }
  for (const k of ["<C-j>", "<C-n>"])
    Vim.mapCommand(k, "motion", "moveByLines", { forward: true, linewise: true } as never, {});
  Vim.mapCommand("<C-p>", "motion", "moveByLines", { forward: false, linewise: true } as never, {});
  // gj/gk without wrapping are j/k, linewise under an operator too.
  Vim.mapCommand(
    "gj",
    "motion",
    "moveByDisplayLines",
    { forward: true, linewise: true } as never,
    {},
  );
  Vim.mapCommand(
    "gk",
    "motion",
    "moveByDisplayLines",
    { forward: false, linewise: true } as never,
    {},
  );
  Vim.mapCommand(
    "<S-Right>",
    "motion",
    "moveByWords",
    { forward: true, wordEnd: false } as never,
    {},
  );
  Vim.mapCommand(
    "<C-Right>",
    "motion",
    "moveByWords",
    { forward: true, wordEnd: false, bigWord: true } as never,
    {},
  );
  Vim.mapCommand(
    "<S-Left>",
    "motion",
    "moveByWords",
    { forward: false, wordEnd: false } as never,
    {},
  );
  Vim.mapCommand(
    "<C-Left>",
    "motion",
    "moveByWords",
    { forward: false, wordEnd: false, bigWord: true } as never,
    {},
  );

  // <Space> and <BS> wrap across lines ('whichwrap' b,s).
  // evalInput clears vim.inputState before the motion runs; the old one comes as the fifth argument.
  Vim.defineMotion("moveRightWrap", (cm, head, args, _vim, is) => {
    let pos = head;
    const op = !!is?.operator;
    for (let i = 0; i < (args.repeat ?? 1); i++) {
      const len = lineLength(cm, pos.line);
      const last = op ? len : len - 1;
      if (pos.ch < last) pos = new CodeMirror.Pos(pos.line, pos.ch + 1);
      else if (pos.line < cm.lastLine()) pos = new CodeMirror.Pos(pos.line + 1, 0);
      else if (i === 0 && !(op && pos.ch < len)) return null as unknown as Pos;
    }
    return pos;
  });
  Vim.defineMotion("moveLeftWrap", (cm, head, args, _vim, is) => {
    let pos = head;
    const op = !!is?.operator;
    for (let i = 0; i < (args.repeat ?? 1); i++) {
      if (pos.ch > 0) pos = new CodeMirror.Pos(pos.line, pos.ch - 1);
      else if (pos.line > 0) {
        const len = lineLength(cm, pos.line - 1);
        pos = new CodeMirror.Pos(pos.line - 1, op ? len : Math.max(0, len - 1));
      } else if (i === 0) return null as unknown as Pos;
    }
    return pos;
  });
  Vim.mapCommand("<Space>", "motion", "moveRightWrap", {} as never, {});
  for (const k of ["<BS>", "<C-h>"]) Vim.mapCommand(k, "motion", "moveLeftWrap", {} as never, {});

  // N% is the line N percent into the buffer (:help N%).
  const coreMatch = replaceMotion(
    "moveToMatchedSymbol",
    function (this: unknown, cm, head, args, vim, is) {
      if (!(args as { repeatIsExplicit?: boolean }).repeatIsExplicit)
        return coreMatch.call(this, cm, head, args, vim, is);
      if ((args.repeat ?? 0) > 100) return null as unknown as Pos;
      const lines = cm.lastLine() + 1;
      const line = Math.floor(((args.repeat ?? 0) * lines + 99) / 100) - 1;
      args.linewise = true;
      return new CodeMirror.Pos(line, firstNonBlank(cm.getLine(line)));
    },
  );
  Vim.mapCommand(
    "%",
    "motion",
    "moveToMatchedSymbol",
    { inclusive: true, toJumplist: true, explicitRepeat: true } as never,
    {},
  );

  replaceMotion("moveByParagraph", moveByParagraph);

  // u and <C-r> put the cursor where vim's u_undoredo() does: back where the change began when that is in the changed lines.
  const undoRedo = (redo: boolean) => (cm: CM, args: { repeat?: number }) => {
    const b = boundTo(cm);
    if (b === undefined) return;
    const st = undoSteps(b.session.clock);
    let target: Pos | undefined;
    for (let i = 0; i < (args.repeat ?? 1); i++) {
      const was = cm.getValue();
      (redo ? CodeMirror.commands.redo : CodeMirror.commands.undo)(cm);
      if (cm.getValue() === was) break;
      const step = redo ? st.undone.pop() : st.done.pop();
      if (step !== undefined) (redo ? st.done : st.undone).push(step);
      const before = was.split("\n");
      const after = cm.getValue().split("\n");
      let p = 0;
      while (p < before.length && p < after.length && before[p] === after[p]) p++;
      let q = 0;
      while (
        q < before.length - p &&
        q < after.length - p &&
        before[before.length - 1 - q] === after[after.length - 1 - q]
      )
        q++;
      const top = p - 1;
      const newsize = after.length - p - q;
      const savedAt = step === undefined ? undefined : st.cursorBefore.get(step);
      const saved =
        savedAt === undefined
          ? undefined
          : cm.posFromIndex(Math.min(savedAt, cm.getValue().length));
      let line: number;
      if (saved && saved.line >= top && saved.line <= top + newsize + 1) line = saved.line;
      else line = Math.min(p, cm.lastLine());
      if (saved && saved.line + 1 === line && line > 0) line--;
      line = Math.min(line, cm.lastLine());
      const len = cm.getLine(line).length;
      target =
        saved && saved.line === line
          ? new CodeMirror.Pos(line, Math.min(saved.ch, Math.max(0, len - 1)))
          : new CodeMirror.Pos(line, firstNonBlank(cm.getLine(line)));
    }
    if (target) cm.setCursor(target);
  };
  replaceAction("undo", undoRedo(false));
  replaceAction("redo", undoRedo(true));

  // i( a( and friends with counts and vim's line rules, quote objects as current_quote(); visual mode stays the core's.
  const PAIRS: Readonly<Record<string, readonly [string, string]>> = {
    "(": ["(", ")"],
    ")": ["(", ")"],
    b: ["(", ")"],
    "{": ["{", "}"],
    "}": ["{", "}"],
    B: ["{", "}"],
    "[": ["[", "]"],
    "]": ["[", "]"],
    "<": ["<", ">"],
    ">": ["<", ">"],
  };
  const coreObject = replaceMotion(
    "textObjectManipulation",
    function (this: unknown, cm, head, args, vim, is) {
      const c = (args as { selectedCharacter?: string }).selectedCharacter ?? "";
      const inner = !!(args as { textObjectInner?: boolean }).textObjectInner;
      const count = args.repeat ?? 1;
      if (vim.visualMode) return coreObject.call(this, cm, head, args, vim, is);
      let r: ObjectRange | undefined;
      const pair = PAIRS[c];
      if (pair) r = blockObject(cm, head, pair[0], pair[1], inner, count);
      else if (c === '"' || c === "'" || c === "`") r = quoteObject(cm, head, c, inner, count);
      else if (c === "t") r = tagObject(cm, head, inner, count);
      else return coreObject.call(this, cm, head, args, vim, is);
      if (r === undefined) return null as unknown as Pos;
      if (r.linewise) {
        args.linewise = true;
        const opArgs = vim.inputState.operatorArgs as { linewise?: boolean } | undefined;
        if (opArgs) opArgs.linewise = true;
      }
      return [r.start, r.end] as unknown as Pos;
    },
  );

  // g_ (last non-blank, count lines down), g$ with a count, gm gM go (:help g_, gm, gM, go).
  Vim.defineMotion("moveToLastNonBlank", (cm, head, args) => {
    const line = head.line + (args.repeat ?? 1) - 1;
    if (line > cm.lastLine()) return null as unknown as Pos;
    const text = cm.getLine(line);
    const m = /[^ \t][ \t]*$/.exec(text);
    return new CodeMirror.Pos(line, m ? m.index : 0);
  });
  Vim.mapCommand("g_", "motion", "moveToLastNonBlank", { inclusive: true } as never, {});
  Vim.mapCommand("g$", "motion", "moveToEol", { inclusive: true } as never, {});
  Vim.defineMotion("moveToScreenMiddle", (cm, head) => {
    const len = lineLength(cm, head.line);
    return new CodeMirror.Pos(head.line, Math.max(0, Math.min(100, len - 1)));
  });
  Vim.mapCommand("gm", "motion", "moveToScreenMiddle", {} as never, {});
  Vim.defineMotion("moveToTextPercent", (cm, head, args) => {
    const len = lineLength(cm, head.line);
    const pct = (args as { repeatIsExplicit?: boolean }).repeatIsExplicit
      ? (args.repeat ?? 50)
      : 50;
    return new CodeMirror.Pos(
      head.line,
      Math.max(0, Math.min(len - 1, Math.floor((len * pct) / 100))),
    );
  });
  Vim.mapCommand("gM", "motion", "moveToTextPercent", { explicitRepeat: true } as never, {});
  Vim.defineMotion("moveToByte", (cm, _head, args) => {
    const n = (args as { repeatIsExplicit?: boolean }).repeatIsExplicit ? (args.repeat ?? 1) : 1;
    const doc = cm.getValue();
    return cm.posFromIndex(Math.max(0, Math.min(n - 1, doc.length - 1)));
  });
  Vim.mapCommand(
    "go",
    "motion",
    "moveToByte",
    { explicitRepeat: true, toJumplist: true } as never,
    {},
  );

  // Key aliases from :help index: <C-Home> is gg, <C-End> the last character of line [count] or the last line, g<Home> g0, g<End> g_, <S-Up>/<S-Down> page.
  Vim.mapCommand(
    "<C-Home>",
    "motion",
    "moveToLineOrEdgeOfDocument",
    { forward: false, explicitRepeat: true, linewise: true, toJumplist: true } as never,
    {},
  );
  Vim.defineMotion("moveToLastCharOfDocument", (cm, _head, args) => {
    const explicit = (args as { repeatIsExplicit?: boolean }).repeatIsExplicit;
    const line = Math.min(cm.lastLine(), explicit ? (args.repeat ?? 1) - 1 : cm.lastLine());
    return new CodeMirror.Pos(line, Math.max(0, lineLength(cm, line) - 1));
  });
  Vim.mapCommand(
    "<C-End>",
    "motion",
    "moveToLastCharOfDocument",
    { inclusive: true, explicitRepeat: true, toJumplist: true } as never,
    {},
  );
  Vim.mapCommand("g<Home>", "motion", "moveToStartOfLine", undefined, {});
  Vim.mapCommand("g<End>", "motion", "moveToLastNonBlank", { inclusive: true } as never, {});
  Vim.mapCommand("<S-Up>", "keyToKey", "", {} as never, { toKeys: "<C-b>" });
  Vim.mapCommand("<S-Down>", "keyToKey", "", {} as never, { toKeys: "<C-f>" });

  // r<Tab> puts the <Tab> as 'expandtab' would type it.
  Vim.defineAction("replaceWithTab", (cm, args) => {
    const cur = cm.getCursor();
    const text = cm.getLine(cur.line);
    const n = args.repeat ?? 1;
    if (cur.ch + n > text.length) {
      noteFailure();
      return;
    }
    const u = shiftUnit(cm);
    const fill = u.useTabs
      ? "\t"
      : " ".repeat(u.tabSize - (vcolOf(text, cur.ch, u.tabSize) % u.tabSize));
    cm.replaceRange(fill.repeat(n), cur, new CodeMirror.Pos(cur.line, cur.ch + n));
    cm.setCursor(new CodeMirror.Pos(cur.line, cur.ch + fill.length * n - 1));
  });
  Vim.mapCommand("r<Tab>", "action", "replaceWithTab", {} as never, {
    isEdit: true,
    context: "normal",
  });

  // gp and gP put like p and P, leaving the cursor just after the new text.
  Vim.mapCommand(
    "gp",
    "action",
    "paste",
    { isEdit: true, after: true, cursorAfter: true } as never,
    { isEdit: true },
  );
  Vim.mapCommand(
    "gP",
    "action",
    "paste",
    { isEdit: true, after: false, cursorAfter: true } as never,
    { isEdit: true },
  );
}
