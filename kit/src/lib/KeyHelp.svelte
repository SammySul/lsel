<!-- The ? overlay listing every key the screen answers. -->
<script lang="ts">
import { activeBindings, keyHelp, keyName, keysOf } from "./keys.svelte.ts";

let dialog: HTMLDialogElement | undefined = $state();

// `?` itself is the last line, with Esc
const list = $derived(keyHelp.open ? activeBindings().filter((b) => b.key !== "?") : []);

$effect(() => {
  if (!dialog) return;
  if (keyHelp.open && !dialog.open) dialog.showModal();
  if (!keyHelp.open && dialog.open) dialog.close();
});
</script>

<dialog
  bind:this={dialog}
  class="lsel-keys"
  aria-label="Keys"
  onclose={() => (keyHelp.open = false)}
>
  <h2>Keys</h2>
  <dl>
    {#each list as b (keysOf(b)[0])}
      {@const all = keysOf(b)}
      <dt>{#each all as k, i (k)}{#if i > 0}{" "}{/if}<kbd>{keyName(k)}</kbd>{/each}</dt>
      <dd>{b.label}</dd>
    {/each}
    <dt><kbd>?</kbd> <kbd>Esc</kbd></dt>
    <dd>Close this list</dd>
  </dl>
</dialog>

<style>
  .lsel-keys {
    min-width: min(360px, calc(100vw - 2 * var(--space-4)));
    max-height: calc(100vh - 2 * var(--space-6));
    padding: var(--space-4) var(--space-5);
    color: var(--text);
    background: var(--base);
    border: var(--border);
  }
  .lsel-keys[open] {
    animation: lsel-appear var(--motion) var(--ease) both;
  }
  .lsel-keys::backdrop {
    background: none;
  }
  h2 {
    margin-bottom: var(--space-3);
    font-size: var(--text-md);
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--space-2) var(--space-4);
    margin: 0;
  }
  dt {
    white-space: nowrap;
  }
  dd {
    margin: 0;
    color: var(--subtle);
  }
</style>
