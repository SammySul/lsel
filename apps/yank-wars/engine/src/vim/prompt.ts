// The : and / prompt: typing, history, <C-r>, <C-v> and <C-w>, the same in the browser and in replay.

import { Vim } from "@replit/codemirror-vim";
import { keyToDomKey, type SyntheticKeyInit, type VimKey } from "../input/keys.ts";
import type { EditorSession } from "../session.ts";
import { literalOf } from "./insertKeys.ts";
import { takeSearchLine } from "./search.ts";

type PromptHandler = (
  e: SyntheticPromptEvent,
  value: string,
  close: (v?: string) => void,
) => unknown;

interface SyntheticPromptEvent extends SyntheticKeyInit {
  target: { value: string; selectionStart: number; selectionEnd: number };
  preventDefault(): void;
  stopPropagation(): void;
}

export interface PromptState {
  readonly prefix: string;
  value: string;
  /** the command-line cursor, in UTF-16 units of value */
  cursor: number;
  /** after <C-r> or <C-v>, the key that inserts the next one */
  pending: "<C-r>" | "<C-v>" | null;
  /** c_<Insert>: typed characters replace the ones under the cursor */
  overstrike?: boolean;
  readonly callback: ((v: string) => void) | undefined;
  readonly onKeyDown: PromptHandler | undefined;
  readonly onKeyUp: PromptHandler | undefined;
  closed: boolean;
}

interface DialogOptions {
  value?: string;
  onKeyDown?: PromptHandler;
  onKeyUp?: PromptHandler;
}

const closers = new WeakMap<PromptState, (v?: string) => void>();

export function installPrompt(s: EditorSession): void {
  s.cm.openDialog = (template, callback, options?: DialogOptions) => {
    // The core's "recording @q" banner (vim.js:686-690) has no key handlers; the engine records macros itself.
    if (!options?.onKeyDown && !options?.onKeyUp) return () => {};
    s.message = null;
    const p: PromptState = {
      prefix: template.querySelector("span")?.firstChild?.textContent ?? template.textContent ?? "",
      value: options.value ?? "",
      cursor: (options.value ?? "").length,
      pending: null,
      callback: callback as PromptState["callback"],
      onKeyDown: options.onKeyDown,
      onKeyUp: options.onKeyUp,
      closed: false,
    };
    s.prompt = p;
    const close = (newVal?: string) => {
      if (typeof newVal === "string") {
        p.value = newVal;
        p.cursor = newVal.length;
        return;
      }
      if (p.closed) return;
      p.closed = true;
      // The :s///c confirm prompt may already have replaced this one.
      if (s.prompt === p) s.prompt = null;
    };
    closers.set(p, close);
    return close;
  };
  s.cm.openNotification = (template, options) => {
    const m = { text: template.textContent ?? "", long: options?.duration === 0 };
    s.message = m;
    // showConfirm keeps this for `long` messages and multiSelectHandleKey calls it (vim.js:5307, 7099-7106).
    return () => {
      if (s.message === m) s.message = null;
    };
  };
}

// vim's default 'iskeyword', for <C-w> and <C-r><C-w>.
const isWordChar = (c: string) => /[A-Za-z0-9_\u00C0-\u00FF]/.test(c);

function insert(p: PromptState, text: string): void {
  const rest = p.overstrike
    ? [...p.value.slice(p.cursor)].slice([...text].length).join("")
    : p.value.slice(p.cursor);
  p.value = p.value.slice(0, p.cursor) + text + rest;
  p.cursor += text.length;
}

// c_<S-Up> c_<PageUp>: older (or newer) history without the prefix match <Up> does.
function recallUnfiltered(p: PromptState, up: boolean): void {
  const gs = Vim.getVimGlobalState_() as unknown as Record<string, HistoryLike | undefined>;
  const h = p.prefix === ":" ? gs.exCommandHistoryController : gs.searchHistoryController;
  if (h === undefined) return;
  const was = h.initialPrefix;
  h.initialPrefix = "";
  const v = h.nextMatch(p.value, up);
  h.initialPrefix = was ?? p.value;
  if (v !== undefined) {
    p.value = v;
    p.cursor = v.length;
  }
}

interface HistoryLike {
  initialPrefix: string | null;
  nextMatch(input: string, up: boolean): string | undefined;
}

function wordUnderCursor(s: EditorSession): string {
  const cur = s.cm.getCursor();
  const line = s.cm.getLine(cur.line);
  let i = cur.ch;
  while (i < line.length && !isWordChar(line[i] as string)) i++;
  let a = i;
  let b = i;
  while (a > 0 && isWordChar(line[a - 1] as string)) a--;
  while (b < line.length && isWordChar(line[b] as string)) b++;
  return line.slice(a, b);
}

// c_CTRL-V: the next key literally, as its character.
const LITERAL: Readonly<Record<string, string>> = {
  "<CR>": "\r",
  "<Esc>": "\u001b",
  "<Tab>": "\t",
  "<BS>": "\b",
};

function ctrlChar(key: VimKey): string | undefined {
  const m = /^<C-(.)>$/.exec(key);
  if (!m) return undefined;
  const code = (m[1] as string).toUpperCase().charCodeAt(0);
  return code >= 64 && code < 96 ? String.fromCharCode(code - 64) : undefined;
}

