<!-- Asks for a click when the editor lost focus mid-round. -->
<script lang="ts">
import type { RoundController } from "../lib/round.svelte.ts";

let { ctl }: { ctl: RoundController } = $props();
</script>

<button class="focus-hint" onclick={() => ctl.focus()}>
  <span>Click to focus the editor</span>
</button>

<style>
  .focus-hint {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    border: 0;
    background: transparent;
    cursor: pointer;
  }
  span {
    padding: 8px 16px;
    border: 1px solid var(--overlay);
    background: var(--raise);
    color: var(--text);
  }
</style>
