import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// The terminal's colors (lsel's --term-*), assigned as Modus's own syntax theme assigns them
// (modus-themes.nvim, untinted). Where Modus picks a shade the 16 slots lack, the nearest slot stands in.
export const ywHighlight = HighlightStyle.define([
  // keyword: magenta-cooler
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword], color: "var(--term-13)" },
  // preproc (imports, modules, attributes): red-cooler, nearest red
  { tag: [t.moduleKeyword, t.namespace, t.attributeName], color: "var(--term-1)" },
  // string: blue-warmer
  { tag: [t.string, t.special(t.string), t.regexp], color: "var(--term-12)" },
  // boolean: blue, bold; constants: blue-cooler, nearest blue
  { tag: t.bool, color: "var(--term-4)", fontWeight: "bold" },
  { tag: [t.null, t.atom], color: "var(--term-4)" },
  // function: magenta
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--term-5)" },
  // type: cyan-cooler
  { tag: [t.typeName, t.className], color: "var(--term-14)" },
  // identifier, label, tag: cyan
  { tag: [t.propertyName, t.labelName, t.tagName], color: "var(--term-6)" },
  // comment: fg-dim
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--subtle)" },
  // numbers, operators, delimiters and variables: fg-main (variables are slate, which no slot has)
  {
    tag: [
      t.number,
      t.integer,
      t.float,
      t.operator,
      t.punctuation,
      t.bracket,
      t.variableName,
      t.definition(t.variableName),
    ],
    color: "var(--text)",
  },
  { tag: t.invalid, color: "var(--error)" },
]);
