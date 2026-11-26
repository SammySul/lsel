<!-- The card after a room round: who won, the series and rematch. -->
<script lang="ts">
import { duration, keys } from "@sammysul/lsel";
import { formatKeys, type PlayerView, type Seat } from "@yank-wars/engine";
import { onMount } from "svelte";
import { findPuzzle } from "../lib/puzzles.ts";
import type { RoomClient } from "../lib/room.svelte.ts";

let { room, onLeave }: { room: RoomClient; onLeave(): void } = $props();

let card: HTMLElement | undefined = $state();

const view = $derived(room.view);
const me = $derived(room.me);
const them = $derived(room.them);
const last = $derived(view?.last ?? null);
const seats = $derived(room.seat === null ? [] : ([room.seat, 1 - room.seat] as Seat[]));
const puzzle = $derived(last === null ? undefined : findPuzzle(last.puzzleId));
const headline = $derived(
  last === null || last.winner === null
    ? "Draw"
    : last.winner === room.seat
      ? "You win"
      : `${them?.name ?? "They"} wins`,
);
const series = $derived(
  view === null || room.seat === null
    ? ""
    : `${view.tally[room.seat]}–${view.tally[1 - room.seat]}`,
);

function outcome(p: PlayerView): string {
  if (p.status === "locked" && p.lockedAfter !== null) {
    return `${p.score} keys in ${duration(p.lockedAfter, "m:ss.t")}`;
  }
  return p.status === "forfeited" ? "gave up" : "didn't finish";
}

// The editor swallows every key, so the card takes focus for its own.
onMount(() => card?.focus());

const fresh = (run: () => void) => (e: KeyboardEvent) => {
  if (!e.repeat) run();
};

keys(() => [
  { key: "r", label: "Rematch", run: fresh(() => room.rematch()) },
  { key: "Escape", label: "Leave the room", run: fresh(onLeave) },
]);
</script>

<div class="backdrop">
  <div
    class="card lsel-appear"
    role="dialog"
    aria-labelledby="room-headline"
    tabindex="-1"
    bind:this={card}
  >
    <h2 id="room-headline" class:ok={last?.winner === room.seat}>{headline}</h2>

    <dl class="stats">
      {#each seats as s (s)}
        {@const p = view?.players[s]}
        {#if p}
          <div class:winner={last?.winner === s}>
            <dt>{p.name}{s === room.seat ? " (you)" : ""}</dt>
            <dd>{outcome(p)}</dd>
          </div>
        {/if}
      {/each}
      <div>
        <dt>Series</dt>
        <dd class="series">{series}</dd>
      </div>
    </dl>

    {#if room.ctl !== null}
      <div class="notation">
        <span class="label">Your last run</span>
        <pre>{room.ctl.notation || "(no keys)"}</pre>
      </div>
    {/if}
    {#if puzzle !== undefined}
      <details>
        <summary>Par solution ({puzzle.par} keys)</summary>
        <pre>{formatKeys(puzzle.solution)}</pre>
      </details>
    {/if}

    {#if import.meta.env.DEV && room.ctl !== null && room.ctl.selfCheck !== "off"}
      <p class="selfcheck {room.ctl.selfCheck}">DEV self-check: {room.ctl.selfCheck}</p>
    {/if}

    <p class="rematch" role="status">
      {#if them === null}
        The other player left.
      {:else if me?.rematch}
        Waiting for {them.name}…
      {:else if them.rematch}
        {them.name} wants a rematch.
      {/if}
    </p>

    <div class="actions">
      <button onclick={() => room.rematch()} disabled={them === null || me?.rematch}
        >Rematch <kbd>r</kbd></button
      >
      <button onclick={onLeave}>Leave <kbd>Esc</kbd></button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 16px;
  }
  .card {
    width: min(560px, 100%);
    max-height: 100%;
    overflow: auto;
    padding: 20px 24px;
    background: var(--base);
    border: 1px solid var(--overlay);
  }
  h2 {
    margin: 0 0 12px;
    color: var(--warning);
  }
  h2.ok {
    color: var(--success);
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 8px 16px;
    margin: 0 0 16px;
  }
  dt {
    font-size: var(--text-xs);
    color: var(--subtle);
  }
  dd {
    margin: 0;
    font-family: var(--font);
    font-variant-numeric: tabular-nums;
  }
  .winner dd {
    color: var(--success);
    font-weight: 700;
  }
  .series {
    font-size: var(--text-xl);
    font-weight: 700;
  }
  .label,
  summary {
    font-size: var(--text-xs);
    color: var(--subtle);
  }
  summary {
    cursor: pointer;
  }
  pre {
    margin: 4px 0 12px;
    user-select: text;
  }
  .selfcheck {
    font-family: var(--font);
    font-size: var(--text-xs);
  }
  .selfcheck.ok {
    color: var(--success);
  }
  .selfcheck.mismatch {
    color: var(--error);
  }
  .rematch {
    min-height: 1.4em;
    color: var(--subtle);
  }
  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
</style>
