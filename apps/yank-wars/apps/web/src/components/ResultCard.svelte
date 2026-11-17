<script lang="ts">
import { formatKeys } from "@yank-wars/engine";
import { formatClock } from "../lib/clock.ts";
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
let copied = $state<"idle" | "ok" | "failed">("idle");
let shared = $state<"idle" | "ok" | "failed">("idle");

const puzzle = $derived(ctl.puzzle);
const locked = $derived(ctl.phase === "locked");
const headline = $derived(locked ? "Locked in" : ctl.phase === "expired" ? "Time's up" : "Gave up");
const deltaText = $derived(
  ctl.delta > 0 ? `+${ctl.delta} over par` : ctl.delta < 0 ? `${-ctl.delta} under par` : "on par",
);
const source = $derived(puzzle.source);

async function copy() {
  try {
    await navigator.clipboard.writeText(ctl.notation);
    copied = "ok";
  } catch {
    copied = "failed";
  }
}

async function share() {
  try {
    await navigator.clipboard.writeText(shareText(puzzle, ctl.keys, ctl.elapsed, location.origin));
    shared = "ok";
  } catch {
    shared = "failed";
  }
}

// A held key repeats into the card; Ctrl/Alt/Meta combos belong to the browser and the UI chords.
function onkeydown(e: KeyboardEvent) {
  if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (key === "Enter") onNext();
  else if (key === "r") onRetry();
  else if (key === "s") showSolution = !showSolution;
  else if (key === "c") void copy();
  else if (key === "y" && locked) void share();
  else if (key === "Escape") onList();
  else return;
  e.preventDefault();
}
</script>

<svelte:window {onkeydown} />

<div class="backdrop">
  <div class="card lsel-appear" role="dialog" aria-labelledby="result-headline">
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
        <dd>{formatClock(ctl.elapsed)}</dd>
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
            {ctl.bestBefore.keys} keys in {formatClock(ctl.bestBefore.ms)}
          {:else}
            –
          {/if}
        </dd>
      </div>
    </dl>

    <div class="notation">
      <div class="row">
        <span class="label">{locked ? "Your solution" : "Final run"}</span>
        <button onclick={copy}>
          {copied === "ok" ? "Copied" : copied === "failed" ? "Copy failed" : "Copy"} <kbd>c</kbd>
        </button>
      </div>
      <pre>{ctl.notation || "(no keys)"}</pre>
    </div>

    <details bind:open={showSolution}>
      <summary>Par solution ({puzzle.par} keys) <kbd>s</kbd></summary>
      <pre>{formatKeys(puzzle.solution)}</pre>
    </details>

    <p class="source">
      {#if source.kind === "original"}
        Original puzzle by {source.author}
      {:else}
        From
        {#if source.url.startsWith("https://")}
          <a href={source.url} target="_blank" rel="noreferrer">{source.repo}</a>
        {:else}
          {source.repo}
        {/if}
        <code>{source.path}</code> at <code>{source.commit.slice(0, 7)}</code>, {source.license}
      {/if}
    </p>

    {#if import.meta.env.DEV && ctl.selfCheck !== "off"}
      <p class="selfcheck {ctl.selfCheck}">DEV self-check: {ctl.selfCheck}</p>
    {/if}

    <div class="actions">
      {#if locked}
        <button class="share" onclick={share}>
          {shared === "ok" ? "Copied" : shared === "failed" ? "Copy failed" : "Share"} <kbd>y</kbd>
        </button>
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
    font-size: var(--text-lg);
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
    padding: 8px 12px;
    white-space: pre-wrap;
    word-break: break-all;
    user-select: text;
    background: var(--base);
    border: 1px solid var(--overlay);
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
