<!-- Picks a font installed on this computer, searchable by name. -->
<script lang="ts">
import { keys, List } from "@sammysul/lsel";
import { tick } from "svelte";
import { localFamilies } from "../lib/fonts.ts";

let { onpick }: { onpick: (family: string) => void } = $props();

let open = $state(false);
let families = $state<string[] | null>(null);
let query = $state("");
let error = $state<string | null>(null);
let search: HTMLInputElement | undefined = $state();

const shown = $derived(
  (families ?? []).filter((f) => f.toLowerCase().includes(query.trim().toLowerCase())),
);

/** Opens the list (asking the browser for the installed fonts the first time) and focuses its search. */
async function show() {
  open = true;
  if (families === null) {
    try {
      families = await localFamilies();
      error = null;
    } catch {
      error = "The browser didn't allow reading the installed fonts.";
      return;
    }
  }
  await tick();
  search?.focus();
}

// or Enter would press this button again instead of opening the highlighted row
function pick(family: string) {
  onpick(family);
  search?.focus();
}

function toggle() {
  if (open) open = false;
  else void show();
}

keys(() => [
  { key: "i", label: "Installed fonts", run: toggle },
  { key: "/", label: "Search installed fonts", run: () => void show() },
]);
</script>

<div class="installed">
  <button aria-expanded={open} onclick={toggle}>
    Installed fonts{families ? ` (${families.length})` : ""} <kbd>i</kbd>
  </button>
  {#if open}
    <div class="panel lsel-appear">
      {#if error !== null}
        <p class="error" role="alert">{error}</p>
      {:else if families === null}
        <p class="note">Asking the browser…</p>
      {:else}
        <input
          bind:this={search}
          bind:value={query}
          type="search"
          placeholder="/ search"
          aria-label="Search installed fonts"
        />
        <div class="families">
          <List items={shown} id={(f) => f} label="Installed fonts" onopen={onpick}>
            {#snippet row(family)}
              <button class="pick" onclick={() => pick(family)}>{family}</button>
            {/snippet}
            {#snippet empty()}No installed font matches. <kbd>Esc</kbd> clears the search.{/snippet}
          </List>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .installed {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .families {
    max-height: 40vh;
    overflow-y: auto;
  }
  .pick {
    width: 100%;
    text-align: left;
  }
  .note {
    margin: 0;
    color: var(--subtle);
  }
  .error {
    margin: 0;
    color: var(--error);
  }
</style>
