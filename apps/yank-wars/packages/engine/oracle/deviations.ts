import pins from "./deviations.json" with { type: "json" };
import type { Cursor, OracleMode } from "./types.ts";

export interface DeviationGroup {
  /** accepted: a recorded decision; bug: known wrong, not fixed yet */
  kind: "accepted" | "bug";
  reason: string;
  /** where the decision or the bug is recorded */
  link: string;
}

export interface Deviation extends DeviationGroup {
  group: string;
  /** what the engine does today: the suite fails if this changes, so a deviation never changes silently */
  engineDoc: string;
  engineCursor: Cursor;
  engineMode: OracleMode;
}

const DECISIONS = "docs/decisions.md#engine-deviations-from-vim";

/** Why a case may differ from vim; every pinned case in deviations.json names one. */
export const DEVIATION_GROUPS: Readonly<Record<string, DeviationGroup>> = {
  "virtual-window": {
    kind: "accepted",
    reason: "<C-d> <C-u> <C-f> <C-b> and H M L use a fixed 30-line window, not vim's scrolling",
    link: "docs/step1-spec.md#8-known-deviations-and-deferrals",
  },
  "replace-bs": {
    kind: "accepted",
    reason: "replace-mode <BS> and <C-w> move left without restoring the replaced text",
    link: "docs/step1-spec.md#8-known-deviations-and-deferrals",
  },
  "replace-mode": {
    kind: "bug",
    reason: "replace mode after <C-o>, <C-r> or a count goes on as insert mode",
    link: DECISIONS,
  },
  "insert-keys": {
    kind: "accepted",
    reason:
      "insert-mode completion and digraphs (<C-n> <C-p> <C-x> <C-k>) and literal <C-v> are no-ops",
    link: "docs/step1-spec.md#8-known-deviations-and-deferrals",
  },
  "insert-ctrl": {
    kind: "bug",
    reason:
      "insert <C-a> <C-@> <C-g>u <C-r><C-r>, <C-d>/<C-t> rounding and <Up>/<Down> keeping the column are missing",
    link: DECISIONS,
  },
  expression: {
    kind: "accepted",
    reason: "\\= and the expression register only know the small expression subset in expr.ts",
    link: DECISIONS,
  },
  sentence: {
    kind: "bug",
    reason:
      "sentence motions and objects ( ) is as differ from vim's rules for blanks, ) \" ' and line breaks",
    link: DECISIONS,
  },
  percent: {
    kind: "bug",
    reason: "% does not skip brackets in quotes and does not match /* */ or #if",
    link: DECISIONS,
  },
  "visual-block": {
    kind: "bug",
    reason: "visual-block p and P, r repeated by ., gv after a block, and a count on a blockwise P",
    link: DECISIONS,
  },
  curswant: {
    kind: "bug",
    reason: "$ followed by v, V or <C-v> loses the end-of-line column, so j and k keep the column",
    link: DECISIONS,
  },
  registers: {
    kind: "bug",
    reason:
      'numbered and appended registers: "1 shifting for d% d/ "xdd, "1p. stepping, "A appends, a count before "x',
    link: DECISIONS,
  },
  marks: {
    kind: "bug",
    reason:
      "marks move with column edits and survive deleted lines; `[ `] `^ `. and the jump list differ",
    link: DECISIONS,
  },
  "line-undo": { kind: "bug", reason: "U (line undo) is not implemented", link: DECISIONS },
  "undo-tree": {
    kind: "bug",
    reason: "g- and g+ do not walk undo states in time order (no undo tree)",
    link: DECISIONS,
  },
  "gi-gv": {
    kind: "bug",
    reason: "gi and gv do not restore vim's last insert or selection",
    link: DECISIONS,
  },
  "forced-motion": {
    kind: "bug",
    reason: "o_v and o_V (dvj, dVl) are not implemented",
    link: DECISIONS,
  },
  "text-objects": {
    kind: "bug",
    reason:
      "word and paragraph objects on blank lines and with counts past the end; brackets inside quotes",
    link: DECISIONS,
  },
  visual: {
    kind: "bug",
    reason:
      "visual mode: . after a multi-line visual operator, A in v/V, p/P over a selection, a count before V",
    link: DECISIONS,
  },
  "dot-repeat": {
    kind: "bug",
    reason:
      "a count on . does not replace the count of r or <C-a>; . after a counted o; . of an insert with <C-u> or <C-r>",
    link: DECISIONS,
  },
  macro: {
    kind: "bug",
    reason:
      '@ of a linewise register does not run its line break; dq does not end a recording; "B appends while recording; <Esc> on a command line @ replays cancels it instead of running it',
    link: DECISIONS,
  },

  cursor: {
    kind: "bug",
    reason: "the buffer matches vim, the cursor ends elsewhere",
    link: DECISIONS,
  },
  other: {
    kind: "bug",
    reason: "a single-case difference listed with its repro in docs/decisions.md",
    link: DECISIONS,
  },
};

interface Pin {
  group: string;
  engineDoc: string;
  engineCursor: Cursor;
  engineMode: OracleMode;
}

/** Case id -> how the engine knowingly differs from vim on it; written by `bun packages/engine/oracle/pin.ts`. */
export const DEVIATIONS: Readonly<Record<string, Deviation>> = Object.fromEntries(
  Object.entries(pins as Record<string, Pin>).map(([id, p]) => {
    const g = DEVIATION_GROUPS[p.group];
    if (g === undefined) throw new Error(`deviations.json: ${id} names no group ${p.group}`);
    return [id, { ...g, ...p }];
  }),
);
