import { isVimKey, type VimKey } from "./keys.ts";

export type Platform = "mac" | "other";

export interface KeyEventLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  isComposing: boolean;
}

const IGNORED = new Set([
  "Shift",
  "Control",
  "Alt",
  "AltGraph",
  "Meta",
  "OS",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "ContextMenu",
  "Dead",
  "Unidentified",
  "Process",
  "Fn",
  "FnLock",
  "Hyper",
  "Super",
  "Symbol",
  "SymbolLock",
]);

const NAMED: Readonly<Record<string, string>> = {
  Enter: "CR",
  Backspace: "BS",
  Delete: "Del",
  Escape: "Esc",
  Insert: "Ins",
  Tab: "Tab",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  ArrowUp: "Up",
  ArrowDown: "Down",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  " ": "Space",
};

// Shift alone on these is the base key, as in terminal vim; <S-Left> and friends keep it.
const SHIFT_IS_BASE = new Set(["Space", "CR", "BS", "Tab", "Del", "Esc", "Ins"]);

export function keyFromEvent(e: KeyEventLike, platform: Platform): VimKey | undefined {
  if (e.isComposing || e.metaKey) return undefined;
  if (IGNORED.has(e.key) || /^F\d{1,2}$/.test(e.key)) return undefined;
  const named = Object.hasOwn(NAMED, e.key) ? NAMED[e.key] : undefined;
  if (named === undefined && [...e.key].length !== 1) return undefined;
  const printable = named === undefined;
  const key = named ?? e.key;

  let ctrl = e.ctrlKey;
  let alt = e.altKey;
  if (printable && ctrl && alt) ctrl = alt = false;
  if (printable && alt && !ctrl && platform === "mac") alt = false;
  let prefix = (ctrl ? "C-" : "") + (alt ? "A-" : "");
  const shiftIsBase = prefix === "" && SHIFT_IS_BASE.has(key);
  if ((prefix !== "" || !printable) && e.shiftKey && !shiftIsBase) prefix += "S-";

  const out = printable && prefix === "" ? (key === "<" ? "<lt>" : key) : `<${prefix}${key}>`;
  // Ctrl+< / Ctrl+> and control characters have no key notation; dropping them keeps the log valid.
  return isVimKey(out) ? out : undefined;
}

export function detectPlatform(nav: { platform: string } | undefined): Platform {
  return nav !== undefined && /Mac|iPhone|iPad/.test(nav.platform) ? "mac" : "other";
}
