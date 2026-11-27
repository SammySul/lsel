<!-- The study countdown before play starts. -->
<script lang="ts">
import { CHORD_LABELS } from "../lib/chords.ts";
import type { RoundController } from "../lib/round.svelte.ts";

let { ctl }: { ctl: RoundController } = $props();

const RADIUS = 15;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const total = $derived(ctl.round.studyEndsAt - ctl.round.createdAt);
const left = $derived(Math.max(0, ctl.round.studyEndsAt - ctl.now));
const fraction = $derived(total > 0 ? left / total : 0);

function ready() {
  ctl.ready();
  ctl.focus();
}
</script>

<div class="study" role="status">
  <div class="ring">
    <svg viewBox="0 0 36 36" aria-hidden="true">
      <circle class="track" cx="18" cy="18" r={RADIUS} />
      <circle
        class="arc"
        cx="18"
        cy="18"
        r={RADIUS}
        stroke-dasharray={CIRCUMFERENCE}
        stroke-dashoffset={CIRCUMFERENCE * (1 - fraction)}
      />
    </svg>
    <span class="secs">{Math.ceil(left / 1000)}</span>
  </div>
  <div class="text">
    {#if ctl.readySent}
      <p><strong>Ready.</strong> Waiting for the other player, or the countdown.</p>
    {:else}
      <p><strong>Study the target.</strong> <kbd>Space</kbd> or <kbd>Enter</kbd> when ready.</p>
    {/if}
    <p class="chords">
      <kbd>{CHORD_LABELS.reset}</kbd> reset (counter to 0, clock keeps running) ·
      <kbd>{CHORD_LABELS.forfeit}</kbd> give up · <kbd>{CHORD_LABELS.numbers}</kbd> line numbers ·
      Tab and Esc are vim keys: the editor keeps focus until the round ends{#if ctl.platform === "other"}
        · Ctrl+W closes the tab in Chrome{/if}
    </p>
  </div>
  <button onmousedown={(e) => e.preventDefault()} onclick={ready} disabled={ctl.readySent}
    >Ready</button
  >
</div>

<style>
  .study {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: 0 var(--space-4);
    background: var(--raise);
    border: var(--border);
  }
  .ring {
    position: relative;
    flex: none;
    width: 44px;
    height: 44px;
  }
  svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }
  circle {
    fill: none;
    stroke-width: 3;
  }
  .track {
    stroke: var(--overlay);
  }
  .arc {
    stroke: var(--accent);
    stroke-linecap: round;
  }
  .secs {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-weight: 700;
  }
  .text {
    flex: 1;
    min-width: 0;
  }
  /* one line each, cut short on a narrow window: the footer keeps its height */
  p {
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chords {
    font-size: var(--text-xs);
    color: var(--subtle);
  }
</style>
