<!-- A keyboard-driven list: j/k to move, Enter to open, and per-row actions. -->
<script lang="ts" generics="T">
import type { Snippet } from "svelte";
import Empty from "./Empty.svelte";
import { keys } from "./keys.svelte.ts";

interface Action {
  key: string;
  label: string;
  run(item: T): void;
}

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
  actions?: readonly Action[] | ((item: T) => readonly Action[]);
  /** Column headings, aligned with the rows. */
  head?: Snippet;
  /** Beside the pager, on its line: a count, the selected row's detail. */
  foot?: Snippet;
  /** Shows its keys in the page footer. */
  hint?: boolean;
  /**
   * Rows per page; the list always holds a full page, so its height never changes with the items.
   * "fit" shows as many as fit in the window, so the page never scrolls.
   */
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

// where the selection was, so a row that goes away hands it to its neighbor, not the first row
let last = 0;
const index = $derived.by(() => {
  const found = items.findIndex((item) => id(item) === selected);
  return found !== -1 ? found : Math.min(last, Math.max(0, items.length - 1));
});
const current = $derived(items[index]);

$effect(() => {
  // an empty list (a search matching nothing, items still loading) keeps the selection for later
  if (current === undefined) return;
  last = index;
  if (id(current) !== selected) selected = id(current);
});
// a fitted page is never shorter than this, so a small window scrolls instead
const FIT_MIN = 3;
let fitted = $state(10);
const size = $derived(pageSize === "fit" ? fitted : (pageSize ?? Math.max(1, items.length)));
const pages = $derived(Math.max(1, Math.ceil(items.length / size)));
const page = $derived(Math.floor(index / size));
const start = $derived(page * size);
const visible = $derived(items.slice(start, start + size));
const fillers = $derived(pageSize === undefined ? 0 : size - visible.length);

const rows: HTMLElement[] = $state([]);
let list: HTMLUListElement | undefined = $state();

$effect(() => {
  // unmounting sets the bound list to null
  if (pageSize !== "fit" || !list) return;
  const ul = list;
  // the page is main, its margins included; html and body may be sized to the window
  const page = ul.closest("main") ?? document.body;
  const fit = () => {
    if (ul.children.length === 0) return;
    const row = ul.offsetHeight / ul.children.length;
    const style = getComputedStyle(page);
    const height =
      page.getBoundingClientRect().height +
      Number.parseFloat(style.marginTop) +
      Number.parseFloat(style.marginBottom);
    // everything but the rows: the room the rows have left is the window less that
    const rest = height - ul.offsetHeight;
    fitted = Math.max(FIT_MIN, Math.floor((document.documentElement.clientHeight - rest) / row));
  };
  // a frame later: resizing the page inside the observer's own callback is a loop WebKit reports
  let frame = 0;
  const later = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fit);
  };
  const observer = new ResizeObserver(later);
  observer.observe(page);
  addEventListener("resize", later);
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    removeEventListener("resize", later);
  };
});

$effect(() => {
  rows[index - start]?.scrollIntoView({ block: "nearest" });
});

function select(i: number): void {
  const item = items[Math.min(items.length - 1, Math.max(0, i))];
  if (item !== undefined) selected = id(item);
}

function click(event: MouseEvent, i: number): void {
  // a control in the row does its own thing
  if (
    event.target instanceof Element &&
    event.target.closest("button, a, input, label, select, textarea")
  )
    return;
  if (i === index && current !== undefined) onopen?.(current);
  else select(i);
}

const rowActions = $derived(
  current === undefined ? [] : typeof actions === "function" ? actions(current) : actions,
);

keys(() =>
  items.length === 0
    ? []
    : [
        {
          key: ["j", "ArrowDown"],
          label: "Next",
          hint,
          inField: "search",
          run: () => select(index + 1),
        },
        {
          key: ["k", "ArrowUp"],
          label: "Previous",
          inField: "search",
          run: () => select(index - 1),
        },
        { key: "g", label: "First", run: () => select(0) },
        { key: "G", label: "Last", run: () => select(items.length - 1) },
        ...(pages > 1
          ? [
              { key: ["l", "PageDown"], label: "Next page", hint, run: () => select(index + size) },
              { key: ["h", "PageUp"], label: "Previous page", run: () => select(index - size) },
            ]
          : []),
        ...(onopen
          ? [
              {
                key: "Enter",
                label: "Open",
                hint,
                inField: "search" as const,
                run: () => current !== undefined && onopen(current),
              },
            ]
          : []),
        ...rowActions.map((a) => ({
          key: a.key,
          label: a.label,
          run: () => current !== undefined && a.run(current),
        })),
      ],
);
</script>

{#if items.length === 0}
  <Empty>{@render empty()}</Empty>
{:else}
  {#if head}<div class="head" aria-hidden="true">{@render head()}</div>{/if}
  <ul class="lsel-list" aria-label={label} bind:this={list}>
    {#each visible as item, i (id(item))}
      <!-- the keys above are the keyboard way in; a click is the pointer's -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
      <li bind:this={rows[i]} aria-current={start + i === index} onclick={(e) => click(e, start + i)}>
        {@render row(item, start + i === index)}
      </li>
    {/each}
    {#each { length: fillers }, i (i)}
      <li class="filler" aria-hidden="true">&nbsp;</li>
    {/each}
  </ul>
  {#if pageSize !== undefined}
    <div class="pager">
      {#if foot}<div class="foot">{@render foot()}</div>{/if}
      <button type="button" disabled={page === 0} onclick={() => select(index - size)}
        >‹ <kbd>h</kbd></button
      >
      <span>Page {page + 1} of {pages}</span>
      <button type="button" disabled={page === pages - 1} onclick={() => select(index + size)}
        ><kbd>l</kbd> ›</button
      >
    </div>
  {/if}
{/if}

<style>
  .lsel-list {
    margin: 0;
    padding: 0;
    list-style: none;
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
  .pager {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    justify-content: flex-end;
    padding-top: var(--space-2);
    color: var(--subtle);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }
  .foot {
    flex: 1;
    min-width: 0;
  }
</style>
