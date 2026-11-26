<!-- What an empty view says: why it is empty and how to fill it. -->
<script lang="ts">
import type { Snippet } from "svelte";

/** Why a view is empty and how to fill it, with the key: "No fonts yet. Add some with <kbd>a</kbd>." */
let { children }: { children: Snippet } = $props();
</script>

<p class="lsel-empty">{@render children()}</p>

<style>
  .lsel-empty {
    margin: 0;
    color: var(--subtle);
  }
</style>
