<script lang="ts">
import { Action, duration, keys } from "@sammysul/lsel";
import { formatKeys } from "@yank-wars/engine";
import { onMount } from "svelte";
import type { RoundController } from "../lib/round.svelte.ts";
import { shareText } from "../lib/share.ts";

interface Props {
  ctl: RoundController;
  onNext(): void;
  onRetry(): void;
  onList(): void;
}

let { ctl, onNext, onRetry, onList }: Props = $props();

let showSolution = $state(false);
let card: HTMLElement | undefined = $state();

const puzzle = $derived(ctl.puzzle);
const locked = $derived(ctl.phase === "locked");
const headline = $derived(locked ? "Locked in" : ctl.phase === "expired" ? "Time's up" : "Gave up");
const deltaText = $derived(
  ctl.delta > 0 ? `+${ctl.delta} over par` : ctl.delta < 0 ? `${-ctl.delta} under par` : "on par",
);

// The editor swallows every key, so the card takes focus for its own.
onMount(() => card?.focus());

// A key held through the lock-in repeats into the card: only a fresh press counts.
const fresh = (run: () => void) => (e: KeyboardEvent) => {
  if (!e.repeat) run();
};

keys(() => [
  { key: "Enter", label: "Next puzzle", run: fresh(onNext) },
  { key: "r", label: "Retry", run: fresh(onRetry) },
  { key: "s", label: "Par solution", run: fresh(() => (showSolution = !showSolution)) },
  { key: "Escape", label: "Puzzles", run: fresh(onList) },
]);
</script>

<div class="backdrop">
  <div
    class="card lsel-appear"
    role="dialog"
    aria-labelledby="result-headline"
    tabindex="-1"
    bind:this={card}
  >
    <h2 id="result-headline" class:ok={locked}>{headline}</h2>

    <dl class="stats">
      {#if locked}
        <div>
          <dt>Keys</dt>
          <dd>
            <span class="big">{ctl.keys}</span> / par {puzzle.par}
            <span class="delta" class:over={ctl.delta > 0} class:under={ctl.delta < 0}
              >{deltaText}</span
            >
          </dd>
        </div>
      {/if}
      <div>
        <dt>Time</dt>
        <dd>{duration(ctl.elapsed, "m:ss.t")}</dd>
      </div>
      <div>
        <dt>Runs</dt>
        <dd>{ctl.round.runs}</dd>
      </div>
      <div>
        <dt>Your best</dt>
        <dd>
          {#if ctl.newBest}
            <span class="under">New best</span>
          {:else if ctl.bestBefore}
            {ctl.bestBefore.keys} keys in {duration(ctl.bestBefore.ms, "m:ss.t")}
          {:else}
            –
          {/if}
        </dd>
      </div>
    </dl>

    <div class="notation">
      <div class="row">
        <span class="label">{locked ? "Your solution" : "Final run"}</span>
        <Action
          label="Copy"
          key="c"
          done="Copied"
          failed="Copy failed"
          run={() => navigator.clipboard.writeText(ctl.notation)}
        />
      </div>
      <pre>{ctl.notation || "(no keys)"}</pre>
    </div>

    <details bind:open={showSolution}>
      <summary>Par solution ({puzzle.par} keys) <kbd>s</kbd></summary>
      <pre>{formatKeys(puzzle.solution)}</pre>
    </details>

    <p class="source">Original puzzle by {puzzle.source.author}</p>

    {#if import.meta.env.DEV && ctl.selfCheck !== "off"}
      <p class="selfcheck {ctl.selfCheck}">DEV self-check: {ctl.selfCheck}</p>
    {/if}

    <div class="actions">
      {#if locked}
        <span class="share">
          <Action
            label="Share"
            key="y"
            done="Copied"
            failed="Copy failed"
            run={() =>
              navigator.clipboard.writeText(
                shareText(puzzle, ctl.keys, ctl.elapsed, location.origin),
              )}
          />
        </span>
      {/if}
      <button onclick={onNext}>Next <kbd>Enter</kbd></button>
      <button onclick={onRetry}>Retry <kbd>r</kbd></button>
      <button onclick={onList}>Puzzles <kbd>Esc</kbd></button>
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
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: 8px 16px;
    margin: 0 0 16px;
  }
  dt {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--subtle);
  }
  dd {
    margin: 0;
    font-family: var(--font);
    font-variant-numeric: tabular-nums;
  }
  .big {
    font-size: var(--text-xl);
    font-weight: 700;
  }
  .delta {
    display: block;
    font-size: var(--text-xs);
  }
  .over {
    color: var(--warning);
  }
  .under {
    color: var(--success);
  }
  .notation .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
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
    margin: 0 0 12px;
    user-select: text;
  }
  details pre {
    margin-top: 6px;
  }
  .source {
    font-size: var(--text-xs);
    color: var(--subtle);
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
  .share {
    margin-right: auto;
  }
</style>
