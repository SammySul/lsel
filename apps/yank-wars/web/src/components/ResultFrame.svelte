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
    <h2 id="result-headline" class:ok>{headline}</h2>
    <dl class="stats">{@render stats()}</dl>
    {@render children()}
    {#if import.meta.env.DEV && selfCheck !== "off"}
      <p class="selfcheck {selfCheck}">DEV self-check: {selfCheck}</p>
    {/if}
    <div class="actions">{@render actions()}</div>
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
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: 8px 16px;
    margin: 0 0 16px;
  }
  .stats :global(dt) {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--subtle);
  }
  .stats :global(dd) {
    margin: 0;
    font-family: var(--font);
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
    margin: 0 0 12px;
    user-select: text;
  }
  .card :global(details pre) {
    margin-top: 6px;
  }
  .selfcheck {
    font-family: var(--font);
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
    gap: 8px;
    justify-content: flex-end;
    margin-top: 16px;
  }
</style>
