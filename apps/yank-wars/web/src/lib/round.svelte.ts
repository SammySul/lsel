// One round's state in the browser: keys, clock, claims and the result, solo or in a room.

import {
  type Best,
  type BlockedReason,
  createRound,
  currentRun,
  detectPlatform,
  type EditorSession,
  elapsedMs,
  feedKey,
  formatKeys,
  type HudState,
  type KeyLog,
  type KeyResult,
  type Platform,
  type Puzzle,
  RESET,
  type RoundEvent,
  type RoundPhase,
  type RoundState,
  reduceRound,
  remainingMs,
  scoreOf,
  sessionSnapshot,
  type Text,
  type VimKey,
} from "@yank-wars/engine";
import { runSelfCheck } from "../dev/selfCheck.ts";
import { linesOffOf } from "../editor/diff.ts";
import { createPlayerView, type PlayerView } from "../editor/playerView.ts";
import { createTargetView, type TargetView } from "../editor/targetView.ts";
import { FORFEIT_KEY, NUMBERS_KEY, READY_KEYS, RESET_KEY } from "./chords.ts";
import type { Prefs } from "./prefs.svelte.ts";

export type SelfCheck = "off" | "pending" | "ok" | "mismatch";

/** A round played in a room: the room starts and ends it, and hears every key. */
export interface RoundLink {
  ready(): void;
  /** the log changed: send the room what it hasn't had */
  log(log: KeyLog): void;
  claim(length: number, doc: string): void;
  forfeit(): void;
}

/** A room round's lock-in: a match is only a claim until the server's replay agrees. */
export type Claim = "none" | "checking" | "rejected";

export const LOCK_PULSE_MS = 400;

const initialHud: HudState = {
  mode: "normal",
  insertModeReturn: false,
  pending: "",
  prompt: null,
  message: null,
  recording: null,
  error: null,
};

export function isOver(phase: RoundPhase): boolean {
  return phase === "locked" || phase === "forfeited" || phase === "expired";
}

export class RoundController {
  readonly puzzle: Puzzle;
  readonly prefs: Prefs;
  readonly platform: Platform = detectPlatform(globalThis.navigator);
  readonly #clock: () => number;

  round: RoundState;
  snap = $state.raw<HudState>(initialHud);
  now = $state(0);
  linesOff = $state(0);
  flash = $state(0);
  focused = $state(false);
  blocked = $state<BlockedReason | null>(null);
  selfCheck = $state<SelfCheck>("off");
  showResult = $state(false);
  bestBefore = $state.raw<Best | undefined>(undefined);
  newBest = $state(false);
  claim = $state<Claim>("none");
  readySent = $state(false);

  // $derived.by: a plain $derived(this.round…) initializer trips TS2729 (set in the constructor).
  phase = $derived.by(() => this.round.phase);
  keys = $derived.by(() => scoreOf(this.round.log));
  delta = $derived.by(() => this.keys - this.puzzle.par);
  elapsed = $derived.by(() => elapsedMs(this.round, this.now));
  remaining = $derived.by(() => remainingMs(this.round, this.now));
  notation = $derived.by(() => formatKeys(currentRun(this.round.log)));
  capLeft = $derived.by(() => {
    const { startedAt, finishedAt, capMs } = this.round;
    if (startedAt === null) return 1;
    const at = finishedAt ?? this.now;
    return Math.min(1, Math.max(0, (startedAt + capMs - at) / capMs));
  });

  #player: PlayerView | null = null;
  #target: TargetView | null = null;
  #playerHost: HTMLElement | null = null;
  #raf = 0;
  #pulse: ReturnType<typeof setTimeout> | undefined;
  #keyAt = 0;
  readonly #link: RoundLink | null;
  /** keys a reload must type into the buffer once it mounts */
  #replay: readonly VimKey[] = [];

  /** `studyMs`: what is left of the room's study window. */
  constructor(
    puzzle: Puzzle,
    prefs: Prefs,
    clock: () => number,
    link: RoundLink | null = null,
    studyMs?: number,
  ) {
    this.puzzle = puzzle;
    this.prefs = prefs;
    this.#clock = clock;
    this.#link = link;
    this.round = $state.raw(createRound(clock(), studyMs === undefined ? {} : { studyMs }));
    this.now = clock();
    this.bestBefore = prefs.best[puzzle.id];
  }

