import { type CodeMirror as CM, CodeMirror, type Pos, Vim } from "@replit/codemirror-vim";
import { chAtVcol, replaceAction, replaceMotion, replaceOperator, vcolOf } from "./lines.ts";
import { boundTo } from "./registry.ts";
import type { EditorSession } from "./session.ts";

// Visual-block I A c C D X Y as in vim's ops.c: an insert types on the first line and is copied to the rest at <Esc>.

type Kind = "I" | "A";

interface Block {
  top: number;
  bottom: number;
  /** Screen columns, inclusive. */
  left: number;
  right: number;
  dollar: boolean;
}

interface Pending extends Block {
  kind: Kind;
  /** I and A put the cursor on the block's top-left after copying; c leaves it where <Esc> did. */
  toTopLeft: boolean;
  startCh: number;
  firstLen: number;
  viaCtrlO?: boolean;
  /** Set when . replays a block insert: the original count, which a count on . does not replace. */
  dotCount?: number;
}

interface Last {
  kind: Kind;
  count: number;
  height: number;
  width: number;
  dollar: boolean;
}

const pending = new WeakMap<EditorSession, Pending>();
const lastBlock = new WeakMap<EditorSession, Last | null>();

interface VimSel {
  visualMode: boolean;
  visualBlock: boolean;
  lastHPos: number;
  sel: { anchor: Pos; head: Pos };
}

interface Tables {
  delete(cm: CM, args: object, ranges: unknown, anchor?: Pos, head?: Pos): Pos | undefined;
  yank(cm: CM, args: object, ranges: unknown, anchor?: Pos, head?: Pos): Pos | undefined;
  change(cm: CM, args: object, ranges: unknown, anchor?: Pos, head?: Pos): Pos | undefined;
}

// The core's enterInsertMode, captured at install: operators run with `this` bound to their own table.
let enter: (cm: CM, args: object, vim: unknown) => void = () => {};
// The motions table's j/k, which keep vim.lastHPos only right after themselves (vimSetup.ts).
let moveByLines: unknown;

const tabSizeOf = (cm: CM) => boundTo(cm)?.session.puzzle.tabSize ?? 8;
const widthOf = (text: string, ts: number) => vcolOf(text, text.length, ts);
const playing = () => Vim.getVimGlobalState_().macroModeState.isPlaying;

function charCols(text: string, ch: number, ts: number): [number, number] {
  const v = vcolOf(text, ch, ts);
  const w = text[ch] === "\t" ? ts - (v % ts) : 1;
  return [v, v + w - 1];
}

function blockOf(cm: CM, vim: VimSel, s: EditorSession): Block {
  const ts = tabSizeOf(cm);
  const { anchor, head } = vim.sel;
  const top = Math.min(anchor.line, head.line);
  const bottom = Math.min(cm.lastLine(), Math.max(anchor.line, head.line));
  const [al, ar] = charCols(cm.getLine(Math.min(anchor.line, cm.lastLine())), anchor.ch, ts);
  const [hl, hr] = charCols(cm.getLine(Math.min(head.line, cm.lastLine())), head.ch, ts);
  const dollar = playing()
    ? (lastBlock.get(s)?.dollar ?? false)
    : head.ch === Number.POSITIVE_INFINITY;
  return { top, bottom, left: Math.min(al, hl), right: Math.max(ar, hr), dollar };
}

/** The block's text on each line, deleted when `del`; lines that end before the block give "". */
function cutBlock(cm: CM, b: Block, toEol: boolean, del: boolean): string {
  const ts = tabSizeOf(cm);
  const pieces: string[] = [];
  for (let l = b.top; l <= b.bottom; l++) {
    const text = cm.getLine(l);
    if (widthOf(text, ts) <= b.left) {
      pieces.push("");
      continue;
    }
    const from = chAtVcol(text, b.left, ts);
    const to =
      toEol || b.dollar ? text.length : Math.min(text.length, chAtVcol(text, b.right, ts) + 1);
    pieces.push(text.slice(from, to));
    if (del) cm.replaceRange("", new CodeMirror.Pos(l, from), new CodeMirror.Pos(l, to));
  }
  return pieces.join("\n");
}

function topLeft(cm: CM, b: Block): Pos {
  const text = cm.getLine(b.top);
  const ch = chAtVcol(text, b.left, tabSizeOf(cm));
  return new CodeMirror.Pos(b.top, Math.max(0, Math.min(ch, text.length - 1)));
}

