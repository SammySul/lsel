import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// The terminal's colors (lsel's --term-*), assigned as Melange's own syntax theme assigns them.
export const ywHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword], color: "var(--term-3)" },
  { tag: t.moduleKeyword, color: "var(--term-10)" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "var(--term-12)" },
  { tag: [t.number, t.integer, t.float, t.bool, t.null], color: "var(--term-13)" },
  { tag: t.atom, color: "var(--term-5)" },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.tagName],
    color: "var(--term-11)",
  },
  { tag: [t.typeName, t.className], color: "var(--term-6)" },
  { tag: [t.attributeName, t.labelName], color: "var(--term-14)" },
  { tag: t.operator, color: "var(--term-9)" },
  {
    tag: [t.comment, t.lineComment, t.blockComment, t.punctuation, t.bracket],
    color: "var(--subtle)",
  },
  {
    tag: [t.variableName, t.definition(t.variableName), t.propertyName, t.namespace],
    color: "var(--text)",
  },
  { tag: t.invalid, color: "var(--error)" },
]);
