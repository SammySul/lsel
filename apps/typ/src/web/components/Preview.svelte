<!-- The sample text in every font shown, side by side, as many as fit and paged through the rest. -->
<script lang="ts">
import { Action, Empty, keys } from "@sammysul/lsel";
import { untrack } from "svelte";
import { clampSize, prefs, SIZE } from "../lib/prefs.ts";
import { SAMPLE } from "../lib/sample.ts";

let { names }: { names: string[] } = $props();

let text = $state(SAMPLE);

// a column's least width, and the gap between columns (--space-3)
const COLUMN = 280;
const GAP = 12;

let width = $state(0);
let first = $state(0);
const perPage = $derived(Math.max(1, Math.floor((width + GAP) / (COLUMN + GAP))));
const start = $derived(Math.max(0, Math.min(first, names.length - perPage)));
const columns = $derived(names.slice(start, start + perPage));
const turn = (by: 1 | -1) =>
  (first = Math.max(0, Math.min(start + by * perPage, names.length - perPage)));

// a font that comes into view, added or ticked, is paged to
let seen = untrack(() => names);
$effect.pre(() => {
  const fresh = names.findIndex((n) => !seen.includes(n));
  seen = names;
  if (fresh !== -1) first = fresh;
});

const resize = (by: number) => (prefs.value.size = clampSize(prefs.value.size + by));

keys(() => [
  { key: "-", label: "Smaller", run: () => resize(-2) },
  { key: ["=", "+"], label: "Larger", run: () => resize(2) },
  ...(names.length > perPage
    ? [
        { key: "]", label: "Next fonts", run: () => turn(1) },
        { key: "[", label: "Previous fonts", run: () => turn(-1) },
      ]
    : []),
]);
</script>

<section class="preview" aria-label="Preview" bind:clientWidth={width}>
  <div class="controls">
    <div class="size">
      <label>
        Size
        <input type="range" min={SIZE.min} max={SIZE.max} bind:value={prefs.value.size} />
      </label>
      <span class="px">{prefs.value.size} px</span>
      <span class="keys"><kbd>-</kbd> <kbd>=</kbd></span>
    </div>
    <Action label="Reset text" key="r" disabled={text === SAMPLE} run={() => (text = SAMPLE)} />
    {#if names.length > perPage}
      <div class="pages">
        <button type="button" disabled={start === 0} onclick={() => turn(-1)}>‹ <kbd>[</kbd></button>
        <span>{start + 1}{columns.length > 1 ? `–${start + columns.length}` : ""} of {names.length}</span>
        <button type="button" disabled={start + perPage >= names.length} onclick={() => turn(1)}
          ><kbd>]</kbd> ›</button
        >
      </div>
    {/if}
  </div>

  {#if names.length === 0}
    <Empty>No fonts selected. Tick one in the list.</Empty>
  {:else}
    <div class="columns">
      {#each columns as name (name)}
        <div class="column lsel-appear">
          <span class="label">{name}</span>
          <textarea
            bind:value={text}
            spellcheck="false"
            aria-label="Preview in {name}"
            style:font-family={`"${name}", var(--font)`}
            style:font-size={`${prefs.value.size}px`}
          ></textarea>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .preview {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3) var(--space-5);
    align-items: center;
  }
  .size,
  .size label,
  .pages {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }
  .size label,
  .pages {
    color: var(--subtle);
  }
  .px {
    min-width: 6ch;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  /* as wide as "10–12 of 12", so a growing count never moves the button after it */
  .pages span {
    min-width: 11ch;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }
  .columns {
    display: flex;
    flex: 1;
    gap: var(--space-3);
  }
  .column {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }
  .label {
    overflow: hidden;
    color: var(--subtle);
    font-size: var(--text-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* a floor, not a size: the row's height comes from the fitted list beside it */
  textarea {
    flex: 1 1 0;
    min-height: 10rem;
    resize: none;
  }
  /* a touch screen has no keys to press */
  @media (pointer: coarse) {
    .keys {
      display: none;
    }
  }
  /* a phone: first, and Reset and the pager share a line */
  @media (max-width: 720px) {
    .preview {
      order: -1;
    }
    .controls {
      column-gap: var(--space-3);
    }
  }
</style>
