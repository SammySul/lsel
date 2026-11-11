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
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    height: 100%;
    padding: 12px;
  }
  .pane {
    position: relative;
    display: grid;
    grid-template-rows: auto 1fr;
    min-width: 0;
    min-height: 0;
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    background: var(--bg);
  }
  .label {
    display: flex;
    justify-content: space-between;
    padding: 4px 12px;
    font-size: 12px;
    color: var(--muted);
    background: var(--panel);
    border-bottom: 1px solid var(--border);
  }
  .editor-host {
    min-height: 0;
    overflow: hidden;
  }
  .locked {
    animation: pulse 400ms ease-out;
    border-color: var(--ok);
  }
  @keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 rgba(63, 185, 80, 0.7);
    }
    100% {
      box-shadow: 0 0 0 14px rgba(63, 185, 80, 0);
    }
  }
  .flash {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: var(--accent);
    animation: flash 350ms ease-out forwards;
  }
  @keyframes flash {
    from {
      opacity: 0.25;
    }
    to {
      opacity: 0;
    }
  }
</style>
