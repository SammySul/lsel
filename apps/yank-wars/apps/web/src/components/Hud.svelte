<script lang="ts">
import { CHORD_LABELS } from "../lib/chords.ts";
import { formatClock } from "../lib/clock.ts";
import type { RoundController } from "../lib/round.svelte.ts";

let { ctl }: { ctl: RoundController } = $props();

const playing = $derived(ctl.phase === "playing");

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
  </div>

  <div class="score" class:over={ctl.delta > 0}>
    <span class="keys">{ctl.keys}</span>
    <span class="par">/ par {ctl.puzzle.par}</span>
    {#if ctl.delta > 0}<span class="delta">+{ctl.delta}</span>{/if}
  </div>

  <div class="right">
    {#if ctl.round.runs > 1}<span class="runs">run {ctl.round.runs}</span>{/if}
    <span class="clock">{formatClock(ctl.elapsed)}</span>
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
