<!-- The frame both result cards share: the card over the round with its headline, stats, the DEV self-check and actions. -->
<script module lang="ts">
/** A key held through the lock-in repeats into the card: only a fresh press counts. */
export const fresh = (run: () => void) => (e: KeyboardEvent) => {
  if (!e.repeat) run();
};
</script>

<script lang="ts">
import { onMount, type Snippet } from "svelte";
import type { SelfCheck } from "../lib/round.svelte.ts";

interface Props {
  headline: string;
  /** the headline in the success color */
  ok: boolean;
  stats: Snippet;
  actions: Snippet;
  selfCheck: SelfCheck;
  children: Snippet;
}

let { headline, ok, stats, actions, selfCheck, children }: Props = $props();

let card: HTMLElement | undefined = $state();

// The editor swallows every key, so the card takes focus for its own.
onMount(() => card?.focus());
</script>

<div class="backdrop">
  <div
    class="card lsel-appear"
    role="dialog"
    aria-labelledby="result-headline"
    tabindex="-1"
    bind:this={card}
  >
    <div class="body">
      <h2 id="result-headline" class:ok>{headline}</h2>
      <dl class="stats">{@render stats()}</dl>
      {@render children()}
      {#if import.meta.env.DEV && selfCheck !== "off"}
        <p class="selfcheck {selfCheck}">DEV self-check: {selfCheck}</p>
      {/if}
    </div>
    <div class="actions">{@render actions()}</div>
  </div>
</div>

<style>
  /* flex, not grid: the card's max-height resolves against the round's height, not a row sized to the card */
  .backdrop {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  /* the actions stay at the card's foot; what doesn't fit above them scrolls */
  .card {
    display: flex;
    flex-direction: column;
    width: min(560px, 100%);
    max-height: 100%;
    background: var(--base);
    border: var(--border);
  }
  .body {
    min-height: 0;
    overflow: auto;
    padding: var(--space-4) var(--space-4) 0;
  }
  h2 {
    margin: 0 0 var(--space-3);
    color: var(--warning);
  }
  h2.ok {
    color: var(--success);
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: var(--space-2) var(--space-4);
    margin: 0 0 var(--space-4);
  }
  .stats :global(dt) {
    font-size: var(--text-xs);
    color: var(--subtle);
  }
  .stats :global(dd) {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .card :global(.label),
  .card :global(summary) {
    font-size: var(--text-xs);
    color: var(--subtle);
  }
  .card :global(summary) {
    cursor: pointer;
  }
  .card :global(pre) {
    margin: 0 0 var(--space-3);
    user-select: text;
  }
  .card :global(details pre) {
    margin-top: var(--space-2);
  }
  .selfcheck {
    font-size: var(--text-xs);
  }
  .selfcheck.ok {
    color: var(--success);
  }
  .selfcheck.pending {
    color: var(--subtle);
  }
  .selfcheck.mismatch {
    color: var(--error);
  }
  .actions {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    gap: var(--space-2);
    justify-content: flex-end;
    padding: var(--space-3) var(--space-4) var(--space-4);
    border-top: var(--border);
  }
</style>
