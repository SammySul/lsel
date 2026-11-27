<!-- A keyboard-driven grid of tiles that fills the height it is given and pages instead of growing. -->
<script lang="ts" generics="T">
import type { Snippet } from "svelte";
import Empty from "./Empty.svelte";
import { keyName, keys } from "./keys.svelte.ts";

interface Action {
  key: string;
  label: string;
  run(item: T): void;
}

interface Props {
  items: readonly T[];
  id: (item: T) => string;
  /** The selected tile's id, kept in step with what is shown; a tile that goes away hands it on. */
  selected?: string | undefined;
  label: string;
  /** One tile: the item, and whether it is the selected one. */
  tile: Snippet<[T, boolean]>;
  /** Shown instead of the tiles when there are none: why, and the key that fills it. */
  empty: Snippet;
  /** Enter, or a click on the selected tile. */
  onopen?: (item: T) => void;
  /** Any tile clicked opens at once: one tap on a phone, where a preview takes the grid's place. */
  openOnClick?: boolean;
  /** Keys for the selected tile; a function when they depend on it. */
  actions?: readonly Action[] | ((item: T) => readonly Action[]);
  /** Beside the pager, on its line: a count, the selected tile's detail. */
  foot?: Snippet;
  /** Shows its keys under the page's title. */
  hint?: boolean;
  /** The narrowest a tile may be, in px: the width decides how many fit in a row. */
  min?: number;
  /** A tile's height over its width, as near as the rows allow: 1.25 is 4:5, a portrait photo. */
  ratio?: number;
}

let {
  items,
  id,
  selected = $bindable(),
  label,
  tile,
  empty,
  onopen,
  openOnClick = false,
  actions = [],
  foot,
  hint = false,
  min = 140,
  ratio = 1.25,
}: Props = $props();

// where the selection was, so a tile that goes away hands it to its neighbor, not the first
let last = 0;
const index = $derived.by(() => {
  const found = items.findIndex((item) => id(item) === selected);
  return found !== -1 ? found : Math.min(last, Math.max(0, items.length - 1));
});
const current = $derived(items[index]);

$effect(() => {
  // no tiles (a filter matching nothing, items still loading) keeps the selection for later
  if (current === undefined) return;
  last = index;
  if (id(current) !== selected) selected = id(current);
});

// until measured nothing is drawn, so the first tiles never resize in place
let shape = $state<{ cols: number; rows: number; height: number } | null>(null);
const size = $derived(shape === null ? 1 : shape.cols * shape.rows);
const pages = $derived(Math.max(1, Math.ceil(items.length / size)));
const page = $derived(Math.floor(index / size));
const start = $derived(page * size);
const visible = $derived(items.slice(start, start + size));

let area: HTMLDivElement | undefined = $state();

$effect(() => {
  // unmounting sets the bound element to null
  if (!area) return;
  const box = area;
  const fit = () => {
    const gap = Number.parseFloat(getComputedStyle(box).rowGap) || 0;
    const width = box.clientWidth;
    const height = box.clientHeight;
    if (width === 0 || height === 0) return;
    // columns from the narrowest a tile may be; rows whose tiles come closest to the ratio, filling the height
    const cols = Math.max(1, Math.floor((width + gap) / (min + gap)));
    const wide = (width - gap * (cols - 1)) / cols;
    const exact = (height + gap) / (wide * ratio + gap);
    const off = (rows: number) => {
      const tall = (height - gap * (rows - 1)) / rows;
      return Math.abs(Math.log(tall / wide / ratio));
    };
    const rows = [Math.floor(exact), Math.ceil(exact)]
      .filter((r) => r >= 1)
      .reduce((a, b) => (off(b) < off(a) ? b : a), 1);
    const best = { cols, rows, height: Math.floor((height - gap * (rows - 1)) / rows) };
    if (shape?.cols !== best.cols || shape.rows !== best.rows || shape.height !== best.height) {
      shape = best;
    }
  };
  // a frame later: resizing inside the observer's own callback is a loop WebKit reports
  let frame = 0;
  const later = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fit);
  };
  const observer = new ResizeObserver(later);
  observer.observe(box);
  fit();
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
  };
});

