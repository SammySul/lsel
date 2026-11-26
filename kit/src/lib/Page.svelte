<!-- The page frame every app uses: title, key hints under it, version and source link. -->
<script module lang="ts">
import * as v from "valibot";
import { persisted } from "./persisted.svelte.ts";

// one setting per app, shared by every page it shows
const hintsShown = persisted("lsel:hints", v.boolean(), true);
</script>

<script lang="ts">
import type { Snippet } from "svelte";
import { palette } from "./assets/palette.ts";
import KeyHelp from "./KeyHelp.svelte";
import { activeBindings, keyHelp, keyName, keys, keysOf } from "./keys.svelte.ts";
import LoadingBar from "./LoadingBar.svelte";

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

const toggleHints = () => (hintsShown.value = !hintsShown.value);

keys(() => [
  { key: "?", label: "List the keys", hint: true, run: () => (keyHelp.open = true) },
  { key: "K", label: hintsShown.value ? "Hide these keys" : "Show the keys", run: toggleHints },
]);

// `?` last: it leads to every other key
const hints = $derived(
  activeBindings()
    .filter((b) => b.hint)
    .toSorted((a, b) => Number(a.key === "?") - Number(b.key === "?")),
);
</script>

<svelte:head>
  <!-- the browser's own chrome follows the palette, so no page repeats its base color -->
  <meta name="theme-color" content={palette.base} />
</svelte:head>

<main class="lsel-page" class:fill style:max-width="{width}px">
  <div class="top">
    <header>
      <div class="title">
        <h1>{name}</h1>
        {#if sub}<p class="sub">{sub}</p>{/if}
      </div>
      <div class="actions">
        {#if actions}{@render actions()}{/if}
        <button
          type="button"
          aria-pressed={hintsShown.value}
          aria-controls="lsel-hints"
          onclick={toggleHints}>Keys <kbd>K</kbd></button
        >
      </div>
    </header>
    {#if hints.length > 0}
      <div class="hints" class:shown={hintsShown.value} id="lsel-hints" aria-hidden={!hintsShown.value}>
        <p>
          {#each hints as b, i (keysOf(b)[0])}
            {@const first = keysOf(b)[0] ?? ""}
            {#if i > 0}{" · "}{/if}<kbd>{keyName(first)}</kbd> {b.label.toLowerCase()}
          {/each}
        </p>
      </div>
    {/if}
  </div>

  {#if fill}<div class="body">{@render children()}</div>{:else}{@render children()}{/if}

  <footer>
    <p class="meta">
      {name} <span class="version">v{version}</span>
      {#if source}· <a href={source}>source</a>{/if}
      · {license}
    </p>
  </footer>
</main>

<KeyHelp />
<LoadingBar />

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
  /* the hints fold away to nothing, their spacing with them */
  .hints {
    display: grid;
    grid-template-rows: 0fr;
    opacity: 0;
    color: var(--subtle);
    font-size: var(--text-xs);
    transition:
      grid-template-rows var(--motion) var(--ease),
      opacity var(--motion) var(--ease);
  }
  .hints.shown {
    grid-template-rows: 1fr;
    opacity: 1;
  }
  .hints p {
    min-height: 0;
    margin: 0;
    overflow: hidden;
    transition: padding-top var(--motion) var(--ease);
  }
  .hints.shown p {
    padding-top: var(--space-3);
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
</style>