function startInsert(cm: CM, s: EditorSession, b: Block, kind: Kind, repeat: number) {
  const ts = tabSizeOf(cm);
  let text = cm.getLine(b.top);
  let ch: number;
  if (kind === "I") ch = Math.min(chAtVcol(text, b.left, ts), text.length);
  else if (b.dollar) ch = text.length;
  else if (widthOf(text, ts) <= b.right) {
    const pad = " ".repeat(b.right + 1 - widthOf(text, ts));
    cm.replaceRange(pad, new CodeMirror.Pos(b.top, text.length));
    text = cm.getLine(b.top);
    ch = text.length;
  } else ch = chAtVcol(text, b.right, ts) + 1;
  const head = new CodeMirror.Pos(b.top, ch);
  enter(cm, { head, repeat }, cm.state.vim);
  cm.setCursor(head);
  // The core repeats a counted or dotted block insert on every line itself (vim.js:7096); here only the first line types.
  Vim.getVimGlobalState_().macroModeState.lastInsertModeChanges.visualBlock = 0;
  pending.set(s, { ...b, kind, toTopLeft: true, startCh: ch, firstLen: text.length });
  if (!playing())
    lastBlock.set(s, {
      kind,
      count: repeat,
      height: b.bottom - b.top + 1,
      width: b.right - b.left,
      dollar: b.dollar,
    });
}

/** block_insert(): put `ins` on line l at the block's column, splitting a <Tab> that straddles it. */
function copyTo(cm: CM, l: number, p: Pending, ins: string): void {
  const ts = tabSizeOf(cm);
  const text = cm.getLine(l);
  const width = widthOf(text, ts);
  const at = (ch: number) => new CodeMirror.Pos(l, ch);
  if (p.kind === "A" && p.dollar) {
    cm.replaceRange(ins, at(text.length));
    return;
  }
  const vcol = p.kind === "I" ? p.left : p.right + 1;
  if (width < vcol) {
    if (p.kind === "A") cm.replaceRange(" ".repeat(vcol - width) + ins, at(text.length));
    return;
  }
  const ch = chAtVcol(text, vcol, ts);
  const start = vcolOf(text, ch, ts);
  if (text[ch] === "\t" && start < vcol) {
    const end = start + ts - (start % ts);
    cm.replaceRange(" ".repeat(vcol - start) + ins + " ".repeat(end - vcol), at(ch), at(ch + 1));
    return;
  }
  cm.replaceRange(ins, at(ch));
}

/** How often . types a block insert again: always the original count. */
export function blockDotCount(s: EditorSession): number | undefined {
  return pending.get(s)?.dotCount;
}

/** i_CTRL-O ends the block insert like <Esc>, but j and k afterwards keep the insert's column. */
export function blockInsertCtrlO(s: EditorSession): void {
  const p = pending.get(s);
  if (p) p.viaCtrlO = true;
}

/** On leaving insert mode: copy what the first line gained to the other block lines. */
export function blockInsertModeChange(s: EditorSession, mode: string): void {
  if (mode === "insert" || mode === "replace") return;
  const p = pending.get(s);
  if (p === undefined) return;
  pending.delete(s);
  const { cm } = s;
  // ops.c: nothing is copied once the cursor left the first line; <C-o> ends the insert too, so it copies first.
  if (cm.getCursor().line !== p.top) return;
  const first = cm.getLine(p.top);
  const gained = first.length - p.firstLen;
  if (gained <= 0) return;
  const ins = first.slice(p.startCh, p.startCh + gained);
  for (let l = p.top + 1; l <= p.bottom; l++) copyTo(cm, l, p, ins);
  if (!p.toTopLeft) return;
  const vim = cm.state.vim as (VimSel & { lastMotion: unknown }) | undefined;
  const want = vcolOf(first, cm.getCursor().ch, tabSizeOf(cm));
  cm.setCursor(topLeft(cm, p));
  if (p.viaCtrlO && vim) {
    vim.lastHPos = want;
    vim.lastMotion = moveByLines;
  }
}

