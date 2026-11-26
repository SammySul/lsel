// Motions where the core differs from vim, and keys it lacks (:help linewise, 'whichwrap', N%, g_, gm, gM, go, :help index).

import { CodeMirror, type Pos, Vim } from "@replit/codemirror-vim";
import { firstNonBlank, replaceMotion } from "./lines.ts";

// No context: a "normal" entry does not match once an operator is pending (vim.js commandMatches).
const KEYS: readonly (readonly [string, string, object | undefined])[] = [
  // + - _ and <CR> are linewise; <CR> is a motion, not the core's j^ mapping, so d<CR> works.
  ["+", "moveByLines", { forward: true, toFirstChar: true, linewise: true }],
  ["-", "moveByLines", { forward: false, toFirstChar: true, linewise: true }],
  ["_", "moveByLines", { forward: true, toFirstChar: true, repeatOffset: -1, linewise: true }],
  ["<CR>", "moveByLines", { forward: true, toFirstChar: true, linewise: true }],
  ["<C-m>", "moveByLines", { forward: true, toFirstChar: true, linewise: true }],
  ["<C-j>", "moveByLines", { forward: true, linewise: true }],
  ["<C-n>", "moveByLines", { forward: true, linewise: true }],
  ["<C-p>", "moveByLines", { forward: false, linewise: true }],
  // gj/gk without wrapping are j/k, linewise under an operator too.
  ["gj", "moveByDisplayLines", { forward: true, linewise: true }],
  ["gk", "moveByDisplayLines", { forward: false, linewise: true }],
  ["<S-Right>", "moveByWords", { forward: true, wordEnd: false }],
  ["<C-Right>", "moveByWords", { forward: true, wordEnd: false, bigWord: true }],
  ["<S-Left>", "moveByWords", { forward: false, wordEnd: false }],
  ["<C-Left>", "moveByWords", { forward: false, wordEnd: false, bigWord: true }],
  ["<Space>", "moveRightWrap", {}],
  ["<BS>", "moveLeftWrap", {}],
  ["<C-h>", "moveLeftWrap", {}],
  ["%", "moveToMatchedSymbol", { inclusive: true, toJumplist: true, explicitRepeat: true }],
  ["g_", "moveToLastNonBlank", { inclusive: true }],
  ["g$", "moveToEol", { inclusive: true }],
  ["gm", "moveToScreenMiddle", {}],
  ["gM", "moveToTextPercent", { explicitRepeat: true }],
  ["go", "moveToByte", { explicitRepeat: true, toJumplist: true }],
  // <C-Home> is gg; <C-End> the last character of line [count] or the last line.
  [
    "<C-Home>",
    "moveToLineOrEdgeOfDocument",
    { forward: false, explicitRepeat: true, linewise: true, toJumplist: true },
  ],
  [
    "<C-End>",
    "moveToLastCharOfDocument",
    { inclusive: true, explicitRepeat: true, toJumplist: true },
  ],
  ["g<Home>", "moveToStartOfLine", undefined],
  ["g<End>", "moveToLastNonBlank", { inclusive: true }],
];

const fails = null as unknown as Pos;
const explicitCount = (args: object) => !!(args as { repeatIsExplicit?: boolean }).repeatIsExplicit;

export function installMotions(): void {
  // <Space> and <BS> wrap across lines ('whichwrap' b,s).
  // evalInput clears vim.inputState before the motion runs; the old one comes as the fifth argument.
  Vim.defineMotion("moveRightWrap", (cm, head, args, _vim, is) => {
    let pos = head;
    const op = !!is?.operator;
    for (let i = 0; i < (args.repeat ?? 1); i++) {
      const len = cm.getLine(pos.line).length;
      const last = op ? len : len - 1;
      if (pos.ch < last) pos = new CodeMirror.Pos(pos.line, pos.ch + 1);
      else if (pos.line < cm.lastLine()) pos = new CodeMirror.Pos(pos.line + 1, 0);
      else if (i === 0 && !(op && pos.ch < len)) return fails;
    }
    return pos;
  });
  Vim.defineMotion("moveLeftWrap", (cm, head, args, _vim, is) => {
    let pos = head;
    const op = !!is?.operator;
    for (let i = 0; i < (args.repeat ?? 1); i++) {
      if (pos.ch > 0) pos = new CodeMirror.Pos(pos.line, pos.ch - 1);
      else if (pos.line > 0) {
        const len = cm.getLine(pos.line - 1).length;
        pos = new CodeMirror.Pos(pos.line - 1, op ? len : Math.max(0, len - 1));
      } else if (i === 0) return fails;
    }
    return pos;
  });

  // N% is the line N percent into the buffer.
  const coreMatch = replaceMotion(
    "moveToMatchedSymbol",
    function (this: unknown, cm, head, args, vim, is) {
      if (!explicitCount(args)) return coreMatch.call(this, cm, head, args, vim, is);
      if ((args.repeat ?? 0) > 100) return fails;
      const line = Math.floor(((args.repeat ?? 0) * (cm.lastLine() + 1) + 99) / 100) - 1;
      args.linewise = true;
      return new CodeMirror.Pos(line, firstNonBlank(cm.getLine(line)));
    },
  );

  // g_ is the last non-blank, count lines down.
  Vim.defineMotion("moveToLastNonBlank", (cm, head, args) => {
    const line = head.line + (args.repeat ?? 1) - 1;
    if (line > cm.lastLine()) return fails;
    const m = /[^ \t][ \t]*$/.exec(cm.getLine(line));
    return new CodeMirror.Pos(line, m ? m.index : 0);
  });
  Vim.defineMotion("moveToScreenMiddle", (cm, head) => {
    const len = cm.getLine(head.line).length;
    return new CodeMirror.Pos(head.line, Math.max(0, Math.min(100, len - 1)));
  });
  Vim.defineMotion("moveToTextPercent", (cm, head, args) => {
    const len = cm.getLine(head.line).length;
    const pct = explicitCount(args) ? (args.repeat ?? 50) : 50;
    return new CodeMirror.Pos(
      head.line,
      Math.max(0, Math.min(len - 1, Math.floor((len * pct) / 100))),
    );
  });
  Vim.defineMotion("moveToByte", (cm, _head, args) => {
    const n = explicitCount(args) ? (args.repeat ?? 1) : 1;
    return cm.posFromIndex(Math.max(0, Math.min(n - 1, cm.getValue().length - 1)));
  });
  Vim.defineMotion("moveToLastCharOfDocument", (cm, _head, args) => {
    const line = Math.min(
      cm.lastLine(),
      explicitCount(args) ? (args.repeat ?? 1) - 1 : cm.lastLine(),
    );
    return new CodeMirror.Pos(line, Math.max(0, cm.getLine(line).length - 1));
  });

  for (const [keys, motion, args] of KEYS)
    Vim.mapCommand(keys, "motion", motion, args as never, {});
  // <S-Up> and <S-Down> page.
  Vim.mapCommand("<S-Up>", "keyToKey", "", {} as never, { toKeys: "<C-b>" });
  Vim.mapCommand("<S-Down>", "keyToKey", "", {} as never, { toKeys: "<C-f>" });
}
