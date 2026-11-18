import { apply, type Command } from "../sim/commands.ts";
import { newGame, type Snapshot } from "../sim/state.ts";
import { TICK_MS, tick } from "../sim/tick.ts";

// a tab that slept is credited a day at most when it wakes
const CATCH_UP_TICKS = (24 * 60 * 60 * 1000) / TICK_MS;

export type Game = ReturnType<typeof startGame>;

/** Runs a new game on the wall clock: the sim owns the state, the interface reads snapshots of it. */
export function startGame(seed: number) {
  const state = newGame(seed);
  let snapshot = $state.raw<Snapshot>(structuredClone(state));
  let last = performance.now();
  let owedMs = 0;

  function advance(): void {
    const now = performance.now();
    owedMs += now - last;
    last = now;
    const due = Math.floor(owedMs / TICK_MS);
    if (due === 0) return;
    owedMs -= due * TICK_MS;
    for (let i = 0; i < Math.min(due, CATCH_UP_TICKS); i++) tick(state);
    snapshot = structuredClone(state);
  }
  const timer = setInterval(advance, TICK_MS / 2);

  return {
    /** Refreshed after every tick and command. */
    get snapshot(): Snapshot {
      return snapshot;
    },
    /** The state as it is now and the time since its last tick, for drawing between ticks. */
    frame(): { state: Snapshot; sinceTickMs: number } {
      return { state, sinceTickMs: Math.min(owedMs + performance.now() - last, TICK_MS) };
    },
    send(command: Command): void {
      advance();
      apply(state, command);
      snapshot = structuredClone(state);
    },
    stop(): void {
      clearInterval(timer);
    },
  };
}
