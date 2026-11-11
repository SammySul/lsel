import { deleteCharBackwardStrict, deleteCharForward } from "@codemirror/commands";
import {
  EditorSelection,
  type EditorState,
  type Extension,
  findClusterBreak,
  type SelectionRange,
} from "@codemirror/state";
import { type Command, keymap } from "@codemirror/view";
import { Vim } from "@replit/codemirror-vim";
import type { VimKey } from "./keys.ts";

export const INSERT_LITERALS: Readonly<Record<string, string>> = {
  "<Space>": " ",
  "<Tab>": "\t",
  "<CR>": "\n",
  "<lt>": "<",
};

export function literalOf(key: VimKey): string | undefined {
  return INSERT_LITERALS[key] ?? ([...key].length === 1 ? key : undefined);
}

function moveCursors(to: (r: SelectionRange, state: EditorState) => number): Command {
  return (view) => {
    const { state } = view;
    const ranges = state.selection.ranges.map((r) => EditorSelection.cursor(to(r, state)));
    view.dispatch({
      selection: EditorSelection.create(ranges, state.selection.mainIndex),
      userEvent: "select",
    });
    return true;
  };
}

function vertical(dir: 1 | -1): Command {
  return moveCursors((r, state) => {
    const line = state.doc.lineAt(r.head);
    const n = line.number + dir;
    if (n < 1 || n > state.doc.lines) return r.head;
    const next = state.doc.line(n);
    return next.from + Math.min(r.head - line.from, next.length);
  });
}

// Left/Right stay on the line, like vim's default 'whichwrap' in insert mode.
export const insertCommands: Readonly<
  Record<"Backspace" | "Delete" | "Left" | "Right" | "Up" | "Down" | "Home" | "End", Command>
> = {
  Backspace: deleteCharBackwardStrict,
  Delete: deleteCharForward,
  Left: moveCursors((r, state) => {
    const line = state.doc.lineAt(r.head);
    if (r.head === line.from) return r.head;
    return line.from + findClusterBreak(line.text, r.head - line.from, false);
  }),
  Right: moveCursors((r, state) => {
    const line = state.doc.lineAt(r.head);
    if (r.head === line.to) return r.head;
    return line.from + findClusterBreak(line.text, r.head - line.from, true);
  }),
  Up: vertical(-1),
  Down: vertical(1),
  Home: moveCursors((r, state) => state.doc.lineAt(r.head).from),
  End: moveCursors((r, state) => state.doc.lineAt(r.head).to),
};

// The core replays InsertModeKeys as {key: "Left"}, CM6 keymaps see DOM "ArrowLeft": bind both.
export const insertKeymap: Extension = keymap.of(
  Object.entries(insertCommands).flatMap(([key, run]) =>
    ["Left", "Right", "Up", "Down"].includes(key)
      ? [
          { key, run },
          { key: `Arrow${key}`, run },
        ]
      : [{ key, run }],
  ),
);

type InsertModeKeyInit = Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "metaKey" | "shiftKey">;
// Typed as taking a KeyboardEvent, but the core reads only these five fields (vim.js:786-800).
const InsertModeKey = Vim.InsertModeKey as unknown as new (
  keyName: string,
  e: InsertModeKeyInit,
) => InstanceType<typeof Vim.InsertModeKey>;

export function recordInsertKey(name: "Backspace" | "Delete"): void {
  const ms = Vim.getVimGlobalState_().macroModeState;
  if (ms.isPlaying) return;
  const lc = ms.lastInsertModeChanges;
  if (lc.maybeReset) {
    lc.changes = [];
    lc.maybeReset = false;
  }
  lc.changes.push(
    new InsertModeKey(name, {
      key: name,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      shiftKey: false,
    }),
  );
}
