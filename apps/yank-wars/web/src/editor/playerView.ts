// The player's editor: the engine's session plus visuals, wired to the keyboard.

import { syntaxHighlighting } from "@codemirror/language";
import { Compartment, Text } from "@codemirror/state";
import { drawSelection, EditorView, highlightActiveLine } from "@codemirror/view";
import {
  type BrowserInputOptions,
  browserInput,
  createSession,
  destroySession,
  type EditorSession,
  type KeyResult,
  type Puzzle,
  type VimKey,
} from "@yank-wars/engine";
import { diffField } from "./diff.ts";
import { absoluteGutter, relativeGutter } from "./gutter.ts";
import { ywHighlight } from "./highlight.ts";
import { ywTheme } from "./theme.ts";

export interface PlayerViewOptions extends Omit<BrowserInputOptions, "onKey"> {
  parent: HTMLElement;
  puzzle: Puzzle;
  relativeNumbers: boolean;
  onKey(key: VimKey, result: KeyResult): void;
  onDoc(doc: Text): void;
}

export interface PlayerView {
  readonly session: EditorSession;
  setRelativeNumbers(on: boolean): void;
  focus(): void;
  destroy(): void;
}

export function createPlayerView(opts: PlayerViewOptions): PlayerView {
  let created: EditorSession | null = null;
  const current = (): EditorSession => {
    if (created === null) throw new Error("player session used before createSession returned");
    return created;
  };
  const numbers = new Compartment();
  const gutterFor = (on: boolean) => (on ? relativeGutter : absoluteGutter);
  // Visuals, blockers and listeners only: everything that edits text comes from engineExtensions.
  const session = createSession(opts.puzzle, {
    parent: opts.parent,
    extraExtensions: [
      browserInput(current, opts),
      ywTheme,
      syntaxHighlighting(ywHighlight),
      drawSelection(),
      highlightActiveLine(),
      numbers.of(gutterFor(opts.relativeNumbers)),
      diffField(Text.of(opts.puzzle.target.split("\n"))),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) opts.onDoc(u.state.doc);
      }),
    ],
  });
  created = session;
  return {
    session,
    setRelativeNumbers: (on) =>
      session.view.dispatch({ effects: numbers.reconfigure(gutterFor(on)) }),
    focus: () => session.view.focus(),
    destroy: () => destroySession(session),
  };
}