  mount(playerHost: HTMLElement, targetHost: HTMLElement): void {
    this.unmount();
    this.#playerHost = playerHost;
    playerHost.addEventListener("compositionstart", this.#onComposition);
    this.#target = createTargetView(targetHost, this.puzzle);
    this.#startPlayer();
    if (!isOver(this.phase)) this.#raf = requestAnimationFrame(this.#frame);
  }

  unmount(): void {
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    clearTimeout(this.#pulse);
    this.#player?.destroy();
    this.#player = null;
    this.#target?.destroy();
    this.#target = null;
    this.#playerHost?.removeEventListener("compositionstart", this.#onComposition);
    this.#playerHost = null;
  }

  ready(): void {
    if (this.#link === null) this.#dispatch({ type: "ready" });
    else if (this.phase === "study" && !this.readySent) {
      this.readySent = true;
      this.#link.ready();
    }
  }

  reset(): void {
    if (this.phase !== "playing" || this.claim === "checking") return;
    this.#dispatch({ type: "reset" });
    this.#player?.destroy();
    this.#player = null;
    this.blocked = null;
    this.#startPlayer();
    this.flash++;
    this.#sendLog();
  }

  forfeit(): void {
    if (this.phase !== "playing" || this.claim === "checking") return;
    this.#dispatch({ type: "forfeit" });
    this.#link?.forfeit();
  }

  /** Room only: the round runs, `elapsed` ms in, `left` ms before its deadline (the cap or grace). */
  sync(elapsed: number, left: number): void {
    const now = this.#clock();
    const endsAt = now + left;
    if (this.round.phase === "study") {
      this.round = { ...this.round, phase: "playing", startedAt: now - elapsed, endsAt };
    } else if (this.round.phase === "playing") {
      this.round = { ...this.round, endsAt };
    }
    this.now = now;
  }

  /** Room only: the server's replay of this round's claim agreed, or didn't; `after`: its lock-in time. */
  verdict(ok: boolean, after?: number | null): void {
    if (this.claim !== "checking") return;
    if (!ok) {
      this.claim = "rejected";
      // A matched session takes no more keys; the player keeps going from this buffer.
      if (this.#player !== null) this.#player.session.solved = false;
      return;
    }
    const { startedAt } = this.round;
    this.claim = "none";
    this.round = {
      ...this.round,
      phase: "locked",
      finishedAt: after == null || startedAt === null ? this.#keyAt : startedAt + after,
    };
    this.#onEnded();
  }

  /** Room only: the room ended this player's round (the deadline, a forfeit by dropping out). */
  stop(): void {
    if (isOver(this.phase)) return;
    this.claim = "none";
    this.round = { ...this.round, phase: "expired", finishedAt: this.#clock() };
    this.#onEnded();
  }

  /** Room only, after a reload: takes the room's copy of this round's log; its last run is typed into the buffer. */
  restore(log: KeyLog): void {
    this.round = { ...this.round, log: [...log], runs: 1 + log.filter((e) => e === RESET).length };
    this.#replay = currentRun(log);
    if (this.#player !== null) {
      this.#player.destroy();
      this.#player = null;
      this.#startPlayer();
    }
  }

  /** Room only: claims again what a dropped socket may have lost. */
  reclaim(): void {
    if (this.claim === "checking" && this.#player !== null) this.#sendClaim();
  }

  toggleNumbers(): void {
    const on = !this.prefs.relativeNumbers;
    this.prefs.relativeNumbers = on;
    this.#player?.setRelativeNumbers(on);
  }

  focus(): void {
    this.#player?.focus();
  }

  get session(): EditorSession | null {
    return this.#player?.session ?? null;
  }

  destroy(): void {
    this.unmount();
  }

  #startPlayer(): void {
    const parent = this.#playerHost;
    if (parent === null) return;
    const player = createPlayerView({
      parent,
      puzzle: this.puzzle,
      platform: this.platform,
      relativeNumbers: this.prefs.relativeNumbers,
      devGuard: import.meta.env.DEV,
      intercept: (key, e) => this.#intercept(key, e),
      accept: () => this.#accepting(),
      onKey: (key, result) => this.#onKey(key, result),
      onBlocked: (reason) => {
        this.blocked = reason;
      },
      onFocus: (focused) => {
        // Unmounting fires blur synchronously inside Svelte's teardown, where writing state throws.
        queueMicrotask(() => {
          this.focused = focused;
        });
      },
      onDoc: (doc) => this.#onDoc(doc),
    });
    this.#player = player;
    const replay = this.#replay;
    this.#replay = [];
    for (const k of replay) feedKey(player.session, k);
    this.snap = sessionSnapshot(player.session);
    // A reload after a claim the server never answered: claim again.
    if (player.session.solved && this.phase === "playing" && this.claim === "none") {
      this.claim = "checking";
      this.#sendClaim();
    }
    this.#onDoc(player.session.view.state.doc);
    player.focus();
  }

  #intercept(key: VimKey, e: KeyboardEvent): boolean {
    if (key === RESET_KEY) this.reset();
    else if (key === FORFEIT_KEY) this.forfeit();
    else if (key === NUMBERS_KEY) this.toggleNumbers();
    else if (this.phase === "study" && READY_KEYS.includes(key)) {
      if (!e.repeat) this.ready();
    } else return false;
    return true;
  }

  // Tick first so a key that arrives after the cap (no frame ran, e.g. a background tab) is refused.
  #accepting(): boolean {
    this.#keyAt = this.#clock();
    this.#dispatch({ type: "tick" }, this.#keyAt);
    return this.phase === "playing" && this.claim !== "checking";
  }

  // Logged at the time it was accepted: a slow feed that crosses the cap already changed the buffer.
  #onKey(key: VimKey, result: KeyResult): void {
    this.#dispatch({ type: "key", key, solved: result.solved && this.#link === null }, this.#keyAt);
    if (this.#player !== null) this.snap = sessionSnapshot(this.#player.session);
    this.blocked = null;
    if (this.#link === null) return;
    this.#sendLog();
    if (this.claim === "rejected") this.claim = "none";
    if (result.solved && this.phase === "playing") {
      this.claim = "checking";
      this.#sendClaim();
    }
  }

  #sendLog(): void {
    this.#link?.log(this.round.log);
  }

  #sendClaim(): void {
    const doc = this.#player?.session.view.state.doc.toString() ?? "";
    this.#link?.claim(this.round.log.length, doc);
  }

  // An IME may compose without any keydown the key capture could flag (Chromium's CDP does).
  #onComposition = (): void => {
    if (!isOver(this.phase)) this.blocked = "ime";
  };

  #onDoc(doc: Text): void {
    if (this.#player !== null) this.linesOff = linesOffOf(this.#player.session.view.state);
    this.#target?.setPlayerDoc(doc);
  }

  #frame = (): void => {
    this.#raf = 0;
    this.now = this.#clock();
    this.#dispatch({ type: "tick" });
    if (!isOver(this.phase)) this.#raf = requestAnimationFrame(this.#frame);
  };

