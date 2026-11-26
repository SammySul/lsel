// Relative or absolute line numbers that follow the cursor.

import { GutterMarker, gutter, lineNumbers } from "@codemirror/view";

class NumberMarker extends GutterMarker {
  constructor(readonly n: string) {
    super();
  }
  override eq(other: NumberMarker): boolean {
    return other.n === this.n;
  }
  override toDOM(): Node {
    return document.createTextNode(this.n);
  }
}

export function relativeFormat(cur: number, n: number): string {
  return n === cur ? String(n) : String(Math.abs(n - cur));
}

// lineNumbers({ formatNumber }) only re-renders on doc/viewport/config changes, so it would go stale on cursor moves.
export const relativeGutter = gutter({
  class: "cm-lineNumbers",
  lineMarker(view, line) {
    const doc = view.state.doc;
    const cur = doc.lineAt(view.state.selection.main.head).number;
    return new NumberMarker(relativeFormat(cur, doc.lineAt(line.from).number));
  },
  lineMarkerChange: (u) => u.selectionSet || u.docChanged,
  initialSpacer: () => new NumberMarker("99"),
  renderEmptyElements: false,
});

export const absoluteGutter = lineNumbers();
