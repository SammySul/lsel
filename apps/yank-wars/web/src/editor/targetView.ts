// The read-only target editor.

import { syntaxHighlighting } from "@codemirror/language";
import { EditorState, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { languageExtension, type Puzzle } from "@yank-wars/engine";
import { setPlayerDoc, targetDiffField } from "./diff.ts";
import { absoluteGutter } from "./gutter.ts";
import { ywHighlight } from "./highlight.ts";
import { ywTheme } from "./theme.ts";

export interface TargetView {
  setPlayerDoc(doc: Text): void;
  destroy(): void;
}

export function createTargetView(parent: HTMLElement, puzzle: Puzzle): TargetView {
  const view = new EditorView({
    state: EditorState.create({
      doc: puzzle.target,
      extensions: [
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        EditorView.domEventHandlers({ mousedown: () => true, contextmenu: () => true }),
        EditorView.theme({ ".cm-content": { userSelect: "none", cursor: "default" } }),
        languageExtension(puzzle.language),
        ywTheme,
        syntaxHighlighting(ywHighlight),
        absoluteGutter,
        targetDiffField(Text.of(puzzle.start.split("\n"))),
      ],
    }),
    parent,
  });
  return {
    setPlayerDoc: (doc) => view.dispatch({ effects: setPlayerDoc.of(doc) }),
    destroy: () => view.destroy(),
  };
}
