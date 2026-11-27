<!-- The two editors, the player's buffer and the target: side by side, or stacked on a narrow window. -->
<script lang="ts">
import { untrack } from "svelte";
import type { RoundController } from "../lib/round.svelte.ts";

let { ctl }: { ctl: RoundController } = $props();

let playerHost = $state<HTMLElement>();
let targetHost = $state<HTMLElement>();

$effect(() => {
  const player = playerHost;
  const target = targetHost;
  if (player === undefined || target === undefined) return;
  // mount reads prefs and round state; tracking them would remount the editors on every change.
  untrack(() => ctl.mount(player, target));
  return () => ctl.unmount();
});
</script>

<div class="panes">
  <div class="pane" class:locked={ctl.phase === "locked"}>
    <div class="label"><span>Your buffer</span></div>
    <section class="editor-host" bind:this={playerHost}></section>
    {#key ctl.flash}
      {#if ctl.flash > 0}<div class="flash" aria-hidden="true"></div>{/if}
    {/key}
  </div>
  <div class="pane">
    <div class="label"><span>Target</span><span class="hint">read-only</span></div>
    <section class="editor-host" bind:this={targetHost}></section>
  </div>
</div>

<style>
  .panes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
    height: 100%;
  }
  /* below MIN_WIDTH (lib/device.ts) the target goes under the buffer, each a full-width half */
  @media (max-width: 719px) {
    .panes {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: repeat(2, minmax(0, 1fr));
      gap: var(--space-2);
    }
  }
  .pane {
    position: relative;
    display: grid;
    grid-template-rows: auto 1fr;
    min-width: 0;
    min-height: 0;
    border: var(--border);
    overflow: hidden;
    background: var(--base);
  }
  .label {
    display: flex;
    justify-content: space-between;
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-xs);
    color: var(--subtle);
    background: var(--raise);
    border-bottom: var(--border);
  }
  .editor-host {
    min-height: 0;
    overflow: hidden;
  }
  .locked {
    border-color: var(--success);
  }
  .flash {
    position: absolute;
    inset: 0;
    pointer-events: none;
    outline: 2px solid var(--accent);
    outline-offset: -2px;
    animation: flash var(--motion) var(--ease) forwards;
  }
  @keyframes flash {
    to {
      outline-color: transparent;
    }
  }
</style>
