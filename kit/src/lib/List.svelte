<script lang="ts" generics="T">
import type { Snippet } from "svelte";
import { keys } from "./keys.svelte.ts";

interface Action {
  key: string;
  label: string;
  run(item: T): void;
}

interface Props {
  items: readonly T[];
  id: (item: T) => string;
  /** The selected item's id; the first item when unset or gone. */
  selected?: string | undefined;
  label: string;
  row: Snippet<[T, boolean]>;
  /** Shown instead of the list when it is empty: why, and the key that fills it. */
  empty: Snippet;
  /** Enter, or a click on the selected row. */
  onopen?: (item: T) => void;
  actions?: readonly Action[];
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
}: Props = $props();

const index = $derived(
  Math.max(
    0,
    items.findIndex((item) => id(item) === selected),
  ),
);
const current = $derived(items[index]);
const rows: HTMLElement[] = $state([]);

$effect(() => {
  rows[index]?.scrollIntoView({ block: "nearest" });
});

function select(i: number): void {
  const item = items[Math.min(items.length - 1, Math.max(0, i))];
  if (item !== undefined) selected = id(item);
}

function click(i: number): void {
  if (i === index && current !== undefined) onopen?.(current);
  else select(i);
}

keys(() =>
  items.length === 0
    ? []
    : [
        { key: ["j", "ArrowDown"], label: "Next", inField: "search", run: () => select(index + 1) },
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
                inField: "search" as const,
                run: () => current !== undefined && onopen(current),
              },
            ]
          : []),
        ...actions.map((a) => ({
          key: a.key,
          label: a.label,
          run: () => current !== undefined && a.run(current),
        })),
      ],
);
</script>

{#if items.length === 0}
  <p class="lsel-empty">{@render empty()}</p>
{:else}
  <ul class="lsel-list" aria-label={label}>
    {#each items as item, i (id(item))}
      <!-- the keys above are the keyboard way in; a click is the pointer's -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
      <li bind:this={rows[i]} aria-current={i === index} onclick={() => click(i)}>
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
  li {
    padding: var(--space-2) var(--space-3);
    border-bottom: var(--border);
    border-left: 2px solid transparent;
    cursor: default;
    transition: border-color var(--motion-fast) var(--ease);
  }
  li[aria-current="true"] {
    border-left-color: var(--accent);
  }
  .lsel-empty {
    margin: 0;
    color: var(--subtle);
  }
</style>
