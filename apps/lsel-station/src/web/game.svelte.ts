import { apply, type Command } from "../sim/commands.ts";
import type { GameEvent } from "../sim/events.ts";
import type { GameState, Snapshot } from "../sim/state.ts";
import { eventful, type Summary, summarize } from "../sim/summary.ts";
import { TICK_MS, tick } from "../sim/tick.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
// more ticks than this at once is catching up, which happens in silence
const LIVE_TICKS = 2;
// a gap longer than this, while the page was open, is caught up behind a progress bar
const LONG_GAP_TICKS = (60 * 60 * 1000) / TICK_MS;
// away at least this long earns a "While you were away" summary
const AWAY_MS = 60_000;
const CHUNK_TICKS = 2000;
const AUTOSAVE_MS = 30_000;
// worth a save as soon as it happens
const MILESTONES: ReadonlySet<GameEvent["kind"]> = new Set([
  "module-built",
  "unlocked",
  "crew-joined",
  "sector-claimed",
  "level-up",
]);

/** Lets the browser draw and handle input. A message task, not a timer: timers are slowed in a hidden tab. */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(null);
  });
}

export type Game = ReturnType<typeof startGame>;

/** Runs a game on the wall clock, catching up from `savedAt` first; `hear` gets only what happens live. */
export function startGame(opts: {
  state: GameState;
  savedAt: number | null;
  readOnly: boolean;
  hear: (event: GameEvent) => void;
  save: (state: GameState, savedAt: number) => void;
}) {
  const { state, readOnly, hear } = opts;
  let snapshot = $state.raw<Snapshot>(structuredClone(state));
  let catching = $state.raw<{ done: number; total: number; awayMs: number } | null>(null);
  let summary = $state.raw<Summary | null>(null);
  // the wall clock: a monotonic one stands still while the computer sleeps, and that time would be lost
  let last = Date.now();
  let owedMs = 0;
  let stopped = false;
  let hidden: { at: number; before: GameState } | null = null;
  // what the last save held: the same game saved again later would look like play since then to sync
  let saved = { ticks: opts.savedAt === null ? -1 : state.ticks, commands: 0 };
  let commands = 0;

  // a save during catch-up would be stamped now and drop the time not yet caught up on
  function saveNow(): void {
    if (readOnly || stopped || catching !== null) return;
    if (state.ticks === saved.ticks && commands === saved.commands) return;
    saved = { ticks: state.ticks, commands };
    opts.save(state, Date.now());
  }

  /** Runs `ticks` ticks in chunks, behind a progress bar, then shows what changed since `before`. */
  async function catchUp(ticks: number, before: GameState, awayMs: number): Promise<void> {
    catching = { done: 0, total: ticks, awayMs };
    for (let done = 0; done < ticks; ) {
      const n = Math.min(CHUNK_TICKS, ticks - done);
      for (let i = 0; i < n; i++) tick(state);
      done += n;
      catching = { done, total: ticks, awayMs };
      await yieldToBrowser();
      if (stopped) return;
    }
    catching = null;
    snapshot = structuredClone(state);
    const changed = summarize(before, state, awayMs);
    summary = eventful(changed) ? changed : null;
    saveNow();
  }

  function advance(): void {
    if (readOnly || catching !== null || stopped) return;
    const now = Date.now();
    owedMs += Math.max(now - last, 0);
    last = now;
    const due = Math.floor(owedMs / TICK_MS);
    if (due === 0) return;
    owedMs -= due * TICK_MS;
    const ticks = Math.min(due, DAY_MS / TICK_MS);
    if (ticks > LONG_GAP_TICKS) {
      void catchUp(ticks, hidden?.before ?? structuredClone(state), ticks * TICK_MS);
      return;
    }
    let milestone = false;
    for (let i = 0; i < ticks; i++) {
      const events = tick(state);
      if (due <= LIVE_TICKS) events.forEach(hear);
      milestone ||= events.some((e) => MILESTONES.has(e.kind));
    }
    snapshot = structuredClone(state);
    if (milestone) saveNow();
  }

  function onVisibility(): void {
    if (document.visibilityState === "hidden") {
      saveNow();
      hidden = { at: Date.now(), before: structuredClone(state) };
      return;
    }
    const was = hidden;
    advance();
    hidden = null;
    if (was === null || catching !== null || Date.now() - was.at < AWAY_MS) return;
    const changed = summarize(was.before, state, Date.now() - was.at);
    if (eventful(changed)) summary = changed;
  }

  const timers: ReturnType<typeof setInterval>[] = [];
  if (!readOnly) {
    timers.push(setInterval(advance, TICK_MS / 2), setInterval(saveNow, AUTOSAVE_MS));
    document.addEventListener("visibilitychange", onVisibility);
    addEventListener("pagehide", saveNow);
    if (opts.savedAt !== null) {
      const awayMs = Math.min(Math.max(Date.now() - opts.savedAt, 0), DAY_MS);
      const ticks = Math.floor(awayMs / TICK_MS);
      if (awayMs >= AWAY_MS) void catchUp(ticks, structuredClone(state), awayMs);
      else {
        for (let i = 0; i < ticks; i++) tick(state);
        snapshot = structuredClone(state);
      }
    }
  }

  return {
    /** Refreshed after every tick and command. */
    get snapshot(): Snapshot {
      return snapshot;
    },
    /** While a long time away is being caught up on: how far along, in ticks. */
    get catching() {
      return catching;
    },
    /** What changed while the player was away, until they put it away. */
    get summary(): Summary | null {
      return summary;
    },
    readOnly,
    dismissSummary(): void {
      summary = null;
    },
    /** The state as it is now and the time since its last tick, for drawing between ticks. */
    frame(): { state: Snapshot; sinceTickMs: number } {
      return { state, sinceTickMs: Math.min(owedMs + Math.max(Date.now() - last, 0), TICK_MS) };
    },
    send(command: Command): void {
      if (readOnly || catching !== null || stopped) return;
      advance();
      commands++;
      apply(state, command).forEach(hear);
      snapshot = structuredClone(state);
      saveNow();
    },
    saveNow,
    /** Stops for good: nothing runs or saves after this. */
    stop(): void {
      saveNow();
      stopped = true;
      for (const timer of timers) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      removeEventListener("pagehide", saveNow);
    },
  };
}
