// Edges of visual-block I, A, c, C, D, X and Y (ops.c op_insert, block_insert, op_change), plus v/V regressions.

import { defineCases, type OracleCase, type OracleSettings } from "../types.ts";

type Extra = { settings?: Partial<OracleSettings>; note?: string };
const k = (id: string, start: string, keys: string, extra: Extra = {}): OracleCase => ({
  id: `block-${id}`,
  start,
  keys,
  ...extra,
});

const TAB4 = { settings: { tabSize: 4, indentUnit: "\t" } } as const;

export default defineCases([
  k("I-ctrl-c", "ab\ncd", "<C-v>jIx<C-c>"),
  k("A-ctrl-c", "ab\ncd", "<C-v>jAx<C-c>"),
  k("I-undo", "abc\ndef\nghi", "<C-v>jjIxy<Esc>u"),
  k("I-undo-redo", "abc\ndef\nghi", "<C-v>jjIxy<Esc>u<C-r>"),
  k("I-tab-split", "abcdef\n\tx", "ll<C-v>jIZ<Esc>", TAB4),
  k("A-tab-split", "abcdef\n\tx", "l<C-v>jAZ<Esc>", TAB4),
  k("I-ctrl-o", "abc\nabc", "<C-v>jIx<C-o>ly<Esc>"),
  k("I-down-off-line", "abc\nabc", "<C-v>jIx<Down>y<Esc>"),
  k("I-right-same-line", "abc\nabc", "<C-v>jIx<Right>y<Esc>"),
  k("I-bs-then-type", "abc\nabc", "l<C-v>jIxy<BS>z<Esc>"),
  k("I-esc-no-text", "ab\ncd", "l<C-v>jI<Esc>"),
  k("dollar-before-ctrl-v", "abc\na\nabcde", "$<C-v>jjAx<Esc>"),
  k("dollar-then-j", "ab\nabcd", "<C-v>$jAx<Esc>"),
  k("c-register", "abcd\nefgh", 'l<C-v>jlcX<Esc>Go<C-r>"<Esc>'),
  k("D-register", "abcd\nefgh", 'l<C-v>jDGo<C-r>"<Esc>'),
  k("Y-register", "abcd\nefgh", 'l<C-v>jlYGo<C-r>"<Esc>'),
  k("I-macro", "abc\nabc\nabc\nabc", "qq<C-v>jI-<Esc>jjq@q"),
  k("I-count-dot", "ab\nab\nab\nab", "<C-v>j2Ix<Esc>jj."),
  k("I-dot-past-end", "abc\nabc\nabc", "<C-v>jIx<Esc>G."),
  k("I-undo-then-dot", "abc\nabc\nabc\nabc", "<C-v>jIx<Esc>ujj."),
  k("I-empty-line-col0", "ab\n\ncd", "<C-v>jjIx<Esc>"),
  k("A-empty-line", "ab\n\ncd", "<C-v>jjAx<Esc>"),
  k("C-short-line", "abcd\na\nabcd", "ll<C-v>jjCX<Esc>"),
  k("D-short-line", "abcd\na\nabcd", "ll<C-v>jjD"),
  k("c-dot-count-lines", "abcd\nabcd\nabcd\nabcd", "l<C-v>jlcZ<Esc>jj."),
  k("A-wide-block-short-middle", "abcdef\nab\nabcdef", "l<C-v>jjllAx<Esc>"),
  k("I-dot-count-ignored", "abc\nabc\nabc\nabc", "<C-v>jIx<Esc>jj3."),
  k("I-counted-dot-count", "abc\nabc\nabc\nabc", "<C-v>j2Ix<Esc>jj3."),
  k("A-dot-count-ignored", "abc\nabc\nabc\nabc", "<C-v>jAx<Esc>jj3."),
  k("c-dot-count", "abcd\nabcd\nabcd\nabcd", "l<C-v>jlcZ<Esc>jj3."),
  k("A-after-d-dollar", "- item one\n  - item two", "d$<C-v>Ax<Esc>", { settings: { tabSize: 8 } }),
  k("I-ctrl-o-j-keeps-column", "abcdef\nabcdef\nabcdef", "<C-v>jIxyz<C-o>jQ<Esc>"),
  k("V-X-linewise", "ab\ncd\nef", "VjX"),
  k("V-Y-linewise", "ab\ncd", "VYjp"),
  k("v-D-linewise", "abc\ndef\nghi", "lvjD"),
  k("V-C-linewise", "ab\ncd\nef", "VjCx<Esc>"),
  k("v-s-charwise", "abcd", "lvls_<Esc>"),
]);