export function installBlockInsert(): void {
  // Read the table entry by swapping it out and straight back (the patched define returns what it replaces).
  const mbl = replaceMotion("moveByLines", (_cm, head) => head);
  replaceMotion("moveByLines", mbl);
  moveByLines = mbl;
  const core = replaceAction("enterInsertMode", (cm, args, vim) => core(cm, args, vim));
  enter = core as typeof enter;
  const blockInsert = (kind: Kind) => (cm: CM, args: { repeat?: number }, vim: VimSel) => {
    const s = boundTo(cm)?.session;
    if (s !== undefined && vim.visualMode && vim.visualBlock) {
      startInsert(cm, s, blockOf(cm, vim, s), kind, args.repeat ?? 1);
      return;
    }
    const last = s && lastBlock.get(s);
    if (s !== undefined && !vim.visualMode && playing() && last) {
      // . repeats the block insert with the same size at the cursor.
      const ts = tabSizeOf(cm);
      const cur = cm.getCursor();
      const left = vcolOf(cm.getLine(cur.line), cur.ch, ts);
      const b: Block = {
        top: cur.line,
        bottom: Math.min(cm.lastLine(), cur.line + last.height - 1),
        left,
        right: left + last.width,
        dollar: last.dollar,
      };
      startInsert(cm, s, b, last.kind, last.count);
      const p = pending.get(s);
      if (p) p.dotCount = last.count;
      return;
    }
    if (s !== undefined && vim.visualMode) lastBlock.set(s, null);
    enter(cm, args, vim);
  };
  replaceAction("blockInsertI", blockInsert("I") as never);
  replaceAction("blockInsertA", blockInsert("A") as never);
  Vim.mapCommand("I", "action", "blockInsertI", { insertAt: "startOfSelectedArea" } as never, {
    context: "visual",
    isEdit: true,
  });
  Vim.mapCommand("A", "action", "blockInsertA", { insertAt: "endOfSelectedArea" } as never, {
    context: "visual",
    isEdit: true,
  });

  // c and s on a block: delete it, insert on the first line, copy at <Esc> (op_change).
  const change = (
    cm: CM,
    args: { registerName?: string | null | undefined },
    b: Block,
    s: EditorSession,
    toEol: boolean,
  ) => {
    const text = cutBlock(cm, b, toEol, true);
    Vim.getRegisterController().pushText(args.registerName, "change", text, false, true);
    startInsert(cm, s, { ...b, dollar: b.dollar || toEol }, "I", 1);
    const p = pending.get(s);
    // C leaves every line ending at the block's column; the copy goes there, as for c.
    if (p) pending.set(s, { ...p, dollar: false, toTopLeft: false });
  };

  const coreChange = replaceOperator(
    "changeNoIndent",
    function (this: unknown, cm, args, ranges, anchor, head) {
      const vim = cm.state.vim as VimSel | undefined;
      const s = boundTo(cm)?.session;
      if (vim?.visualBlock && s !== undefined) {
        change(cm, args, blockOf(cm, vim, s), s, false);
        return undefined as unknown as Pos;
      }
      return coreChange.call(this, cm, args, ranges, anchor, head);
    },
  );

  // D, X, Y and C in Visual mode: linewise, except on a block (v_b_D, v_X, v_Y, v_b_C).
  const visualOp = (
    name: string,
    core: "delete" | "yank" | "change",
    onBlock: "D" | "X" | "Y" | "C",
  ) => {
    replaceOperator(name, function (this: unknown, cm, args, ranges, anchor, head) {
      const vim = cm.state.vim as VimSel | undefined;
      const s = boundTo(cm)?.session;
      if (!vim?.visualBlock || s === undefined)
        return (this as Tables)[core](cm, args, ranges, anchor, head) as Pos;
      const b = blockOf(cm, vim, s);
      if (onBlock === "C") {
        change(cm, args, b, s, true);
        return undefined as unknown as Pos;
      }
      const reg = args.registerName;
      const text = cutBlock(cm, b, onBlock === "D", onBlock !== "Y");
      Vim.getRegisterController().pushText(
        reg,
        onBlock === "Y" ? "yank" : "delete",
        text,
        false,
        true,
      );
      return topLeft(cm, b);
    });
    Vim.mapCommand(onBlock, "operator", name, { linewise: true } as never, { context: "visual" });
  };
  visualOp("visualD", "delete", "D");
  visualOp("visualX", "delete", "X");
  visualOp("visualY", "yank", "Y");
  visualOp("visualC", "change", "C");
  // Visual s is a noremap keyToKey to c (vim.js:100), which skips mapped commands.
  Vim.mapCommand("s", "operator", "changeNoIndent", {} as never, { context: "visual" });
}
