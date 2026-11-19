<script lang="ts">
import type { Snippet } from "svelte";
import { flash } from "./flash.svelte.ts";
import KeyHelp from "./KeyHelp.svelte";
import { activeBindings, keyHelp, keyName, keys } from "./keys.svelte.ts";

interface Props {
  name: string;
  sub?: string;
  version: string;
  source?: string;
  license?: string;
  width?: number;
  /** Fills the window, children taking the height left: a game or an editor. */
  fill?: boolean;
  actions?: Snippet;
  children: Snippet;
}

let {
  name,
  sub,
  version,
  source,
  license = "MIT",
  width = 960,
  fill = false,
  actions,
  children,
}: Props = $props();

keys(() => [{ key: "?", label: "List the keys", hint: true, run: () => (keyHelp.open = true) }]);

// `?` last: it leads to every other key
const hints = $derived(
  activeBindings()
    .filter((b) => b.hint)
    .toSorted((a, b) => Number(a.key === "?") - Number(b.key === "?")),
);
</script>

<main class="lsel-page" class:fill style:max-width="{width}px">
  <header>
    <div class="title">
      <h1>{name}</h1>
      {#if sub}<p class="sub">{sub}</p>{/if}
    </div>
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </header>

  {#if fill}<div class="body">{@render children()}</div>{:else}{@render children()}{/if}

  <footer>
    <p class="status" class:error={flash.error} role="status">{flash.text}</p>
    {#if hints.length > 0}
      <p class="hints">
        {#each hints as b, i (b.label)}
          {@const first = typeof b.key === "string" ? b.key : (b.key[0] ?? "")}
          {#if i > 0}{" · "}{/if}<kbd>{keyName(first)}</kbd> {b.label.toLowerCase()}
        {/each}
      </p>
    {/if}
    <p class="meta">
      {name} <span class="version">v{version}</span>
      {#if source}· <a href={source}>source</a>{/if}
      · {license}
    </p>
  </footer>
</main>

<KeyHelp />

<style>
  .lsel-page {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    padding: var(--space-6) var(--space-4);
  }
  .fill {
    height: calc(100dvh - 2 * var(--space-5));
  }
  @media (max-width: 600px) {
    .fill {
      height: calc(100dvh - 2 * var(--space-2));
    }
  }
  .body {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }
  header {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3) var(--space-5);
    align-items: start;
    justify-content: space-between;
  }
  .sub {
    margin: var(--space-1) 0 0;
    color: var(--subtle);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }
  footer {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-top: var(--space-3);
    color: var(--subtle);
    font-size: var(--text-xs);
  }
  footer p {
    margin: 0;
  }
  .status {
    min-height: 1.5em;
  }
  .status.error {
    color: var(--error);
  }
</style>