function select(i: number): void {
  const item = items[Math.min(items.length - 1, Math.max(0, i))];
  if (item !== undefined) selected = id(item);
}

function click(event: MouseEvent, i: number): void {
  // a control in the tile does its own thing
  if (
    event.target instanceof Element &&
    event.target.closest("button, a, input, label, select, textarea")
  )
    return;
  const item = items[i];
  if (item !== undefined && (openOnClick || i === index)) {
    select(i);
    onopen?.(item);
  } else select(i);
}

const tileActions = $derived(
  current === undefined ? [] : typeof actions === "function" ? actions(current) : actions,
);
const cols = $derived(shape?.cols ?? 1);

keys(() =>
  items.length === 0
    ? []
    : [
        { key: ["l", "ArrowRight"], label: "Next", run: () => select(index + 1) },
        { key: ["h", "ArrowLeft"], label: "Previous", run: () => select(index - 1) },
        { key: ["j", "ArrowDown"], label: "Down a row", hint, run: () => select(index + cols) },
        { key: ["k", "ArrowUp"], label: "Up a row", run: () => select(index - cols) },
        { key: "g", label: "First", run: () => select(0) },
        { key: "G", label: "Last", run: () => select(items.length - 1) },
        ...(pages > 1
          ? [
              { key: "PageDown", label: "Next page", hint, run: () => select(index + size) },
              { key: "PageUp", label: "Previous page", run: () => select(index - size) },
            ]
          : []),
        ...(onopen
          ? [
              {
                key: "Enter",
                label: "Open",
                hint,
                run: () => current !== undefined && onopen(current),
              },
            ]
          : []),
        ...tileActions.map((a) => ({
          key: a.key,
          label: a.label,
          run: () => current !== undefined && a.run(current),
        })),
      ],
);
</script>

<div class="lsel-grid">
  <div class="area" bind:this={area}>
    {#if items.length === 0}
      <Empty>{@render empty()}</Empty>
    {:else if shape !== null}
      <ul
        aria-label={label}
        style:grid-template-columns="repeat({shape.cols}, minmax(0, 1fr))"
        style:grid-auto-rows="{shape.height}px"
      >
        {#each visible as item, i (id(item))}
          <!-- the keys above are the keyboard way in; a click is the pointer's -->
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
          <li aria-current={start + i === index} onclick={(e) => click(e, start + i)}>
            {@render tile(item, start + i === index)}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  <!-- always there, so the grid's height never depends on how many pages it has -->
  <div class="pager">
    <div class="foot">{#if foot}{@render foot()}{/if}</div>
    <button type="button" disabled={page === 0} onclick={() => select(index - size)}
      >‹ <kbd>{keyName("PageUp")}</kbd></button
    >
    <span>Page {page + 1} of {pages}</span>
    <button type="button" disabled={page >= pages - 1} onclick={() => select(index + size)}
      ><kbd>{keyName("PageDown")}</kbd> ›</button
    >
  </div>
</div>

<style>
  .lsel-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    height: 100%;
    min-height: 0;
  }
  .area {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    row-gap: var(--space-2);
  }
  ul {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    position: relative;
    min-width: 0;
    overflow: hidden;
    background: var(--raise);
    border: 2px solid var(--overlay);
    cursor: default;
    transition: border-color var(--motion-fast) var(--ease);
  }
  li[aria-current="true"] {
    border-color: var(--accent);
  }
  .pager {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    color: var(--subtle);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .foot {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* as wide as "Page 10 of 10", so a growing count never moves the button after it */
  .pager span {
    min-width: 11ch;
    text-align: center;
  }
  /* on a phone the detail gets its own line, always there, so the pager keeps one height */
  @media (max-width: 600px) {
    .pager {
      flex-wrap: wrap;
      justify-content: flex-end;
      row-gap: var(--space-1);
    }
    .foot {
      flex-basis: 100%;
      min-height: 1lh;
    }
  }
</style>
