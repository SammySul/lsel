<!-- A keyboard-driven list: j/k to move, Enter to open, and per-row actions. -->
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
  /** The selected row's id, kept in step with what is shown; a row that goes away hands it on. */
  selected?: string | undefined;
  label: string;
  row: Snippet<[T, boolean]>;
  /** Shown instead of the list when it is empty: why, and the key that fills it. */
  empty: Snippet;
  /** Enter, or a click on the selected row. */
  onopen?: (item: T) => void;
  /** Keys for the selected row; a function when they depend on the row. */
  actions?: readonly Action<T>[] | ((item: T) => readonly Action<T>[]);
  /** Column headings, aligned with the rows. */
  head?: Snippet;
  /** Beside the pager, on its line: a count, the selected row's detail. */
  foot?: Snippet;
  /** Shows its keys under the page's title. */
  hint?: boolean;
  /** Rows per page, every row as tall as the tallest, so the height never changes; "fit" fills the window. */
  pageSize?: number | "fit";
}

let {
  items,
  id,
  selected = $bindable(),
  label,
  row,
  empty,
  onopen,
  actions = [],
  head,
  foot,
  hint = false,
  pageSize,
}: Props = $props();

const s = selection(
  () => ({ items, id, selected, actions }),
  (next) => (selected = next),
);

// a fitted page is never shorter than this, so a small window scrolls instead
const FIT_MIN = 3;
let fitted = $state(10);
const size = $derived(pageSize === "fit" ? fitted : (pageSize ?? Math.max(1, items.length)));
const pages = $derived(Math.max(1, Math.ceil(items.length / size)));
const page = $derived(Math.floor(s.index / size));
const start = $derived(page * size);
const visible = $derived(items.slice(start, start + size));
// an empty fitted list keeps its height: the empty line takes one row, fillers the rest
const fillers = $derived(
  pageSize === undefined ? 0 : size - visible.length - (items.length === 0 ? 1 : 0),
);

const rows: HTMLElement[] = $state([]);
let list: HTMLUListElement | undefined = $state();

$effect(() => {
  // unmounting sets the bound list to null
  if (pageSize !== "fit" || !list) return;
  const ul = list;
  // the page is main, its margins included; html and body may be sized to the window
  const page = ul.closest("main") ?? document.body;
  return refit(page, () => {
    if (ul.children.length === 0) return;
    // the rows are all one height (grid-auto-rows: 1fr), fillers included
    const row = ul.offsetHeight / ul.children.length;
    const style = getComputedStyle(page);
    const height =
      page.getBoundingClientRect().height +
      Number.parseFloat(style.marginTop) +
      Number.parseFloat(style.marginBottom);
    // everything but the rows: the room the rows have left is the window less that
    const rest = height - ul.offsetHeight;
    fitted = Math.max(FIT_MIN, Math.floor((document.documentElement.clientHeight - rest) / row));
  });
});

$effect(() => {
  rows[s.index - start]?.scrollIntoView({ block: "nearest" });
});

// the empty line's whole text, for when it is cut short
function titled(el: HTMLElement) {
  const set = () => {
    el.title = el.textContent?.trim() ?? "";
  };
  set();
  const observer = new MutationObserver(set);
  observer.observe(el, { subtree: true, childList: true, characterData: true });
  return () => observer.disconnect();
}

keys(() =>
  items.length === 0
    ? []
    : [
        {
          key: ["j", "ArrowDown"],
          label: "Next",
          hint,
          inField: "search",
          run: () => s.select(s.index + 1),
        },
        {
          key: ["k", "ArrowUp"],
          label: "Previous",
          inField: "search",
          run: () => s.select(s.index - 1),
        },
        { key: "g", label: "First", run: () => s.select(0) },
        { key: "G", label: "Last", run: () => s.select(items.length - 1) },
        ...(pages > 1
          ? [
              {
                key: ["l", "PageDown"],
                label: "Next page",
                hint,
                run: () => s.select(s.index + size),
              },
              { key: ["h", "PageUp"], label: "Previous page", run: () => s.select(s.index - size) },
            ]
          : []),
        ...s.keys(onopen, { hint, inField: "search" }),
      ],
);
</script>

{#if items.length === 0 && pageSize === undefined}
  <Empty>{@render empty()}</Empty>
{:else}
  {#if head}<div class="head" aria-hidden="true">{@render head()}</div>{/if}
  <ul class="lsel-list" class:paged={pageSize !== undefined} aria-label={label} bind:this={list}>
    {#if items.length === 0}<li class="filler blank" {@attach titled}><Empty>{@render empty()}</Empty></li>{/if}
    {#each visible as item, i (id(item))}
      <!-- the keys above are the keyboard way in; a click is the pointer's -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
      <li bind:this={rows[i]} aria-current={start + i === s.index} onclick={(e) => s.click(e, start + i, onopen)}>
        {@render row(item, start + i === s.index)}
      </li>
    {/each}
    {#each { length: fillers }, i (i)}
      <li class="filler" aria-hidden="true">&nbsp;</li>
    {/each}
  </ul>
  {#if pageSize !== undefined}
    <Pager
      {page}
      {pages}
      previous="h"
      next="l"
      onprevious={() => s.select(s.index - size)}
      onnext={() => s.select(s.index + size)}
      {foot}
    />
  {/if}
{/if}

<style>
  .lsel-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* a page's rows all as tall as the tallest, fillers too, so the fitted count and the height hold */
  .paged {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-auto-rows: 1fr;
  }
  li,
  .head {
    padding: var(--space-2) var(--space-3);
    border-bottom: var(--border);
    border-left: 2px solid transparent;
  }
  .head {
    color: var(--subtle);
    font-size: var(--text-xs);
  }
  li {
    cursor: default;
    transition: border-color var(--motion-fast) var(--ease);
  }
  li[aria-current="true"] {
    border-left-color: var(--accent);
  }
  .filler {
    border-bottom-color: transparent;
    cursor: auto;
  }
  /* one line, like a plain row: a wrapped one would set every row's height */
  .blank :global(.lsel-empty) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
