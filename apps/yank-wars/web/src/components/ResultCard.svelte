<!-- The card after a solo round: score against par, best, retry and next. -->
<script lang="ts">
import { Action, duration, go, keys } from "@sammysul/lsel";
import { formatKeys } from "@yank-wars/engine";
import { quickPlay } from "../lib/puzzles.ts";
import type { RoundController } from "../lib/round.svelte.ts";
import { shareText } from "../lib/share.ts";
import ResultFrame, { fresh } from "./ResultFrame.svelte";

interface Props {
  ctl: RoundController;
  onNext(): void;
  onRetry(): void;
  onList(): void;
}

let { ctl, onNext, onRetry, onList }: Props = $props();

let showSolution = $state(false);

const puzzle = $derived(ctl.puzzle);
const locked = $derived(ctl.phase === "locked");
const headline = $derived(locked ? "Locked in" : ctl.phase === "expired" ? "Time's up" : "Gave up");
const deltaText = $derived(
  ctl.delta > 0 ? `+${ctl.delta} over par` : ctl.delta < 0 ? `${-ctl.delta} under par` : "on par",
);

keys(() => [
  { key: "Enter", label: "Next puzzle", run: fresh(onNext) },
  { key: "r", label: "Retry", run: fresh(onRetry) },
  { key: "s", label: "Par solution", run: fresh(() => (showSolution = !showSolution)) },
  { key: "Escape", label: "Puzzles", run: fresh(onList) },
  { key: "f", label: "Play a friend", run: fresh(() => go("/r")) },
  { key: "p", label: "Quick play", run: fresh(quickPlay) },
]);
</script>

<ResultFrame {headline} ok={locked} selfCheck={ctl.selfCheck}>
  {#snippet stats()}
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
  {/snippet}

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

  {#snippet actions()}
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
    <button onclick={() => go("/r")}>Play a friend <kbd>f</kbd></button>
    <button onclick={onList}>Puzzles <kbd>Esc</kbd></button>
  {/snippet}
</ResultFrame>

<style>
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
  .source {
    font-size: var(--text-xs);
    color: var(--subtle);
  }
  .share {
    margin-right: auto;
  }
</style>
