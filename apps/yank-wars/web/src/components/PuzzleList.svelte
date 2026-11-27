<!-- The puzzle list with filter, search and each puzzle's best. -->
<script lang="ts">
import { duration, go, keys, List, Page } from "@sammysul/lsel";
import { DIFFICULTIES, type Difficulty } from "@yank-wars/engine";
import { untrack } from "svelte";
import { version } from "../../../package.json";
import { CHORD_LABELS } from "../lib/chords.ts";
import { dailyAt, streakOf } from "../lib/daily.ts";
import { prefs } from "../lib/prefs.svelte.ts";
import { markOf, progressOf } from "../lib/progress.ts";
import { puzzleErrors, puzzles, quickPlay, visiblePuzzles } from "../lib/puzzles.ts";

interface Props {
  selected?: string | undefined;
  missing?: string | undefined;
}

let { selected, missing }: Props = $props();

const filter = $derived(prefs.filter);
const shown = $derived(visiblePuzzles());
const progress = $derived(progressOf(puzzles, prefs.best));
let selectedId = $state(untrack(() => selected));
const current = $derived(shown.find((p) => p.id === selectedId) ?? shown[0]);
let search: HTMLInputElement | undefined = $state();
const daily = dailyAt(puzzles, Date.now());
const solvedToday = $derived(daily !== undefined && prefs.daily.includes(daily.day));
const streak = $derived(daily === undefined ? 0 : streakOf(prefs.daily, daily.day));

function setDifficulty(d: Difficulty | null) {
  prefs.filter = { ...filter, difficulty: filter.difficulty === d ? null : d };
}

function toggleUnsolved() {
  prefs.filter = { ...filter, unsolved: !filter.unsolved };
}

keys(() =>
  puzzles.length === 0
    ? []
    : [
        { key: "p", label: "Quick play", hint: true, run: quickPlay },
        { key: "d", label: "Daily", hint: true, run: () => go("/daily") },
        { key: "/", label: "Search", hint: true, run: () => search?.focus() },
        {
          key: ["1", "2", "3"],
          label: "Difficulty",
          hint: true,
          run: (e) => setDifficulty(DIFFICULTIES[Number(e.key) - 1] ?? null),
        },
        { key: "0", label: "All difficulties", hint: true, run: () => setDifficulty(null) },
        { key: "u", label: "Unsolved only", hint: true, run: toggleUnsolved },
        { key: "f", label: "Play a friend", hint: true, run: () => go("/r") },
      ],
);
</script>

<Page
  name="Yank Wars"
  sub="Vim golf against the clock. Fewest keys wins."
  {version}
  source="https://git.sammysul.com/SammySul/lsel/src/branch/main/apps/yank-wars"
  width={760}
>
  <div class="intro">
    <ol class="how">
      <li>Make your buffer match the target, using vim.</li>
      <li>Every keystroke counts. Match par, or beat it.</li>
      <li>
        It locks in the moment it matches. <kbd>{CHORD_LABELS.reset}</kbd> starts over,
        <kbd>{CHORD_LABELS.forfeit}</kbd> gives up.
      </li>
    </ol>
    <p class="start">
      <button onclick={quickPlay} disabled={shown.length === 0}>Quick play <kbd>p</kbd></button>
      {#if daily !== undefined}
        <button onclick={() => go("/daily")}
          >Daily #{daily.day}{solvedToday ? " ✓" : ""} <kbd>d</kbd></button
        >
      {/if}
      <button onclick={() => go("/r")}>Play a friend <kbd>f</kbd></button>
      {#if streak > 0}<span class="aside">{streak}-day streak</span>{/if}
    </p>
    {#if progress.solved > 0}
      <p class="progress">
        {progress.solved} of {puzzles.length} solved · {progress.parOrBetter} at par or better
      </p>
    {/if}
  </div>

  {#if missing}
    <p class="notice">No puzzle called <code>{missing}</code>.</p>
  {/if}

  {#if puzzles.length === 0}
    <p class="notice">No puzzles found in <code>puzzles/handmade/</code>.</p>
  {:else}
    <div class="browse">
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
          <button class="chip" aria-pressed={filter.unsolved} onclick={toggleUnsolved}
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
        <List
          items={shown}
          id={(p) => p.id}
          bind:selected={selectedId}
          label="Puzzles"
          onopen={(p) => go(`/p/${p.id}`)}
          hint
          pageSize="fit"
        >
          {#snippet head()}
            <div class="row heading">
              <span>Puzzle</span><span>Language</span><span class="num">Par</span><span
                >Difficulty</span
              ><span class="num">Your best</span>
            </div>
          {/snippet}
          {#snippet row(p)}
            {@const best = prefs.best[p.id]}
            <a class="row" href="#/p/{p.id}" onfocus={() => (selectedId = p.id)}>
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
                  <small>in {duration(best.ms, "m:ss.t")}</small>
                {:else}–{/if}
              </span>
            </a>
          {/snippet}
          {#snippet foot()}
            <p class="detail">
              <span class="about"
                >{current?.description ?? ""}
                {#if current?.tags?.length}<span class="tags">{current.tags.join(" · ")}</span
                  >{/if}</span
              >
              <span class="count">{shown.length} of {puzzles.length} puzzles</span>
            </p>
          {/snippet}
          {#snippet empty()}
            No puzzles match. <kbd>0</kbd> shows every difficulty, <kbd>Esc</kbd> in the search clears it.
          {/snippet}
        </List>
      </div>
    </div>
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
</Page>

<style>
  .how {
    margin: 0;
    padding-left: 20px;
    color: var(--subtle);
    line-height: 1.6;
  }
  .start {
    display: flex;
    margin: 0;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .aside {
    color: var(--subtle);
  }
  .progress {
    margin: 0;
    font-size: var(--text-sm);
  }
  .mark.under,
  .mark.par {
    color: var(--success);
  }
  .notice {
    margin: 0;
    color: var(--warning);
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    align-items: center;
    justify-content: space-between;
  }
  .chips {
    display: flex;
    gap: 6px;
  }
  .chip {
    text-transform: capitalize;
  }
  .search {
    flex: 1 1 220px;
    max-width: 300px;
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
    color: var(--text);
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
  .tags {
    margin-left: 8px;
    font-size: var(--text-xs);
  }
  /* each group's parts sit closer than the page's sections, so the list gets the height */
  .intro,
  .browse {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  /* one line, whatever the puzzle: a wrap would change the page's height, and so its rows */
  .about {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .count {
    flex: none;
    color: var(--subtle);
    font-size: var(--text-xs);
  }
  .row {
    display: grid;
    grid-template-columns: 1fr 110px 50px 80px 130px;
    gap: 12px;
    align-items: baseline;
    color: var(--text);
  }
  .row:hover {
    text-decoration: none;
  }
  .row.heading {
    color: inherit;
  }
  .title {
    font-weight: 700;
  }
  .lang {
    color: var(--subtle);
    font-size: var(--text-xs);
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .best small {
    color: var(--subtle);
  }
  .none {
    color: var(--subtle);
  }
  .detail {
    display: flex;
    gap: var(--space-4);
    justify-content: space-between;
    align-items: baseline;
    margin: 0;
    font-size: var(--text-sm);
    color: var(--subtle);
  }
  .errors h2 {
    color: var(--error);
  }
  .errors pre {
    margin-top: 8px;
  }
</style>
