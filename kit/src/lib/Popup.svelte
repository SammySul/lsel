<script lang="ts">
import type { Snippet } from "svelte";
import { flash } from "./flash.svelte.ts";
import KeyHelp from "./KeyHelp.svelte";
import { keyHelp, keys } from "./keys.svelte.ts";
import LoadingBar from "./LoadingBar.svelte";

interface Props {
  name: string;
  sub?: string;
  nav?: Snippet;
  children: Snippet;
}

let { name, sub, nav, children }: Props = $props();

keys(() => [{ key: "?", label: "List the keys", run: () => (keyHelp.open = true) }]);
</script>

<div class="lsel-popup">
  <header>
    <div class="title">
      <h1>{name}</h1>
      {#if sub}<span class="sub">{sub}</span>{/if}
      <span class="help"><kbd>?</kbd> keys</span>
    </div>
    {#if nav}{@render nav()}{/if}
  </header>

  <div class="body">{@render children()}</div>

  <p class="status" class:error={flash.error} role="status">{flash.text}</p>
</div>

<KeyHelp />
<LoadingBar />

<style>
  .lsel-popup {
    display: flex;
    flex-direction: column;
    max-height: 600px;
  }
  header {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3);
    border-bottom: var(--border);
  }
  .title {
    display: flex;
    gap: var(--space-2);
    align-items: baseline;
  }
  h1 {
    font-size: var(--text-lg);
  }
  .sub,
  .help {
    color: var(--subtle);
    font-size: var(--text-xs);
  }
  .help {
    margin-left: auto;
  }
  .body {
    flex: 1;
    min-height: 160px;
    overflow-y: auto;
    padding: var(--space-3);
  }
  .status {
    min-height: 1.5em;
    margin: 0;
    padding: var(--space-1) var(--space-3);
    border-top: var(--border);
    color: var(--subtle);
    font-size: var(--text-xs);
  }
  .status.error {
    color: var(--error);
  }
</style>
