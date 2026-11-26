// Turns the player's keyboard events into vim keys and feeds them, blocking the ones that would break parity.

import { EditorState, type Extension, Prec, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { feedKey, type KeyResult } from "../feedKey.ts";
import type { EditorSession } from "../session.ts";
import { keyFromEvent, type Platform } from "./keyFromEvent.ts";
import type { VimKey } from "./keys.ts";

export type BlockedReason = "ime" | "dead" | "meta" | "fkey" | "unfocused";

export interface BrowserInputOptions {
  platform: Platform;
  /** UI chords and ready keys: consumed, never logged or fed */
  intercept?(key: VimKey, e: KeyboardEvent): boolean;
  /** false during study and after the round ends: swallowed, not logged */
  accept?(): boolean;
  /** the web appends `key` to the round log here */
  onKey(key: VimKey, result: KeyResult): void;
  onBlocked?(reason: BlockedReason): void;
  onFocus?(focused: boolean): void;
  /** import.meta.env.DEV: warn on unlogged doc/selection changes */
  devGuard?: boolean;
}

const swallow = () => true;

// Every keydown returns true, so CM6 prevents it and the adapter's own handler never runs (view:4615-4628).
export function browserInput(session: () => EditorSession, opts: BrowserInputOptions): Extension {
  return [
    Prec.highest(
      EditorView.domEventHandlers({
        keydown(e) {
          if (e.key === "Dead" || e.key === "Process" || e.isComposing) {
            opts.onBlocked?.(e.key === "Dead" ? "dead" : "ime");
            return true;
          }
          // Cmd/Win combos would otherwise move the native selection unlogged (Cmd+A).
          if (e.metaKey) {
            opts.onBlocked?.("meta");
            return true;
          }
          const key = keyFromEvent(e, opts.platform);
          if (key === undefined) {
            if (/^F\d/.test(e.key)) opts.onBlocked?.("fkey");
            return true;
          }
          if (opts.intercept?.(key, e)) return true;
          if (!(opts.accept?.() ?? true)) return true;
          const result = feedKey(session(), key);
          opts.onKey(key, result);
          return true;
        },
        keypress: swallow,
        beforeinput: swallow,
        paste: swallow,
        drop: swallow,
        cut: swallow,
        copy: swallow,
        dragstart: swallow,
        dragover: swallow,
        contextmenu: swallow,
        // Preventing mousedown also cancels focus-on-click, so focus by hand.
        mousedown(_e, view) {
          view.focus();
          return true;
        },
        focus() {
          opts.onFocus?.(true);
          return false;
        },
        blur() {
          opts.onFocus?.(false);
          return false;
        },
      }),
    ),
    // Any DOM-originated text is dropped; CM redraws from state.
    Prec.highest(EditorView.inputHandler.of(() => true)),
    // Firefox moves the DOM selection after some redraws and WebKit on right-click; only fed keys may move the cursor.
    EditorState.transactionFilter.of((tr) =>
      (tr.docChanged || tr.selection) && !session().feeding ? [] : tr,
    ),
    opts.devGuard
      ? EditorView.updateListener.of((u) => {
          if ((u.docChanged || u.selectionSet) && !session().feeding) {
            console.warn(
              "[yank-wars] unlogged editor change",
              u.transactions.map((t) => t.annotation(Transaction.userEvent)),
            );
          }
        })
      : [],
  ];
}
