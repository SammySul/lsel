import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// The terminal's colors (lsel's --term-*), assigned as Rosé Pine's own syntax theme assigns them.
export const ywHighlight = HighlightStyle.define([
  {
    tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword],
    color: "var(--term-2)",
  },
  {
    tag: [t.string, t.special(t.string), t.regexp, t.number, t.integer, t.float],
    color: "var(--term-3)",
  },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.bool, t.null, t.atom],
    color: "var(--term-6)",
  },
  { tag: [t.typeName, t.className, t.namespace, t.tagName], color: "var(--term-4)" },
  { tag: [t.propertyName, t.attributeName, t.labelName], color: "var(--term-5)" },
  {
    tag: [t.comment, t.lineComment, t.blockComment, t.punctuation, t.operator, t.bracket],
    color: "var(--subtle)",
  },
  { tag: [t.variableName, t.definition(t.variableName)], color: "var(--text)" },
  { tag: t.invalid, color: "var(--error)" },
]);
