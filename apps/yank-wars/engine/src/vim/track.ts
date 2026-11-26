import { type ChangeSet, MapMode } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

const trackers = new WeakMap<EditorView, Set<(changes: ChangeSet) => void>>();

export const changeTracker = EditorView.updateListener.of((u) => {
  const set = trackers.get(u.view);
  if (set === undefined) return;
  for (const tr of u.transactions) if (tr.docChanged) for (const f of set) f(tr.changes);
});

/** Line starts followed through every change; null once the line's first character (or its line break) is deleted. */
export function trackLines(
  view: EditorView,
  starts: readonly number[],
): { positions: (number | null)[]; stop(): void } {
  const positions: (number | null)[] = [...starts];
  const f = (changes: ChangeSet) => {
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      if (p !== null && p !== undefined) positions[i] = changes.mapPos(p, 1, MapMode.TrackDel);
    }
  };
  let set = trackers.get(view);
  if (set === undefined) {
    set = new Set();
    trackers.set(view, set);
  }
  set.add(f);
  return { positions, stop: () => set.delete(f) };
}
