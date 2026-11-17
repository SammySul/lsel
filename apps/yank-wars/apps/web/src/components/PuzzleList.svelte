<script lang="ts">
import { DIFFICULTIES, type Difficulty } from "@yank-wars/engine";
import { untrack } from "svelte";
import { version } from "../../../../package.json";
import { CHORD_LABELS } from "../lib/chords.ts";
import { formatClock } from "../lib/clock.ts";
import { prefs } from "../lib/prefs.svelte.ts";
import { markOf, progressOf } from "../lib/progress.ts";
import { puzzleErrors, puzzles, visiblePuzzles } from "../lib/puzzles.ts";

interface Props {
  selected?: string | undefined;
  missing?: string | undefined;
}

let { selected, missing }: Props = $props();

const filter = $derived(prefs.filter);
const shown = $derived(visiblePuzzles());
const progress = $derived(progressOf(puzzles, prefs.best));
let selectedId = $state(untrack(() => selected));
const index = $derived(
  Math.max(
    0,
    shown.findIndex((p) => p.id === selectedId),
  ),
);
const current = $derived(shown[index]);
const rows: HTMLAnchorElement[] = $state([]);
let search: HTMLInputElement | undefined = $state();

$effect(() => {
  rows[index]?.scrollIntoView({ block: "nearest" });
});

function move(by: number) {
  const i = Math.min(shown.length - 1, Math.max(0, index + by));
  selectedId = shown[i]?.id;
}

function open() {
  if (current !== undefined) location.hash = `#/p/${current.id}`;
}

function setDifficulty(d: Difficulty | null) {
  prefs.filter = { ...filter, difficulty: filter.difficulty === d ? null : d };
}

function onkeydown(e: KeyboardEvent) {
  if (e.ctrlKey || e.altKey || e.metaKey || puzzles.length === 0) return;
  if (e.target === search) {
    if (e.key === "ArrowDown") move(1);
    else if (e.key === "ArrowUp") move(-1);
    else if (e.key === "Enter") open();
    else if (e.key === "Escape") {
      if (filter.query !== "") prefs.filter = { ...filter, query: "" };
      else search?.blur();
    } else return;
    e.preventDefault();
    return;
  }
  if (e.key === "j" || e.key === "ArrowDown") move(1);
  else if (e.key === "k" || e.key === "ArrowUp") move(-1);
  else if (e.key === "Enter") open();
  else if (e.key === "/") search?.focus();
  else if (e.key === "0") setDifficulty(null);
  else if (e.key === "1" || e.key === "2" || e.key === "3") {
    setDifficulty(DIFFICULTIES[Number(e.key) - 1] ?? null);
  } else if (e.key === "u") prefs.filter = { ...filter, unsolved: !filter.unsolved };
  else return;
  e.preventDefault();
}
</script>

<svelte:window {onkeydown} />

