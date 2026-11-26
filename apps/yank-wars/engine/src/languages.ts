import { cssLanguage } from "@codemirror/lang-css";
import { goLanguage } from "@codemirror/lang-go";
import {
  javascriptLanguage,
  jsxLanguage,
  tsxLanguage,
  typescriptLanguage,
} from "@codemirror/lang-javascript";
import { jsonLanguage } from "@codemirror/lang-json";
import { pythonLanguage } from "@codemirror/lang-python";
import { rustLanguage } from "@codemirror/lang-rust";
import type { Extension } from "@codemirror/state";
import type { LanguageId } from "./game/puzzle.ts";

// Language.extension only: LanguageSupport.support adds autoCloseTags and keymaps that type text.
const EXTENSIONS: Readonly<Record<LanguageId, Extension>> = {
  text: [],
  javascript: javascriptLanguage.extension,
  typescript: typescriptLanguage.extension,
  jsx: jsxLanguage.extension,
  tsx: tsxLanguage.extension,
  python: pythonLanguage.extension,
  go: goLanguage.extension,
  rust: rustLanguage.extension,
  json: jsonLanguage.extension,
  css: cssLanguage.extension,
};

export function languageExtension(id: LanguageId): Extension {
  return EXTENSIONS[id];
}
