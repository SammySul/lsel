// A DEV-only page hook the parity e2e drives the engine through in a real browser.

import { detectPlatform, type VimKey } from "@yank-wars/engine";
import { puzzleOf } from "@yank-wars/engine/oracle/engine";
import { observe } from "@yank-wars/engine/oracle/observe";
import type { Observed, OracleCase } from "@yank-wars/engine/oracle/types";
import { createPlayerView, type PlayerView } from "../editor/playerView.ts";
import { FORFEIT_KEY, NUMBERS_KEY, RESET_KEY } from "../lib/chords.ts";
import "@sammysul/lsel/tokens.css";
import "../app.css";

export interface HarnessState extends Observed {
  log: VimKey[];
  blocked: string[];
  focused: boolean;
}

export interface Harness {
  mount(c: Pick<OracleCase, "id" | "start" | "settings">): void;
  state(): HarnessState;
}

declare global {
  interface Window {
    __yw?: Harness;
  }
}

const host = document.getElementById("player");
if (host === null) throw new Error("harness.html has no #player element");
const platform = detectPlatform(globalThis.navigator);
let player: PlayerView | null = null;
let log: VimKey[] = [];
let blocked: string[] = [];
let focused = false;

// The same createPlayerView options as RoundController.#startPlayer, in a round that is always "playing".
function mount(c: Pick<OracleCase, "id" | "start" | "settings">): void {
  player?.destroy();
  log = [];
  blocked = [];
  player = createPlayerView({
    parent: host as HTMLElement,
    puzzle: puzzleOf(c),
    platform,
    relativeNumbers: false,
    devGuard: import.meta.env.DEV,
    intercept: (key) => key === RESET_KEY || key === FORFEIT_KEY || key === NUMBERS_KEY,
    accept: () => true,
    onKey: (key) => log.push(key),
    onBlocked: (reason) => blocked.push(reason),
    onFocus: (f) => {
      focused = f;
    },
    onDoc: () => {},
  });
  player.focus();
}

function state(): HarnessState {
  if (player === null) throw new Error("harness: mount() first");
  return { ...observe(player.session), log: [...log], blocked: [...blocked], focused };
}

window.__yw = { mount, state };
