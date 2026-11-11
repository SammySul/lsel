<script lang="ts">
import { untrack } from "svelte";
import { formatClock } from "../lib/clock.ts";
import { prefs } from "../lib/prefs.svelte.ts";
import { puzzleErrors, puzzles } from "../lib/puzzles.ts";

interface Props {
  selected?: string | undefined;
  missing?: string | undefined;
}

let { selected, missing }: Props = $props();

let index = $state(
  untrack(() =>
    Math.max(
      0,
      puzzles.findIndex((p) => p.id === selected),
    ),
  ),
);
const rows: HTMLAnchorElement[] = $state([]);
const current = $derived(puzzles[index]);

$effect(() => {
  rows[index]?.scrollIntoView({ block: "nearest" });
});

function open(i: number) {
  const p = puzzles[i];
  if (p !== undefined) location.hash = `#/p/${p.id}`;
}

function onkeydown(e: KeyboardEvent) {
  if (e.ctrlKey || e.altKey || e.metaKey || puzzles.length === 0) return;
  if (e.key === "j" || e.key === "ArrowDown") index = Math.min(puzzles.length - 1, index + 1);
  else if (e.key === "k" || e.key === "ArrowUp") index = Math.max(0, index - 1);
  else if (e.key === "Enter") open(index);
  else return;
  e.preventDefault();
}
</script>

<svelte:window {onkeydown} />

<main class="list">
  <header>
    <h1>Yank Wars</h1>
    <p class="tagline">Vim golf against the clock. Fewest keys wins.</p>
  </header>

  {#if missing}
    <p class="notice">No puzzle called <code>{missing}</code>.</p>
  {/if}

  {#if puzzles.length === 0}
    <p class="notice">No puzzles found in <code>puzzles/handmade/</code>.</p>
  {:else}
    <div class="table">
      <div class="row head" aria-hidden="true">
        <span>Puzzle</span><span>Language</span><span class="num">Par</span><span class="num"
          >Lines</span
        ><span class="num">Your best</span>
      </div>
      <ol>
        {#each puzzles as p, i (p.id)}
          {@const best = prefs.best[p.id]}
          <li>
            <a
              class="row"
              class:selected={i === index}
              href="#/p/{p.id}"
              bind:this={rows[i]}
              onfocus={() => (index = i)}
              onmouseenter={() => (index = i)}
            >
              <span class="title">{p.title}</span>
              <span class="lang">{p.language}</span>
              <span class="num">{p.par}</span>
              <span class="num">{p.start.split("\n").length}</span>
              <span class="num best" class:none={!best}>
                {#if best}{best.keys} <small>in {formatClock(best.ms)}</small>{:else}–{/if}
              </span>
            </a>
          </li>
        {/each}
      </ol>
    </div>
    <p class="detail">{current?.description ?? ""}</p>
  {/if}

  {#if puzzleErrors.length > 0}
    <section class="errors">
      <h2>{puzzleErrors.length} puzzle file{puzzleErrors.length === 1 ? "" : "s"} failed to load</h2>
      {#each puzzleErrors as err (err.file)}
        <pre><strong>{err.file}</strong>
{err.message}</pre>
      {/each}
    </section>
  {/if}

  <footer><kbd>j</kbd>/<kbd>k</kbd> move · <kbd>Enter</kbd> play</footer>
</main>

<style>
  .list {
    max-width: 760px;
    margin: 0 auto;
    padding: 48px 24px;
  }
  h1 {
    margin: 0;
    font-family: var(--mono);
    font-size: 32px;
    letter-spacing: -0.02em;
  }
  .tagline {
    margin: 4px 0 32px;
    color: var(--muted);
  }
  .notice {
    color: var(--warn);
  }
  .table {
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr 110px 50px 50px 130px;
    gap: 12px;
    align-items: baseline;
    padding: 10px 16px;
    color: var(--fg);
    border-left: 3px solid transparent;
  }
  ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    border-top: 1px solid var(--border);
  }
  .row:hover {
    text-decoration: none;
  }
  .head {
    background: var(--panel);
    color: var(--muted);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .selected {
    background: var(--panel);
    border-left-color: var(--cursor);
  }
  .title {
    font-weight: 600;
  }
  .lang {
    color: var(--muted);
    font-family: var(--mono);
    font-size: 12px;
  }
  .num {
    text-align: right;
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
  }
  .best small {
    color: var(--muted);
  }
  .none {
    color: var(--muted);
  }
  .detail {
    min-height: 1.4em;
    color: var(--muted);
  }
  .errors h2 {
    font-size: 14px;
    color: var(--bad);
  }
  .errors pre {
    white-space: pre-wrap;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 12px;
  }
  footer {
    margin-top: 32px;
    color: var(--muted);
    font-size: 12px;
  }
</style>
