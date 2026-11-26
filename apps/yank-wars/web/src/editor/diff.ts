// Highlights the lines where the player's buffer still differs from the target.

import { Chunk } from "@codemirror/merge";
import {
  type EditorState,
  Facet,
  type Range,
  StateEffect,
  StateField,
  Text,
} from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

interface DiffState {
  readonly deco: DecorationSet;
  readonly linesOff: number;
}

interface TargetDiffState {
  readonly player: Text;
  readonly deco: DecorationSet;
}

const diffLine = Decoration.line({ class: "yw-diff" });
const missingLine = Decoration.line({ class: "yw-diff-missing" });
const missingAfterLine = Decoration.line({ class: "yw-diff-missing-after" });
const pendingLine = Decoration.line({ class: "yw-pending" });
const DIFF_CONFIG = { scanLimit: 500 };

const activeDiffField = Facet.define<StateField<DiffState>, StateField<DiffState> | null>({
  combine: (fields) => fields[0] ?? null,
});

export const setPlayerDoc = StateEffect.define<Text>();

const NEWLINE = Text.of(["", ""]);

// Chunk.build widens a change at a doc's end back to the previous line; a shared extra newline prevents that.
function chunks(a: Text, b: Text): readonly Chunk[] {
  return Chunk.build(a.append(NEWLINE), b.append(NEWLINE), DIFF_CONFIG);
}

function playerDiff(doc: Text, target: Text): DiffState {
  const ranges: Range<Decoration>[] = [];
  let linesOff = 0;
  for (const chunk of chunks(doc, target)) {
    if (chunk.fromA === chunk.toA) {
      // Past the end: the missing lines come after the last one.
      if (chunk.fromA > doc.length) ranges.push(missingAfterLine.range(doc.line(doc.lines).from));
      else ranges.push(missingLine.range(doc.lineAt(chunk.fromA).from));
      linesOff++;
      continue;
    }
    const first = doc.lineAt(chunk.fromA).number;
    // endA is already the end of the chunk's last line; endA - 1 would drop a trailing empty line.
    const last = doc.lineAt(Math.min(chunk.endA, doc.length)).number;
    for (let n = first; n <= last; n++) ranges.push(diffLine.range(doc.line(n).from));
    linesOff += last - first + 1;
  }
  return { deco: Decoration.set(ranges, true), linesOff };
}

function pendingDiff(player: Text, target: Text): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const chunk of chunks(player, target)) {
    // Empty in B means extra player lines: nothing in the target to mark.
    if (chunk.fromB === chunk.toB) continue;
    const first = target.lineAt(chunk.fromB).number;
    const last = target.lineAt(Math.min(chunk.endB, target.length)).number;
    for (let n = first; n <= last; n++) ranges.push(pendingLine.range(target.line(n).from));
  }
  return Decoration.set(ranges, true);
}

export function diffField(target: Text): StateField<DiffState> {
  return StateField.define<DiffState>({
    create: (state) => playerDiff(state.doc, target),
    update: (value, tr) => (tr.docChanged ? playerDiff(tr.state.doc, target) : value),
    provide: (f) => [EditorView.decorations.from(f, (v) => v.deco), activeDiffField.of(f)],
  });
}

export function targetDiffField(start: Text): StateField<TargetDiffState> {
  return StateField.define<TargetDiffState>({
    create: (state) => ({ player: start, deco: pendingDiff(start, state.doc) }),
    update(value, tr) {
      let player = value.player;
      for (const e of tr.effects) if (e.is(setPlayerDoc)) player = e.value;
      if (player === value.player && !tr.docChanged) return value;
      return { player, deco: pendingDiff(player, tr.state.doc) };
    },
    provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
  });
}

export function linesOffOf(state: EditorState): number {
  const field = state.facet(activeDiffField);
  return field ? state.field(field).linesOff : 0;
}
