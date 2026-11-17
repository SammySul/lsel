<script lang="ts">
import { localFamilies } from "../lib/fonts.ts";

let { onpick, open = $bindable(false) }: { onpick: (family: string) => void; open?: boolean } =
  $props();

let families = $state<string[] | null>(null);
let query = $state("");
let error = $state<string | null>(null);
let search: HTMLInputElement | undefined = $state();

const shown = $derived(
  (families ?? []).filter((f) => f.toLowerCase().includes(query.trim().toLowerCase())),
);

/** Opens the list (asking the browser for the installed fonts the first time) and focuses its search. */
export async function show() {
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
  queueMicrotask(() => search?.focus());
}

function toggle() {
  if (open) open = false;
  else void show();
}

function onkeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    query = "";
    search?.blur();
  }
}
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
          {onkeydown}
          type="search"
          placeholder="/ search"
          aria-label="Search installed fonts"
        />
        <ul>
          {#each shown as family (family)}
            <li><button class="pick" onclick={() => onpick(family)}>{family}</button></li>
          {:else}
            <li class="note">No installed font matches.</li>
          {/each}
        </ul>
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
  ul {
    max-height: 40vh;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }
  .pick {
    width: 100%;
    text-align: left;
  }
  li + li {
    margin-top: var(--space-1);
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
