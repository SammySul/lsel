<script lang="ts" generics="Id extends string">
import { keys } from "./keys.svelte.ts";

interface Props {
  items: readonly { id: Id; label: string }[];
  value: Id;
  label: string;
  numbered?: boolean;
}

let { items, value = $bindable(), label, numbered = true }: Props = $props();

keys(() =>
  numbered
    ? items.slice(0, 9).map((t, i) => ({
        key: String(i + 1),
        label: `Show ${t.label.toLowerCase()}`,
        run: () => (value = t.id),
      }))
    : [],
);
</script>

<nav class="lsel-tabs" aria-label={label}>
  {#each items as t, i (t.id)}
    <button type="button" aria-pressed={value === t.id} onclick={() => (value = t.id)}>
      {t.label}{#if numbered && i < 9}{" "}<kbd>{i + 1}</kbd>{/if}
    </button>
  {/each}
</nav>

<style>
  .lsel-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
</style>
