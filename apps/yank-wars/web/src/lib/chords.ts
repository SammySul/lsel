import { isVimKey, type VimKey } from "@yank-wars/engine";

function chord(notation: string): VimKey {
  if (!isVimKey(notation)) throw new Error(`not a canonical vim key: ${notation}`);
  return notation;
}

export const RESET_KEY = chord("<C-CR>");
export const FORFEIT_KEY = chord("<C-S-CR>");
export const NUMBERS_KEY = chord("<C-S-L>");
export const READY_KEYS: readonly VimKey[] = [chord("<Space>"), chord("<CR>")];

export const CHORD_LABELS = {
  reset: "Ctrl+Enter",
  forfeit: "Ctrl+Shift+Enter",
  numbers: "Ctrl+Shift+L",
} as const;