// The register or word <C-r> inserts; undefined for keys that insert nothing.
function registerText(s: EditorSession, key: VimKey): string | undefined {
  if (key === "<C-w>") return wordUnderCursor(s);
  const name = literalOf(key);
  if (name === undefined || [...name].length !== 1) return undefined;
  const reg = Vim.getRegisterController();
  if (!reg.isValidRegister(name) && name !== "/" && name !== ":" && name !== ".") return undefined;
  if (name === "+" || name === "*") return "";
  return reg.getRegister(name).toString().replace(/\n$/, "").replaceAll("\n", "\r");
}

// c_CTRL-J c_CTRL-M: <NL> and CTRL-M start the command like <CR>.
const PROMPT_ALIAS: Readonly<Record<string, string>> = { "<C-j>": "<CR>", "<C-m>": "<CR>" };
const UNFILTERED: ReadonlySet<string> = new Set(["<S-Up>", "<PageUp>", "<S-Down>", "<PageDown>"]);

export function routePromptKey(s: EditorSession, key: VimKey): void {
  const p = s.prompt;
  if (p === null) return;
  const close = closers.get(p) ?? (() => {});
  const event = (value: string): SyntheticPromptEvent => ({
    ...keyToDomKey(key),
    target: { value, selectionStart: p.cursor, selectionEnd: p.cursor },
    preventDefault() {},
    stopPropagation() {},
  });
  if (p.pending !== null) {
    const was = p.pending;
    p.pending = null;
    const text =
      was === "<C-r>" ? registerText(s, key) : (LITERAL[key] ?? ctrlChar(key) ?? literalOf(key));
    if (text !== undefined) insert(p, text);
    return;
  }
  // The :s///c confirm prompt swallows every key (vim.js:6632-6659).
  // The core's handlers would reset the history position on these before they recall from it.
  const recall = UNFILTERED.has(key) && [":", "/", "?"].includes(p.prefix);
  if (!recall && p.onKeyDown?.(event(p.value), p.value, close)) return;
  // Search and ex handlers cancel on <Esc>, <C-c>, <C-[> and <BS> on empty (vim.js:1829-1842, 1927-1934).
  if (p.closed) return;
  if (p.cursor > p.value.length) p.cursor = p.value.length;
  switch (PROMPT_ALIAS[key] ?? key) {
    case "<CR>":
      p.closed = true;
      if (s.prompt === p) s.prompt = null;
      {
        // :g/x/norm @q with an ex command in q nests callbacks; the outer one stays one undo step.
        const outer = s.inExCallback;
        s.inExCallback = true;
        // The search offset is ours (search.ts); the core gets the pattern alone.
        const value =
          p.prefix === "/" || p.prefix === "?" ? takeSearchLine(p.prefix, p.value) : p.value;
        try {
          p.callback?.(value);
        } finally {
          s.inExCallback = outer;
        }
      }
      break;
    case "<Esc>":
      close();
      break;
    case "<BS>":
      if (p.cursor > 0) {
        const before = [...p.value.slice(0, p.cursor)].slice(0, -1).join("");
        p.value = before + p.value.slice(p.cursor);
        p.cursor = before.length;
      }
      break;
    case "<Del>":
      if (p.cursor < p.value.length) {
        const after = [...p.value.slice(p.cursor)].slice(1).join("");
        p.value = p.value.slice(0, p.cursor) + after;
      } else if (p.cursor > 0) {
        p.value = [...p.value].slice(0, -1).join("");
        p.cursor = p.value.length;
      }
      break;
    case "<Left>":
      if (p.cursor > 0) p.cursor -= [...p.value.slice(0, p.cursor)].at(-1)?.length ?? 1;
      break;
    case "<Right>":
      if (p.cursor < p.value.length) p.cursor += [...p.value.slice(p.cursor)][0]?.length ?? 1;
      break;
    case "<Home>":
    case "<C-b>":
      p.cursor = 0;
      break;
    case "<End>":
    case "<C-e>":
      p.cursor = p.value.length;
      break;
    case "<C-w>": {
      let i = p.cursor;
      while (i > 0 && (p.value[i - 1] === " " || p.value[i - 1] === "\t")) i--;
      if (i > 0) {
        const word = isWordChar(p.value[i - 1] as string);
        while (i > 0 && p.value[i - 1] !== " " && isWordChar(p.value[i - 1] as string) === word)
          i--;
      }
      p.value = p.value.slice(0, i) + p.value.slice(p.cursor);
      p.cursor = i;
      break;
    }
    case "<C-r>":
    case "<C-v>":
      p.pending = key as "<C-r>" | "<C-v>";
      break;
    case "<S-Up>":
    case "<PageUp>":
      recallUnfiltered(p, true);
      break;
    case "<S-Down>":
    case "<PageDown>":
      recallUnfiltered(p, false);
      break;
    case "<Ins>":
      p.overstrike = !p.overstrike;
      break;
    default: {
      // <Up>/<Down>/<C-u> were handled by the core; other named or modified keys are counted no-ops.
      const lit = literalOf(key);
      // In a : prompt a <Tab> with nothing to complete is itself; / takes none (vim 9.2).
      if (lit === "\t" && p.prefix === ":") insert(p, lit);
      else if (lit !== undefined && lit !== "\n" && lit !== "\t") insert(p, lit);
    }
  }
  // The : prompt's onKeyUp only highlights, and it sets the / register as a side effect (vim.js:1957-1972).
  if (!p.closed && p.prefix !== ":" && !recall) p.onKeyUp?.(event(p.value), p.value, close);
}