  #dispatch(e: RoundEvent, now = this.#clock()): void {
    const prev = this.round;
    // In a room, play starts when the server says so (sync), not on the study clock or Space.
    if (this.#link !== null && prev.phase === "study") return;
    const next = reduceRound(prev, e, now);
    if (next === prev) return;
    this.round = next;
    if (!isOver(prev.phase) && isOver(next.phase)) this.#onEnded();
  }

  #onEnded(): void {
    this.now = this.#clock();
    if (this.#link !== null) {
      if (import.meta.env.DEV && this.round.phase === "locked") this.#selfCheck();
      return;
    }
    if (this.round.phase !== "locked") {
      // The key that ran into the cap is still propagating; a card mounted now would act on it.
      this.#pulse = setTimeout(() => {
        this.showResult = true;
      }, 0);
      return;
    }
    this.newBest = this.prefs.recordBest(this.puzzle.id, {
      keys: this.keys,
      ms: elapsedMs(this.round, this.#clock()),
    });
    if (import.meta.env.DEV) this.#selfCheck();
    this.#pulse = setTimeout(() => {
      this.showResult = true;
    }, LOCK_PULSE_MS);
  }

  // Replay resets process-global vim state, so it runs only once the live session stops accepting keys.
  #selfCheck(): void {
    const player = this.#player;
    if (player === null) return;
    const { puzzle } = this;
    const log = this.round.log;
    const liveDoc = player.session.view.state.doc.toString();
    this.selfCheck = "pending";
    queueMicrotask(() => {
      this.selfCheck = runSelfCheck(puzzle, log, liveDoc);
    });
  }
}
