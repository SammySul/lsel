<!-- The bar above the editors: puzzle, key count against par, clock, grace and the opponent. -->
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

<section class="hud" aria-label="Round">
  <div class="left">
    <a class="back" href="#/">← Puzzles</a>
    <h2>{ctl.puzzle.title}</h2>
    <span class="chip">{ctl.puzzle.language}</span>
    <span class="chip {ctl.puzzle.difficulty}">{ctl.puzzle.difficulty}</span>
  </div>

  <div class="score" class:over={ctl.delta > 0}>
    <span class="keys">{ctl.keys}</span>
    <span class="par">/ par {ctl.puzzle.par}</span>
    {#if ctl.delta > 0}<span class="delta">+{ctl.delta}</span>{/if}
  </div>

  <div class="right">
    <div class="time">
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
    </div>
    <div class="actions">
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
        title={CHORD_LABELS.forfeit}>Give up <kbd>{CHORD_LABELS.forfeit}</kbd></button
      >
      <button
        onmousedown={keepFocus}
        onclick={() => {
          ctl.toggleNumbers();
          ctl.focus();
        }}
        aria-pressed={ctl.prefs.relativeNumbers}
        title={CHORD_LABELS.numbers}
        >{ctl.prefs.relativeNumbers ? "Relative" : "Absolute"} numbers <kbd>{CHORD_LABELS.numbers}</kbd></button
      >
    </div>
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
</section>

<style>
  .hud {
    position: relative;
    display: grid;
    /* the score stays centered while the buttons fit beside it; the title gives way first */
    grid-template-columns: minmax(0, 1fr) auto minmax(max-content, 1fr);
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-2) var(--space-4) var(--space-3);
    background: var(--raise);
    border: var(--border);
  }
  .left,
  .right,
  .time,
  .actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }
  .right {
    justify-content: flex-end;
  }
  /* below MIN_WIDTH (lib/device.ts) the bar stacks: title, then score and clock, then the buttons */
  @media (max-width: 719px) {
    .hud {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas: "left left" "score time" "actions actions";
      gap: var(--space-2) var(--space-3);
      padding: var(--space-2) var(--space-3) var(--space-3);
    }
    .left {
      grid-area: left;
    }
    .score {
      grid-area: score;
    }
    .right {
      display: contents;
    }
    .time {
      grid-area: time;
    }
    .actions {
      grid-area: actions;
      display: grid;
      grid-template-columns: auto auto minmax(0, 1fr);
      gap: var(--space-1);
    }
    .actions button {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* the keys are listed under the title; a narrow bar keeps the buttons' words */
    .actions kbd {
      display: none;
    }
  }
  .actions button,
  .time {
    white-space: nowrap;
  }
  .back {
    color: var(--subtle);
    font-size: var(--text-xs);
    white-space: nowrap;
  }
  h2 {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chip {
    font-size: var(--text-xs);
    color: var(--subtle);
    border: var(--border);
    padding: 0 var(--space-2);
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
    gap: var(--space-2);
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
    gap: var(--space-3);
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
