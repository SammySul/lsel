<!-- A keyboard-driven grid of tiles that fills the height it is given and pages instead of growing. -->
<script lang="ts" generics="T">
import type { Snippet } from "svelte";
import Empty from "./Empty.svelte";
import { refit } from "./fit.ts";
import { keys } from "./keys.svelte.ts";
import Pager from "./Pager.svelte";
import { type Action, selection } from "./selection.svelte.ts";

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
  /** Keys for the selected tile. */
  actions?: readonly Action<T>[];
  /** Beside the pager, or on a line of its own when the pager is narrow: a count, the selected tile's detail. */
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

// until measured nothing is drawn, so the first tiles never resize in place
let shape = $state<{ cols: number; rows: number; height: number } | null>(null);
const cols = $derived(shape?.cols ?? 1);

const s = selection(
  () => ({
    items,
    id,
    selected,
    actions,
    size: shape === null ? 1 : shape.cols * shape.rows,
    open: onopen,
    openOnClick,
  }),
  (next) => (selected = next),
);

let area: HTMLDivElement | undefined = $state();

$effect(() => {
  // unmounting sets the bound element to null
  if (!area) return;
  const box = area;
  return refit(box, () => {
    // the tiles' gap, read before the tiles exist
    const gap = Number.parseFloat(getComputedStyle(box).getPropertyValue("--space-2")) || 0;
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
  });
});

keys(() =>
  s.keys({
    hint,
    move: [
      { key: ["l", "ArrowRight"], label: "Next", run: () => s.select(s.index + 1) },
      { key: ["h", "ArrowLeft"], label: "Previous", run: () => s.select(s.index - 1) },
      { key: ["j", "ArrowDown"], label: "Down a row", hint, run: () => s.select(s.index + cols) },
      { key: ["k", "ArrowUp"], label: "Up a row", run: () => s.select(s.index - cols) },
    ],
    next: ["PageDown"],
    previous: ["PageUp"],
  }),
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
        {#each s.visible as item, i (id(item))}
          <!-- the keys above are the keyboard way in; a click is the pointer's -->
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
          <li aria-current={s.start + i === s.index} onclick={(e) => s.click(e, i)}>
            {@render tile(item, s.start + i === s.index)}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  <!-- always there, so the grid's height never depends on how many pages it has -->
  <Pager
    page={s.page}
    pages={s.pages}
    previous="PageUp"
    next="PageDown"
    onprevious={() => s.turn(-1)}
    onnext={() => s.turn(1)}
    {foot}
  />
</div>

<style>
  .lsel-grid {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .area {
    flex: 1;
    min-height: 0;
    overflow: hidden;
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
</style>
