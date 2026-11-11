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
