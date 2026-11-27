<!-- The card after a room round: who won, the series and rematch. -->
<script lang="ts">
import { duration, keys } from "@sammysul/lsel";
import { formatKeys, type PlayerView, type Seat } from "@yank-wars/engine";
import { findPuzzle } from "../lib/puzzles.ts";
import type { RoomClient } from "../lib/room.svelte.ts";
import ResultFrame, { fresh } from "./ResultFrame.svelte";

let { room, onLeave }: { room: RoomClient; onLeave(): void } = $props();

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

keys(() => [
  { key: "r", label: "Rematch", run: fresh(() => room.rematch()) },
  { key: "Escape", label: "Leave the room", run: fresh(onLeave) },
]);
</script>

<ResultFrame {headline} ok={last?.winner === room.seat} selfCheck={room.ctl?.selfCheck ?? "off"}>
  {#snippet stats()}
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
  {/snippet}

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

  <p class="rematch" role="status">
    {#if them === null}
      The other player left.
    {:else if me?.rematch}
      Waiting for {them.name}…
    {:else if them.rematch}
      {them.name} wants a rematch.
    {/if}
  </p>

  {#snippet actions()}
    <button onclick={() => room.rematch()} disabled={them === null || me?.rematch}
      >Rematch <kbd>r</kbd></button
    >
    <button onclick={onLeave}>Leave <kbd>Esc</kbd></button>
  {/snippet}
</ResultFrame>

<style>
  .winner dd {
    color: var(--success);
    font-weight: 700;
  }
  .series {
    font-size: var(--text-xl);
    font-weight: 700;
  }
  .notation .label {
    display: block;
    margin-bottom: var(--space-1);
  }
  .rematch {
    min-height: 1lh;
    color: var(--subtle);
  }
</style>
