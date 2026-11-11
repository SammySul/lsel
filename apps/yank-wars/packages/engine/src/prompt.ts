import { literalOf } from "./insertKeys.ts";
import { keyToDomKey, type SyntheticKeyInit, type VimKey } from "./keys.ts";
import type { EditorSession } from "./session.ts";

export type PromptHandler = (
  e: SyntheticPromptEvent,
  value: string,
  close: (v?: string) => void,
) => unknown;

export interface SyntheticPromptEvent extends SyntheticKeyInit {
  target: { value: string; selectionStart: number; selectionEnd: number };
  preventDefault(): void;
  stopPropagation(): void;
}

export interface PromptState {
  readonly prefix: string;
  value: string;
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
      callback: callback as PromptState["callback"],
      onKeyDown: options.onKeyDown,
      onKeyUp: options.onKeyUp,
      closed: false,
    };
    s.prompt = p;
    const close = (newVal?: string) => {
      if (typeof newVal === "string") {
        p.value = newVal;
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

export function routePromptKey(s: EditorSession, key: VimKey): void {
  const p = s.prompt;
  if (p === null) return;
  const close = closers.get(p) ?? (() => {});
  const event = (value: string): SyntheticPromptEvent => ({
    ...keyToDomKey(key),
    target: { value, selectionStart: value.length, selectionEnd: value.length },
    preventDefault() {},
    stopPropagation() {},
  });
  // The :s///c confirm prompt swallows every key (vim.js:6632-6659).
  if (p.onKeyDown?.(event(p.value), p.value, close)) return;
  // Search and ex handlers cancel on <Esc>, <C-c>, <C-[> and <BS> on empty (vim.js:1829-1842, 1927-1934).
  if (p.closed) return;
  switch (key) {
    case "<CR>":
      p.closed = true;
      if (s.prompt === p) s.prompt = null;
      {
        // :g/x/norm @q with an ex command in q nests callbacks; the outer one stays one undo step.
        const outer = s.inExCallback;
        s.inExCallback = true;
        try {
          p.callback?.(p.value);
        } finally {
          s.inExCallback = outer;
        }
      }
      break;
    case "<Esc>":
      close();
      break;
    case "<BS>":
      p.value = [...p.value].slice(0, -1).join("");
      break;
    default: {
      // <Up>/<Down>/<C-u> were handled by the core; other named or modified keys are counted no-ops.
      const lit = literalOf(key);
      if (lit !== undefined && lit !== "\n" && lit !== "\t") p.value += lit;
    }
  }
  if (!p.closed) p.onKeyUp?.(event(p.value), p.value, close);
}
