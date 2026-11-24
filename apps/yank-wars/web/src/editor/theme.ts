import { EditorView } from "@codemirror/view";

export const ywTheme = EditorView.theme(
  {
    "&": {
      color: "var(--text)",
      backgroundColor: "var(--base)",
      fontSize: "clamp(12px, 1.6vh, 15px)",
      height: "100%",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      fontFamily: "var(--font-mono)",
      lineHeight: "var(--leading)",
    },
    ".cm-gutters": {
      backgroundColor: "var(--base)",
      color: "var(--subtle)",
      border: "none",
      borderRight: "var(--border)",
    },
    ".cm-activeLine": { backgroundColor: "var(--raise)" },
    ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground":
      { background: "var(--highlight)" },
    ".cm-cursor": { borderLeft: "2px solid var(--select)" },
    // The adapter's cursor rules are Prec.highest (A:1197-1215): win by specificity, not order.
    "&.cm-editor.cm-focused .cm-fat-cursor": { background: "var(--select)" },
    "&.cm-editor:not(.cm-focused) .cm-fat-cursor": { outline: "solid 1px var(--select)" },
    // Insets and gradients instead of borders, so a tinted line never changes height or indent.
    ".cm-line.yw-diff": {
      backgroundColor: "color-mix(in srgb, var(--error) 12%, var(--base))",
      boxShadow: "inset 2px 0 0 var(--error)",
    },
    ".cm-line.yw-diff-missing": {
      backgroundImage: "repeating-linear-gradient(90deg, var(--error) 0 4px, transparent 4px 8px)",
      backgroundSize: "100% 1px",
      backgroundPosition: "left top",
      backgroundRepeat: "no-repeat",
    },
    ".cm-line.yw-diff-missing-after": {
      backgroundImage: "repeating-linear-gradient(90deg, var(--error) 0 4px, transparent 4px 8px)",
      backgroundSize: "100% 1px",
      backgroundPosition: "left bottom",
      backgroundRepeat: "no-repeat",
    },
    ".cm-line.yw-pending": { backgroundColor: "color-mix(in srgb, var(--accent) 8%, var(--base))" },
    ".cm-vim-panel, .cm-vim-message": { display: "none" },
  },
  { dark: true },
);