<main class="list">
  <header>
    <h1>Yank Wars</h1>
    <p class="tagline">Vim golf against the clock. Fewest keys wins.</p>
    <ol class="how">
      <li>Make your buffer match the target, using vim.</li>
      <li>Every keystroke counts. Match par, or beat it.</li>
      <li>
        It locks in the moment it matches. <kbd>{CHORD_LABELS.reset}</kbd> starts over,
        <kbd>{CHORD_LABELS.forfeit}</kbd> gives up.
      </li>
    </ol>
    {#if progress.solved > 0}
      <p class="progress">
        {progress.solved} of {puzzles.length} solved · {progress.parOrBetter} at par or better
      </p>
    {/if}
  </header>

  {#if missing}
    <p class="notice">No puzzle called <code>{missing}</code>.</p>
  {/if}

  {#if puzzles.length === 0}
    <p class="notice">No puzzles found in <code>puzzles/handmade/</code>.</p>
  {:else}
    <div class="filters">
      <div class="chips" role="group" aria-label="Difficulty">
        <button
          class="chip"
          aria-pressed={filter.difficulty === null}
          onclick={() => setDifficulty(null)}>All</button
        >
        {#each DIFFICULTIES as d (d)}
          <button
            class="chip {d}"
            aria-pressed={filter.difficulty === d}
            onclick={() => setDifficulty(d)}>{d}</button
          >
        {/each}
        <button
          class="chip"
          aria-pressed={filter.unsolved}
          onclick={() => (prefs.filter = { ...filter, unsolved: !filter.unsolved })}
          >Unsolved</button
        >
      </div>
      <input
        bind:this={search}
        class="search"
        type="search"
        placeholder="/ search"
        aria-label="Search puzzles"
        spellcheck="false"
        autocomplete="off"
        value={filter.query}
        oninput={(e) => (prefs.filter = { ...filter, query: e.currentTarget.value })}
      />
    </div>

    <div class="table">
      <div class="row head" aria-hidden="true">
        <span>Puzzle</span><span>Language</span><span class="num">Par</span><span
          >Difficulty</span
        ><span class="num">Your best</span>
      </div>
      <ol>
        {#each shown as p, i (p.id)}
          {@const best = prefs.best[p.id]}
          <li>
            <a
              class="row"
              class:selected={i === index}
              href="#/p/{p.id}"
              bind:this={rows[i]}
              onfocus={() => (selectedId = p.id)}
              onmouseenter={() => (selectedId = p.id)}
            >
              <span class="title">{p.title}</span>
              <span class="lang">{p.language}</span>
              <span class="num">{p.par}</span>
              <span class="diff {p.difficulty}">{p.difficulty}</span>
              <span class="num best" class:none={!best}>
                {#if best}
                  {@const mark = markOf(best, p.par)}
                  <span class="mark {mark}" title={mark === "under" ? "under par" : mark === "par" ? "par" : ""}
                    >{mark === "under" ? "★ " : ""}{best.keys}</span
                  >
                  <small>in {formatClock(best.ms)}</small>
                {:else}–{/if}
              </span>
            </a>
          </li>
        {:else}
          <li class="empty">No puzzles match. <kbd>0</kbd> shows every difficulty, <kbd>Esc</kbd> in the search clears it.</li>
        {/each}
      </ol>
    </div>
    <p class="detail">
      {current?.description ?? ""}
      {#if current?.tags?.length}<span class="tags">{current.tags.join(" · ")}</span>{/if}
    </p>
    <p class="count">{shown.length} of {puzzles.length} puzzles</p>
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

  <footer>
    <p>
      <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>Enter</kbd> play · <kbd>/</kbd> search ·
      <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> difficulty, <kbd>0</kbd> all · <kbd>u</kbd> unsolved
    </p>
    <p class="meta">
      Yank Wars <span class="version">v{version}</span> ·
      <a href="https://github.com/SammySul/yank-wars">source</a> · MIT
    </p>
  </footer>
</main>

<style>
  .list {
    max-width: 760px;
    margin: 0 auto;
    padding: 48px 24px;
  }
  h1 {
    margin: 0;
    font-family: var(--font);
    font-size: var(--text-xl);
    letter-spacing: -0.02em;
  }
  .tagline {
    margin: 4px 0 16px;
    color: var(--subtle);
  }
  .how {
    margin: 0 0 24px;
    padding-left: 20px;
    color: var(--subtle);
    line-height: 1.6;
  }
  .progress {
    margin: 0 0 16px;
    font-family: var(--font);
    font-size: var(--text-sm);
  }
  .mark.under,
  .mark.par {
    color: var(--success);
  }
  .notice {
    color: var(--warning);
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .chips {
    display: flex;
    gap: 6px;
  }
  .chip {
    padding: 4px 10px;
    border: 1px solid var(--overlay);
    background: transparent;
    color: var(--subtle);
    font: inherit;
    font-size: var(--text-xs);
    text-transform: capitalize;
    cursor: pointer;
  }
  .chip[aria-pressed="true"] {
    border-color: var(--accent);
    color: var(--text);
  }
  .search {
    flex: 1 1 220px;
    max-width: 300px;
    padding: 5px 10px;
    border: 1px solid var(--overlay);
    background: var(--base);
    color: var(--text);
    font: inherit;
    font-size: var(--text-sm);
  }
  .search:focus {
    outline: none;
    border-color: var(--accent);
  }
  .diff {
    font-size: var(--text-xs);
    text-transform: capitalize;
  }
  .easy {
    color: var(--success);
  }
  .medium {
    color: var(--warning);
  }
  .hard {
    color: var(--error);
  }
  .chip.easy,
  .chip.medium,
  .chip.hard {
    color: var(--subtle);
  }
  .chip.easy[aria-pressed="true"] {
    color: var(--success);
  }
  .chip.medium[aria-pressed="true"] {
    color: var(--warning);
  }
  .chip.hard[aria-pressed="true"] {
    color: var(--error);
  }
  .empty {
    padding: 16px;
    color: var(--subtle);
  }
  .tags {
    margin-left: 8px;
    font-family: var(--font);
    font-size: var(--text-xs);
  }
  .count {
    margin: 0;
    color: var(--subtle);
    font-size: var(--text-xs);
  }
  .table {
    border: 1px solid var(--overlay);
    overflow: hidden;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr 110px 50px 80px 130px;
    gap: 12px;
    align-items: baseline;
    padding: 10px 16px;
    color: var(--text);
    border-left: 3px solid transparent;
  }
  ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .table li {
    border-top: 1px solid var(--overlay);
  }
  .row:hover {
    text-decoration: none;
  }
  .head {
    background: var(--raise);
    color: var(--subtle);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .selected {
    border-left-color: var(--accent);
  }
  .title {
    font-weight: 700;
  }
  .lang {
    color: var(--subtle);
    font-family: var(--font);
    font-size: var(--text-xs);
  }
  .num {
    text-align: right;
    font-family: var(--font);
    font-variant-numeric: tabular-nums;
  }
  .best small {
    color: var(--subtle);
  }
  .none {
    color: var(--subtle);
  }
  .detail {
    min-height: 1.4em;
    color: var(--subtle);
  }
  .errors h2 {
    font-size: var(--text-sm);
    color: var(--error);
  }
  .errors pre {
    white-space: pre-wrap;
    background: var(--raise);
    border: 1px solid var(--overlay);
    padding: 8px 12px;
    font-size: var(--text-xs);
  }
  footer {
    margin-top: 32px;
    color: var(--subtle);
    font-size: var(--text-xs);
  }
  footer p {
    margin: 0 0 8px;
  }
</style>
