import {
  type CodeMirror as CM,
  CodeMirror,
  type MotionArgs,
  type Pos,
  Vim,
} from "@replit/codemirror-vim";
import { shiftLine, shiftUnit } from "./indent.ts";
import {
  firstNonBlank,
  joinLines,
  replaceAction,
  replaceMotion,
  replaceOperator,
  vcolOf,
} from "./lines.ts";
import { noteFailure } from "./macro.ts";

// Operators where the core differs from vim (:help exclusive-linewise, :help d, :help >>, :help J), r<Tab>, gp and gP.

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
