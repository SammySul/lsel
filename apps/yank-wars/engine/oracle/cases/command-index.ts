// Keys from vim's :help index that no other case typed (found by comparing index.txt with the corpus).

import { defineCases, type OracleCase } from "../types.ts";

type Row = [id: string, start: string, keys: string];

const FORTY = Array.from({ length: 40 }, (_, i) => `l${i + 1}`).join("\n");

const rows: readonly Row[] = [
  // normal mode
  ["backtick-paren-close", "One. Two. Three.", "w`)x"],
  ["backtick-paren-open", "One. Two. Three.", "$`(x"],
  ["backtick-para-end", "a\nb\n\nc", "`}x"],
  ["backtick-para-start", "a\n\nb\nc", "G`{x"],
  ["quote-lt", "ab\ncd\nef", "lvj<Esc>G'<lt>x"],
  ["backtick-lt", "abc\ncde\nefg", "lvjl<Esc>G`<lt>x"],
  ["backtick-gt", "abc\ncde\nefg", "lvjl<Esc>gg`>x"],
  ["quote-bracket-close", "a\nb\nc\nd", "yjG']x"],
  ["page-down", FORTY, "<PageDown>x"],
  ["page-up", FORTY, "G<PageUp>x"],
  ["s-down", FORTY, "<S-Down>x"],
  ["s-up", FORTY, "G<S-Up>x"],
  ["c-home", "ab\ncd\nef", "G$<C-Home>x"],
  ["c-end", "ab\ncd\nef", "<C-End>x"],
  ["ctrl-j-normal", "ab\ncd", "l<C-j>x"],
  ["ctrl-l-normal", "abc", "l<C-l>x"],
  ["ctrl-bracket-cancels-operator", "abc", "ld<C-[>x"],
  ["g-minus", "abcd", "xu$xg-"],
  ["g-minus-twice", "abcd", "xu$xg-g-"],
  ["g-minus-g-plus", "abcd", "xu$xg-g-g+"],
  ["g-home", "  abc", "$g<Home>x"],
  ["g-end", "abc", "g<End>x"],
  ["g-up", "ab\ncd", "jlg<Up>x"],
  ["g-down", "ab\ncd", "lg<Down>x"],
  ["ins-normal", "abc", "l<Ins>x<Esc>"],
  // insert mode
  ["i-ctrl-bracket", "abc", "ix<C-[>x"],
  ["i-ctrl-g-j", "abcdef\nabcdef", "lllix<C-g>jy<Esc>"],
  ["i-ctrl-g-k", "abcdef\nabcdef", "jlllix<C-g>ky<Esc>"],
  ["i-ctrl-g-U-undo", "abc", "Ax<C-g>U<Left>y<Esc>u"],
  ["i-ctrl-g-U-dot", "ab\nab", "Ax<C-g>U<Left>y<Esc>j."],
  ["i-caret-ctrl-d", "    ab", "A^<C-d>x<Esc>"],
  ["i-c-home", "a\nb", "jA<C-Home>x<Esc>"],
  ["i-c-end", "a\nb", "i<C-End>x<Esc>"],
  // command line
  ["c-ctrl-bracket", "abc", ":s/a/b/<C-[>x"],
  ["c-esc-in-macro-executes", "a\na", "qq:s/a/b/<Esc>jq@q"],
  ["c-s-up", "a\na", ":s/a/b/<CR>j:<S-Up><CR>"],
  ["c-page-up", "a\na", ":s/a/b/<CR>j:<PageUp><CR>"],
  ["c-ins-overstrike", "a", ":s/a/b/<Left><Left><Ins>c<CR>"],
  ["c-ctrl-j", "a", ":s/a/b/<C-j>"],
  ["c-ctrl-m", "a", ":s/a/b/<C-m>"],
  ["c-s-up-twice", "a\na\na", ":s/a/b/<CR>:s/a/c/<CR>j:<S-Up><S-Up><CR>"],
  ["c-s-up-ignores-prefix", "a\na", ":s/a/b/<CR>:%s/x/y/e<CR>j:s<S-Up><CR>"],
  ["c-s-down", "a\na\na", ":s/a/b/<CR>:s/a/c/<CR>j:<S-Up><S-Up><S-Down><CR>"],
  ["search-s-up", "ab ab ab", "/b<CR>/a<CR>/<S-Up><S-Up><CR>x"],
  ["c-ins-twice", "abc", ":s/a/x/<Left><Left><Ins>y<Ins>z<CR>"],
  ["i-ctrl-g-esc-consumed", "abc", "ix<C-g><Esc>y<Esc>"],
  ["i-ctrl-g-down", "abcdef\nabcdef", "lllix<C-g><Down>y<Esc>"],
  ["i-ctrl-g-ctrl-k", "abcdef\nabcdef", "jlllix<C-g><C-k>y<Esc>"],
  ["i-ctrl-g-j-tab", "\tabc\nabcdefghijk", "A<C-g>jx<Esc>"],
  ["i-ctrl-g-j-last-line", "ab", "ix<C-g>jy<Esc>"],
  ["i-ctrl-g-u-dot", "ab\nab", "Ax<C-g>uy<Esc>j."],
  ["i-ctrl-g-U-right", "abc", "ix<C-g>U<Right>y<Esc>u"],
  ["c-end-count", "ab\ncd\nef", "2<C-End>x"],
  ["d-c-end", "ab\ncd\nef", "ld<C-End>"],
  ["d-c-home", "ab\ncd\nef", "jd<C-Home>"],
  ["g-end-trailing-blank", "abc  ", "g<End>x"],
  ["s-down-insert", "abc", "i<S-Down>x<Esc>"],
  // the ". register (core joined its change list into "[object Object]")
  ["dot-reg-bs", "abc", 'Axy<BS>z<Esc>0".P'],
  ["dot-reg-bs-past-start", "abc", 'A<BS>x<Esc>0".P'],
  ["dot-reg-del", "abc", '0ixy<Del>z<Esc>$".p'],
  ["ctrl-r-dot-after-bs", "ab\ncd", "Axy<BS>z<Esc>jA<C-r>.<Esc>"],
];

export default defineCases(
  rows.map(([id, start, keys]): OracleCase => ({ id: `ci-${id}`, start, keys })),
);
