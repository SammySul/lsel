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
  /** Any row clicked opens at once. */
  openOnClick?: boolean;
  /** Keys for the selected row. */
  actions?: readonly Action<T>[];
  /** Column headings, aligned with the rows. */
  head?: Snippet;
  /** Beside the pager, or on a line of its own when the pager is narrow: a count, the selected row's detail. */
  foot?: Snippet;
  /** Shows its keys under the page's title. */
  hint?: boolean;
  /** Fills the window's height (in a `Page fill`, the height left in the page) and pages instead of growing, every row as tall as the tallest. */
  fit?: boolean;
}

let {
  items,
  id,
  selected = $bindable(),
  label,
  row,
  empty,
  onopen,
  openOnClick = false,
  actions = [],
  head,
  foot,
  hint = false,
  fit = false,
}: Props = $props();

// a fitted page is never shorter than this, so a small window scrolls instead
const FIT_MIN = 3;
let fitted = $state(10);

const s = selection(
  () => ({
    items,
    id,
    selected,
    actions,
    size: fit ? fitted : Math.max(1, items.length),
    open: onopen,
    openOnClick,
  }),
  (next) => (selected = next),
);

// an empty fitted list keeps its height: the empty line takes one row, fillers the rest
const fillers = $derived(fit ? fitted - s.visible.length - (items.length === 0 ? 1 : 0) : 0);

const rows: HTMLElement[] = $state([]);
let list: HTMLUListElement | undefined = $state();

/** The room inside `box` its children leave empty, negative when they overflow it. */
function free(box: Element): number {
  const style = getComputedStyle(box);
  const inner =
    box.clientHeight - Number.parseFloat(style.paddingTop) - Number.parseFloat(style.paddingBottom);
  const shown = [...box.children].filter((c) => c.getClientRects().length > 0);
  if (shown.length === 0) return inner;
  const rects = shown.map((c) => c.getBoundingClientRect());
  return inner - (Math.max(...rects.map((r) => r.bottom)) - Math.min(...rects.map((r) => r.top)));
}

$effect(() => {
  // unmounting sets the bound list to null
  if (!fit || !list) return;
  const ul = list;
  // the page is main, its margins included; html and body may be sized to the window
  const page = ul.closest("main") ?? document.body;
  // a Page fill pins main to the window: the rows take what is left inside it instead
  const body = page.classList.contains("fill") ? page.querySelector(":scope > .body") : null;
  return refit(body ?? page, () => {
    if (ul.children.length === 0) return;
    // the rows are all one height (grid-auto-rows: 1fr), fillers included
    const row = ul.offsetHeight / ul.children.length;
    if (body !== null) {
      // the room left or missing at each box from the list up to the page's body, wherever it stretches
      let room = 0;
      for (let box = ul.parentElement; box !== null; box = box.parentElement) {
        room += free(box);
        if (box === body || box === page) break;
      }
      fitted = Math.max(FIT_MIN, Math.floor((ul.offsetHeight + room) / row));
      return;
    }
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
  rows[s.index - s.start]?.scrollIntoView({ block: "nearest" });
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
  s.keys({
    hint,
    inField: "search",
    move: [
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
    ],
    next: ["l", "PageDown"],
    previous: ["h", "PageUp"],
  }),
);
</script>

{#if items.length === 0 && !fit}
  <Empty>{@render empty()}</Empty>
{:else}
  {#if head}<div class="head" aria-hidden="true">{@render head()}</div>{/if}
  <ul class="lsel-list" class:paged={fit} aria-label={label} bind:this={list}>
    {#if items.length === 0}<li class="filler blank" {@attach titled}><Empty>{@render empty()}</Empty></li>{/if}
    {#each s.visible as item, i (id(item))}
      <!-- the keys above are the keyboard way in; a click is the pointer's -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
      <li bind:this={rows[i]} aria-current={s.start + i === s.index} onclick={(e) => s.click(e, i)}>
        {@render row(item, s.start + i === s.index)}
      </li>
    {/each}
    {#each { length: fillers }, i (i)}
      <li class="filler" aria-hidden="true">&nbsp;</li>
    {/each}
  </ul>
  {#if fit}
    <Pager
      page={s.page}
      pages={s.pages}
      previous="h"
      next="l"
      onprevious={() => s.turn(-1)}
      onnext={() => s.turn(1)}
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
