<!-- The fonts installed on this computer, searchable by name; it stands in for Your fonts while open. -->
<script lang="ts">
import { count, keys, List, resource, Status } from "@sammysul/lsel";
import { onMount } from "svelte";
import { localFamilies } from "../lib/fonts.ts";

let { onpick, onclose }: { onpick: (family: string) => void; onclose: () => void } = $props();

const families = resource(() => localFamilies());
let query = $state("");
let search: HTMLInputElement | undefined = $state();

const shown = $derived(
  (families.value ?? []).filter((f) => f.toLowerCase().includes(query.trim().toLowerCase())),
);

onMount(() => search?.focus());

// a click leaves the search box; typing goes on filtering
function pick(family: string) {
  onpick(family);
  search?.focus();
}

keys(() => [
  { key: "/", label: "Search installed fonts", run: () => search?.focus() },
  // with text in the search, Esc clears it first
  {
    key: "Escape",
    label: "Back to your fonts",
    inField: query === "" ? "search" : undefined,
    run: onclose,
  },
]);
</script>

<div class="installed lsel-appear">
  <input
    bind:this={search}
    bind:value={query}
    type="search"
    placeholder="/ search"
    aria-label="Search installed fonts"
  />
  <!-- r would reset the text; i twice asks the browser again -->
  <Status of={families} waiting="Asking the browser for its fonts…" retry={false} />
  <List items={shown} id={(f) => f} label="Installed fonts" onopen={pick} openOnClick fit>
    {#snippet row(family)}<span class="family" title={family}>{family}</span>{/snippet}
    {#snippet empty()}{#if families.value !== undefined}No installed font matches. <kbd>Esc</kbd> clears the search.{/if}{/snippet}
    {#snippet foot()}{#if families.value !== undefined}{count(shown.length)} of {count(families.value.length)}{/if}{/snippet}
  </List>
</div>

<style>
  .installed {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .family {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
