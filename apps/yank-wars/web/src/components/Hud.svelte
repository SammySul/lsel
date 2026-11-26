<script lang="ts">
import { duration } from "@sammysul/lsel";
import type { PlayerStatus, PlayerView } from "@yank-wars/engine";
import { CHORD_LABELS } from "../lib/chords.ts";
import type { RoomClient } from "../lib/room.svelte.ts";
import type { RoundController } from "../lib/round.svelte.ts";

let { ctl, room }: { ctl: RoundController; room?: RoomClient | undefined } = $props();

const playing = $derived(ctl.phase === "playing" && ctl.claim !== "checking");
const them = $derived(room?.them ?? null);
const grace = $derived(room?.graceLeft(ctl.now) ?? null);

const STATUS: Record<PlayerStatus, string> = {
  waiting: "waiting",
  playing: "playing",
  claiming: "checking a lock-in",
  locked: "locked in",
  forfeited: "gave up",
};

function stateOf(p: PlayerView): string {
  if (!p.connected) return "disconnected";
  if (room?.view?.phase === "study") return "studying";
  return STATUS[p.status];
}

// The editor is the only keyboard target in a round; a button must not take its focus.
function keepFocus(e: MouseEvent) {
  e.preventDefault();
}
</script>

<header class="hud">
  <div class="left">
    <a class="back" href="#/">← puzzles</a>
    <h1>{ctl.puzzle.title}</h1>
    <span class="chip">{ctl.puzzle.language}</span>
    <span class="chip {ctl.puzzle.difficulty}">{ctl.puzzle.difficulty}</span>
  </div>

  <div class="score" class:over={ctl.delta > 0}>
    <span class="keys">{ctl.keys}</span>
    <span class="par">/ par {ctl.puzzle.par}</span>
    {#if ctl.delta > 0}<span class="delta">+{ctl.delta}</span>{/if}
  </div>

  <div class="right">
    {#if ctl.round.runs > 1}<span class="runs">run {ctl.round.runs}</span>{/if}
    <span class="clock">
      {duration(ctl.elapsed, "m:ss.t")}
      {#if grace !== null && room !== undefined}
        <span class="grace" title="The round ends when grace runs out">
          grace {duration(grace, "m:ss")}
          <span class="grace-bar"
            ><span style:width="{(grace / Math.max(1, room.graceMax)) * 100}%"></span></span
          >
        </span>
      {/if}
    </span>
    <button
      onmousedown={keepFocus}
      onclick={() => ctl.reset()}
      disabled={!playing}
      title={CHORD_LABELS.reset}>Reset <kbd>{CHORD_LABELS.reset}</kbd></button
    >
    <button
      onmousedown={keepFocus}
      onclick={() => ctl.forfeit()}
      disabled={!playing}
      title={CHORD_LABELS.forfeit}>Give up</button
    >
    <button
      onmousedown={keepFocus}
      onclick={() => {
        ctl.toggleNumbers();
        ctl.focus();
      }}
      aria-pressed={ctl.prefs.relativeNumbers}
      title={CHORD_LABELS.numbers}>{ctl.prefs.relativeNumbers ? "Relative" : "Absolute"} numbers</button
    >
  </div>

  {#if them !== null}
    <div class="opponent" class:away={!them.connected}>
      <span class="name">{them.name}</span>
      <span>{them.score} keys</span>
      {#if them.runs > 1}<span>run {them.runs}</span>{/if}
      <span class="state">{stateOf(them)}</span>
    </div>
  {/if}

  <div class="cap" aria-hidden="true">
    <div class="fill" class:low={ctl.capLeft < 0.15} style:width="{ctl.capLeft * 100}%"></div>
  </div>
</header>

<style>
  .hud {
    position: relative;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 16px;
    padding: 10px 16px 14px;
    background: var(--raise);
    border-bottom: 1px solid var(--overlay);
  }
  .left,
  .right {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .right {
    justify-content: flex-end;
  }
  .back {
    color: var(--subtle);
    font-size: var(--text-xs);
    white-space: nowrap;
  }
  h1 {
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chip {
    font-family: var(--font);
    font-size: var(--text-xs);
    color: var(--subtle);
    border: 1px solid var(--overlay);
    padding: 1px 8px;
  }
  .chip.easy {
    color: var(--success);
  }
  .chip.medium {
    color: var(--warning);
  }
  .chip.hard {
    color: var(--error);
  }
  .score {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-family: var(--font);
    font-variant-numeric: tabular-nums;
  }
  .keys {
    font-size: var(--text-display);
    font-weight: 700;
    line-height: 1;
  }
  .par {
    color: var(--subtle);
    font-size: var(--text-md);
  }
  .over .keys,
  .delta {
    color: var(--warning);
  }
  .delta {
    font-size: var(--text-md);
    font-weight: 700;
  }
  .runs {
    color: var(--subtle);
    font-size: var(--text-xs);
  }
  .clock {
    font-family: var(--font);
    font-size: var(--text-lg);
    font-variant-numeric: tabular-nums;
    min-width: 6ch;
    text-align: right;
  }
  .grace {
    display: block;
    font-size: var(--text-xs);
    color: var(--warning);
  }
  .grace-bar {
    display: block;
    height: 3px;
    background: var(--overlay);
  }
  .grace-bar span {
    display: block;
    height: 100%;
    background: var(--warning);
  }
  .opponent {
    grid-column: 1 / -1;
    display: flex;
    gap: 12px;
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    color: var(--subtle);
  }
  .opponent .name {
    font-weight: 700;
    color: var(--text);
  }
  .opponent.away .state {
    color: var(--warning);
  }
  .cap {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    background: var(--overlay);
  }
  .fill {
    height: 100%;
    background: var(--accent);
  }
  .fill.low {
    background: var(--error);
  }
</style>
