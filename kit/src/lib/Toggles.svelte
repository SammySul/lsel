<!-- Toggles that may arrive late, on a fixed number of lines (two on a phone), paging with [ and ] when they don't fit. -->
<script lang="ts">
import { refit } from "./fit.ts";
import { keys } from "./keys.svelte.ts";
import { pack } from "./toggles.ts";

interface Props {
  items: readonly string[];
  /** The pressed ones. */
  pressed: readonly string[];
  /** Names the group, and its page keys under `?`: "Players". */
  label: string;
  ontoggle: (item: string) => void;
}

let { items, pressed, label, ontoggle }: Props = $props();

// each page's line starts, measured; until then one line, its toggles shrinking to the row
let layout: number[][] = $state([[0]]);
let lineCount = $state(1);
let wanted = $state(0);
const pages = $derived(layout.length);
const page = $derived(Math.min(wanted, pages - 1));
// every line drawn, empty ones too, so the pager keeps its place on the last
const lines = $derived.by(() => {
  const starts = layout[page] ?? [0];
  const end = layout[page + 1]?.[0] ?? items.length;
  return Array.from({ length: Math.max(lineCount, starts.length) }, (_, i) => {
    const from = starts[i];
    return from === undefined ? [] : items.slice(from, starts[i + 1] ?? end);
  });
});

const turn = (by: number) => {
  wanted = Math.max(0, Math.min(pages - 1, page + by));
};

let box: HTMLDivElement | undefined = $state();
let ruler: HTMLDivElement | undefined = $state();

$effect(() => {
  // unmounting sets the bound elements to null
  if (!box || !ruler) return;
  const row = box;
  const all = ruler;
  // read here so new items are measured again
  void items;
  return refit(row, () => {
    const style = getComputedStyle(row);
    const room = {
      width: row.clientWidth,
      gap: Number.parseFloat(style.rowGap) || 0,
      pager: all.querySelector(".pager")?.getBoundingClientRect().width ?? 0,
      lines: Number.parseInt(style.getPropertyValue("--lines"), 10) || 1,
    };
    const widths = [...all.querySelectorAll(".item")].map((b) => b.getBoundingClientRect().width);
    const next = pack(widths, room);
    if (JSON.stringify(next) !== JSON.stringify(layout)) layout = next;
    if (room.lines !== lineCount) lineCount = room.lines;
  });
});

keys(() =>
  pages > 1
    ? [
        { key: "]", label: `Next ${label.toLowerCase()}`, run: () => turn(1) },
        { key: "[", label: `Previous ${label.toLowerCase()}`, run: () => turn(-1) },
      ]
    : [],
);
</script>

<div class="lsel-toggles" role="group" aria-label={label} bind:this={box}>
  {#each lines as line, i (i)}
    <div class="line">
      {#each line as item (item)}
        <button type="button" class="item" aria-pressed={pressed.includes(item)} onclick={() => ontoggle(item)}
          >{item}</button
        >
      {/each}
      {#if pages > 1 && i === lines.length - 1}
        <div class="pager">
          <button
            type="button"
            aria-label="Previous {label.toLowerCase()}"
            disabled={page === 0}
            onclick={() => turn(-1)}>‹ <kbd>[</kbd></button
          >
          <span>{page + 1}/{pages}</span>
          <button
            type="button"
            aria-label="Next {label.toLowerCase()}"
            disabled={page >= pages - 1}
            onclick={() => turn(1)}><kbd>]</kbd> ›</button
          >
        </div>
      {/if}
    </div>
  {/each}
  <!-- every toggle and the pager at their natural widths, unseen, to page by -->
  <div class="ruler-box" aria-hidden="true" inert>
    <div class="ruler" bind:this={ruler}>
      {#each items as item (item)}<button type="button" class="item" tabindex="-1">{item}</button>{/each}
      <div class="pager">
        <button type="button" tabindex="-1">‹ <kbd>[</kbd></button><span></span><button
          type="button"
          tabindex="-1"><kbd>]</kbd> ›</button
        >
      </div>
    </div>
  </div>
</div>

<style>
  /* its lines kept from the start, before the toggles arrive (DESIGN.md, Layout) */
  .lsel-toggles {
    --lines: 1;
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }
  /* a phone's row holds two or three: a second line halves the pages */
  @media (max-width: 600px) {
    .lsel-toggles {
      --lines: 2;
    }
  }
  .line {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    min-height: var(--control-height);
  }
  /* only a toggle wider than its line shrinks, cut with an ellipsis */
  .item {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pager {
    display: flex;
    flex: none;
    gap: var(--space-2);
    align-items: center;
    margin-left: auto;
    color: var(--subtle);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  /* as wide as "10/10", so a page count never moves the buttons */
  .pager > span {
    min-width: 5ch;
    text-align: center;
  }
  .ruler-box {
    position: absolute;
    inset: 0;
    overflow: hidden;
    visibility: hidden;
    pointer-events: none;
  }
  .ruler {
    display: flex;
    gap: var(--space-2);
    width: max-content;
  }
  .ruler .item {
    flex: none;
  }
</style>
