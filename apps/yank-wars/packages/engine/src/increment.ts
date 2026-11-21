import { type CodeMirror as CM, CodeMirror, Vim } from "@replit/codemirror-vim";
import { noteFailure } from "./macro.ts";

// <C-a> and <C-x> as vim's do_addsub() with 'nrformats' bin,octal,hex (vim -u NONE).

const TOKEN = /0[xX][0-9a-fA-F]+|0[bB][01]+|\d+/g;

/** Adds n to the first number at or after column from on the line; the new number's last column, or -1. */
function addToLine(cm: CM, line: number, from: number, to: number, n: number): number {
  const text = cm.getLine(line);
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  for (;;) {
    m = TOKEN.exec(text);
    if (!m) return -1;
    if (m.index + m[0].length > from) break;
  }
  if (m.index >= to) return -1;
  let start = m.index;
  const tok = m[0];
  let out: string;
  if (/^0[xX]/.test(tok)) {
    const digits = tok.slice(2);
    let v = (BigInt(`0x${digits}`) + BigInt(n)) % 2n ** 64n;
    if (v < 0n) v += 2n ** 64n;
    // The case of the rightmost letter decides.
    const letters = digits.match(/[a-fA-F]/g);
    const upper = letters !== null && /[A-F]/.test(letters[letters.length - 1] as string);
    let s = v.toString(16).padStart(digits.length, "0");
    if (upper) s = s.toUpperCase();
    out = tok.slice(0, 2) + s;
  } else if (/^0[bB]/.test(tok)) {
    const digits = tok.slice(2);
    let v = (BigInt(`0b${digits}`) + BigInt(n)) % 2n ** 64n;
    if (v < 0n) v += 2n ** 64n;
    out = tok.slice(0, 2) + v.toString(2).padStart(digits.length, "0");
  } else if (tok.length > 1 && tok[0] === "0" && /^[0-7]+$/.test(tok)) {
    let v = (BigInt(`0o${tok}`) + BigInt(n)) % 2n ** 64n;
    if (v < 0n) v += 2n ** 64n;
    out = `0${v.toString(8).padStart(tok.length - 1, "0")}`;
  } else {
    const neg = start > 0 && text[start - 1] === "-";
    if (neg) start--;
    const v = BigInt(tok) * (neg ? -1n : 1n) + BigInt(n);
    out = v.toString();
  }
  const end = m.index + tok.length;
  cm.replaceRange(out, new CodeMirror.Pos(line, start), new CodeMirror.Pos(line, end));
  return start + out.length - 1;
}

export function installIncrement(): void {
  Vim.defineAction("incrementNumberToken", (cm, args, vim) => {
    const sign = (args as { increase?: boolean }).increase ? 1 : -1;
    const count = args.repeat ?? 1;
    if (vim.visualMode) {
      const a = vim.sel.anchor;
      const h = vim.sel.head;
      const top = a.line < h.line || (a.line === h.line && a.ch <= h.ch) ? a : h;
      const bot = top === a ? h : a;
      const progressive = (args as { progressive?: boolean }).progressive;
      let k = 0;
      for (let line = top.line; line <= bot.line; line++) {
        let from = 0;
        let to = Number.POSITIVE_INFINITY;
        if (vim.visualBlock) {
          from = Math.min(a.ch, h.ch);
          to = Math.max(a.ch, h.ch) + 1;
        } else if (!vim.visualLine) {
          if (line === top.line) from = top.ch;
          if (line === bot.line) to = bot.ch + 1;
        }
        const n = progressive ? (k + 1) * count : count;
        if (addToLine(cm, line, from, to, sign * n) >= 0) k++;
      }
      Vim.exitVisualMode(cm as Parameters<typeof Vim.exitVisualMode>[0], false);
      cm.setCursor(new CodeMirror.Pos(top.line, vim.visualLine ? 0 : top.ch));
      return;
    }
    const cur = cm.getCursor();
    const at = addToLine(cm, cur.line, cur.ch, Number.POSITIVE_INFINITY, sign * count);
    if (at < 0) {
      noteFailure();
      return;
    }
    cm.setCursor(new CodeMirror.Pos(cur.line, at));
  });
  for (const [k, increase] of [
    ["<C-a>", true],
    ["<C-x>", false],
  ] as const) {
    Vim.mapCommand(k, "action", "incrementNumberToken", { increase } as never, {
      isEdit: true,
      context: "visual",
    });
    Vim.mapCommand(
      `g${k}`,
      "action",
      "incrementNumberToken",
      { increase, progressive: true } as never,
      { isEdit: true, context: "visual" },
    );
  }
}
