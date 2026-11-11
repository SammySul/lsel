import {
  type BlockedReason,
  createRound,
  currentRun,
  detectPlatform,
  elapsedMs,
  formatKeys,
  type HudState,
  type KeyResult,
  type Platform,
  type Puzzle,
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
import type { Best, Prefs } from "./prefs.svelte.ts";

export type SelfCheck = "off" | "pending" | "ok" | "mismatch";

export const LOCK_PULSE_MS = 400;

const initialHud: HudState = {
  mode: "normal",
  insertModeReturn: false,
  pending: "",
  prompt: null,
  message: null,
  recording: null,
  solved: false,
  error: null,
  keysFed: 0,
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

  // $derived.by: a plain $derived(this.round…) initializer trips TS2729 (set in the constructor).
  phase = $derived.by(() => this.round.phase);
  keys = $derived.by(() => scoreOf(this.round.log));
  delta = $derived.by(() => this.keys - this.puzzle.par);
  elapsed = $derived.by(() => elapsedMs(this.round, this.now));
  remaining = $derived.by(() => remainingMs(this.round, this.now));
  notation = $derived.by(() => formatKeys(currentRun(this.round.log)));
  capLeft = $derived.by(() => {
    const { startedAt, endsAt, finishedAt } = this.round;
    if (startedAt === null || endsAt === null) return 1;
    const at = finishedAt ?? this.now;
    return Math.min(1, Math.max(0, (endsAt - at) / (endsAt - startedAt)));
  });

  #player: PlayerView | null = null;
  #target: TargetView | null = null;
  #playerHost: HTMLElement | null = null;
  #raf = 0;
  #pulse: ReturnType<typeof setTimeout> | undefined;
  #keyAt = 0;

  constructor(puzzle: Puzzle, prefs: Prefs, clock: () => number) {
    this.puzzle = puzzle;
    this.prefs = prefs;
    this.#clock = clock;
    this.round = $state.raw(createRound(clock()));
    this.now = clock();
    this.bestBefore = prefs.best[puzzle.id];
  }

  mount(playerHost: HTMLElement, targetHost: HTMLElement): void {
    this.unmount();
    this.#playerHost = playerHost;
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
    this.#playerHost = null;
  }

  ready(): void {
    this.#dispatch({ type: "ready" });
  }

  reset(): void {
    if (this.phase !== "playing") return;
    this.#dispatch({ type: "reset" });
    this.#player?.destroy();
    this.#player = null;
    this.blocked = null;
    this.#startPlayer();
    this.flash++;
  }

  forfeit(): void {
    if (this.phase !== "playing") return;
    this.#dispatch({ type: "forfeit" });
  }

  toggleNumbers(): void {
    const on = !this.prefs.relativeNumbers;
    this.prefs.relativeNumbers = on;
    this.#player?.setRelativeNumbers(on);
  }

  focus(): void {
    this.#player?.focus();
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
    this.snap = sessionSnapshot(player.session);
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
    return this.phase === "playing";
  }

  // Logged at the time it was accepted: a slow feed that crosses the cap already changed the buffer.
  #onKey(key: VimKey, result: KeyResult): void {
    this.#dispatch({ type: "key", key, solved: result.solved }, this.#keyAt);
    if (this.#player !== null) this.snap = sessionSnapshot(this.#player.session);
    this.blocked = null;
  }

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
    const next = reduceRound(prev, e, now);
    if (next === prev) return;
    this.round = next;
    if (!isOver(prev.phase) && isOver(next.phase)) this.#onEnded();
  }

  #onEnded(): void {
    this.now = this.#clock();
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
