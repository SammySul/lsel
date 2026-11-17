import { EditorView } from "@codemirror/view";

// Fallbacks for the page tokens, so the editor renders right even before app.css defines them.
const tokens = {
  bg: "#0d1117",
  border: "#30363d",
  fg: "#e6edf3",
  muted: "#8b949e",
  bad: "#f85149",
  cursor: "#f2cc60",
} as const;

const token = (name: keyof typeof tokens): string => `var(--${name}, ${tokens[name]})`;

export const ywTheme = EditorView.theme(
  {
    "&": {
      color: token("fg"),
      backgroundColor: token("bg"),
      fontSize: "clamp(12px, 1.6vh, 15px)",
      height: "100%",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      lineHeight: "1.5",
    },
    ".cm-gutters": {
      backgroundColor: token("bg"),
      color: token("muted"),
      border: "none",
      borderRight: `1px solid ${token("border")}`,
    },
    ".cm-activeLine": { backgroundColor: "rgba(230, 237, 243, 0.04)" },
    ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground":
      { background: "rgba(88, 166, 255, 0.28)" },
    ".cm-cursor": { borderLeft: `2px solid ${token("cursor")}` },
    // The adapter's cursor rules are Prec.highest (A:1197-1215): win by specificity, not order.
    "&.cm-editor.cm-focused .cm-fat-cursor": { background: token("cursor") },
    "&.cm-editor:not(.cm-focused) .cm-fat-cursor": { outline: `solid 1px ${token("cursor")}` },
    // Insets and gradients instead of borders, so a tinted line never changes height or indent.
    ".cm-line.yw-diff": {
      backgroundColor: "rgba(248, 81, 73, 0.10)",
      boxShadow: `inset 2px 0 0 ${token("bad")}`,
    },
    ".cm-line.yw-diff-missing": {
      backgroundImage: `repeating-linear-gradient(90deg, ${token("bad")} 0 4px, transparent 4px 8px)`,
      backgroundSize: "100% 1px",
      backgroundPosition: "left top",
      backgroundRepeat: "no-repeat",
    },
    ".cm-line.yw-diff-missing-after": {
      backgroundImage: `repeating-linear-gradient(90deg, ${token("bad")} 0 4px, transparent 4px 8px)`,
      backgroundSize: "100% 1px",
      backgroundPosition: "left bottom",
      backgroundRepeat: "no-repeat",
    },
    ".cm-line.yw-pending": { backgroundColor: "rgba(88, 166, 255, 0.08)" },
    ".cm-vim-panel, .cm-vim-message": { display: "none" },
  },
  { dark: true },
);
