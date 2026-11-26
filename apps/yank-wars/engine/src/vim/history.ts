// Undo steps that never depend on wall-clock time, so a replay groups them like the live editor.

import { history } from "@codemirror/commands";
import {
  type Annotation,
  EditorState,
  type Extension,
  Transaction,
  type TransactionSpec,
} from "@codemirror/state";

export interface UndoClock {
  group: number;
}

/** Per undo step, where the cursor was before it (vim's uh_cursor), and the step undo or redo last applied. */
interface UndoSteps {
  cursorBefore: Map<number, number>;
  done: number[];
  undone: number[];
}

const steps = new WeakMap<UndoClock, UndoSteps>();

export function undoSteps(clock: UndoClock): UndoSteps {
  let st = steps.get(clock);
  if (st === undefined) {
    st = { cursorBefore: new Map(), done: [], undone: [] };
    steps.set(clock, st);
  }
  return st;
}

// Transaction.annotations exists at runtime (state/dist/index.js:2246) but is stripped from the d.ts.
interface WithAnnotations {
  readonly annotations: readonly Annotation<unknown>[];
}

// Transaction.time here is a logical undo-group id, not a clock.
export function undoHistory(clock: UndoClock): Extension {
  const policy = (tr: Transaction): Transaction | TransactionSpec => {
    const annotations = (tr as unknown as WithAnnotations).annotations;
    if (tr.changes.empty) {
      if (!tr.selection) return tr;
      return {
        selection: tr.selection,
        effects: tr.effects,
        scrollIntoView: tr.scrollIntoView,
        annotations: [...annotations, Transaction.addToHistory.of(false)],
      };
    }
    const st = undoSteps(clock);
    // History transactions skip filters (filter: false in @codemirror/commands), so u and <C-r> move steps themselves.
    if (st.done[st.done.length - 1] !== clock.group) {
      st.done.push(clock.group);
      st.cursorBefore.set(
        clock.group,
        Math.min(...tr.startState.selection.ranges.map((r) => r.from)),
      );
      st.undone.length = 0;
    }
    const keep = annotations.filter(
      (a) => a.type !== Transaction.time && a.type !== Transaction.userEvent,
    );
    return {
      changes: tr.changes,
      selection: tr.selection,
      effects: tr.effects,
      scrollIntoView: tr.scrollIntoView,
      annotations: [
        ...keep,
        Transaction.time.of(clock.group),
        Transaction.userEvent.of("input.type"),
      ],
    };
  };
  return [
    history({ newGroupDelay: 1, joinToEvent: () => true }),
    EditorState.transactionFilter.of(policy),
  ];
}
