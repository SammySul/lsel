// A DEV-only page hook the e2e reads a round's state through.

import { observe } from "@yank-wars/engine/oracle/observe";
import type { Observed } from "@yank-wars/engine/oracle/types";
import type { RoundController } from "../lib/round.svelte.ts";

export interface RoundProbeState extends Observed {
  puzzle: string;
  phase: string;
  /** the round log as notation strings, RESET included */
  log: readonly string[];
  keys: number;
  runs: number;
  selfCheck: string;
  showResult: boolean;
  focused: boolean;
  blocked: string | null;
}

export interface RoundProbe {
  state(): RoundProbeState | null;
}

declare global {
  interface Window {
    __ywRound?: RoundProbe;
  }
}

/** Read-only view of the live round for the e2e suite (DEV only); returns the cleanup. */
export function exposeRound(ctl: RoundController): () => void {
  const probe: RoundProbe = {
    state() {
      const s = ctl.session;
      if (s === null) return null;
      return {
        ...observe(s),
        puzzle: ctl.puzzle.id,
        phase: ctl.phase,
        log: [...ctl.round.log],
        keys: ctl.keys,
        runs: ctl.round.runs,
        selfCheck: ctl.selfCheck,
        showResult: ctl.showResult,
        focused: ctl.focused,
        blocked: ctl.blocked,
      };
    },
  };
  window.__ywRound = probe;
  return () => {
    if (window.__ywRound === probe) delete window.__ywRound;
  };
}
