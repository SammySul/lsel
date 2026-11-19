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
  /** Shows its keys in the page footer. */
  hint?: boolean;
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
  hint = false,
}: Props = $props();

// where the selection was, so a row that goes away hands it to its neighbor, not the first row
let last = 0;
const index = $derived.by(() => {
  const found = items.findIndex((item) => id(item) === selected);
  return found !== -1 ? found : Math.min(last, Math.max(0, items.length - 1));
});
const current = $derived(items[index]);

$effect(() => {
  last = index;
  const shown = current === undefined ? undefined : id(current);
  if (shown !== selected) selected = shown;
});
const rows: HTMLElement[] = $state([]);

$effect(() => {
  rows[index]?.scrollIntoView({ block: "nearest" });
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
  <ul class="lsel-list" aria-label={label}>
    {#each items as item, i (id(item))}
      <!-- the keys above are the keyboard way in; a click is the pointer's -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
      <li bind:this={rows[i]} aria-current={i === index} onclick={(e) => click(e, i)}>
        {@render row(item, i === index)}
      </li>
    {/each}
  </ul>
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
</style>
