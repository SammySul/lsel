// u and <C-r> put the cursor where vim's u_undoredo() does: back where the change began when that is in the changed lines.

import { type CodeMirror as CM, CodeMirror, type Pos } from "@replit/codemirror-vim";
import { undoSteps } from "./history.ts";
import { firstNonBlank, replaceAction } from "./lines.ts";
import { boundTo } from "./registry.ts";

/** The first line that differs and how many lines after it the change spans in `after`. */
function changedLines(before: string[], after: string[]): { first: number; size: number } {
  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p++;
  let q = 0;
  while (
    q < before.length - p &&
    q < after.length - p &&
    before[before.length - 1 - q] === after[after.length - 1 - q]
  )
    q++;
  return { first: p, size: after.length - p - q };
}

const undoRedo = (redo: boolean) => (cm: CM, args: { repeat?: number }) => {
  const b = boundTo(cm);
  if (b === undefined) return;
  const st = undoSteps(b.session.clock);
  let target: Pos | undefined;
  for (let i = 0; i < (args.repeat ?? 1); i++) {
    const was = cm.getValue();
    (redo ? CodeMirror.commands.redo : CodeMirror.commands.undo)(cm);
    if (cm.getValue() === was) break;
    const step = redo ? st.undone.pop() : st.done.pop();
    if (step !== undefined) (redo ? st.done : st.undone).push(step);
    const { first, size } = changedLines(was.split("\n"), cm.getValue().split("\n"));
    const top = first - 1;
    const savedAt = step === undefined ? undefined : st.cursorBefore.get(step);
    const saved =
      savedAt === undefined ? undefined : cm.posFromIndex(Math.min(savedAt, cm.getValue().length));
    let line =
      saved && saved.line >= top && saved.line <= top + size + 1
        ? saved.line
        : Math.min(first, cm.lastLine());
    if (saved && saved.line + 1 === line && line > 0) line--;
    line = Math.min(line, cm.lastLine());
    const len = cm.getLine(line).length;
    target =
      saved && saved.line === line
        ? new CodeMirror.Pos(line, Math.min(saved.ch, Math.max(0, len - 1)))
        : new CodeMirror.Pos(line, firstNonBlank(cm.getLine(line)));
  }
  if (target) cm.setCursor(target);
};

export function installUndo(): void {
  replaceAction("undo", undoRedo(false));
  replaceAction("redo", undoRedo(true));
}
