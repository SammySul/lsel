// Syntax colors from lsel's base16 palette.

import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// lsel's base16 slots (--base08 …), assigned as mini.base16 assigns them, so code reads as it does in nvim.
export const ywHighlight = HighlightStyle.define([
  // Keyword, Conditional
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword], color: "var(--base0E)" },
  // Include
  { tag: t.moduleKeyword, color: "var(--base0D)" },
  // Identifier, Macro (@property, @module, @attribute)
  { tag: [t.propertyName, t.namespace, t.attributeName], color: "var(--base08)" },
  // String; a regexp is Special
  { tag: [t.string, t.special(t.string)], color: "var(--base0B)" },
  { tag: t.regexp, color: "var(--base0C)" },
  // Boolean, Constant, Number, Float
  { tag: [t.bool, t.null, t.atom, t.number, t.integer, t.float], color: "var(--base09)" },
  // Function
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--base0D)" },
  // Type, Label, Tag
  { tag: [t.typeName, t.className, t.labelName, t.tagName], color: "var(--base0A)" },
  // Comment
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--base03)" },
  // Delimiter
  { tag: [t.punctuation, t.bracket], color: "var(--base0F)" },
  // @variable, Operator
  { tag: [t.variableName, t.definition(t.variableName), t.operator], color: "var(--base05)" },
  { tag: t.invalid, color: "var(--error)" },
]);
