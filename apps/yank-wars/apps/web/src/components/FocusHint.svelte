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
    border-radius: 0;
    background: rgba(13, 17, 23, 0.55);
    cursor: pointer;
  }
  span {
    padding: 8px 16px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--panel);
    color: var(--fg);
  }
</style>
