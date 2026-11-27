<!-- The thin bar at the top while anything waits longer than a moment. -->
<script lang="ts">
import { activity, DELAY } from "./activity.svelte.ts";

let shown = $state(false);
const waiting = $derived(activity.count > 0);

$effect(() => {
  if (!waiting) {
    shown = false;
    return;
  }
  const timer = setTimeout(() => (shown = true), DELAY);
  return () => clearTimeout(timer);
});
</script>

<div class="lsel-loading" class:shown aria-hidden="true"><div class="segment"></div></div>

<style>
  .lsel-loading {
    position: fixed;
    inset: 0 0 auto;
    z-index: 1;
    height: 2px;
    overflow: hidden;
    pointer-events: none;
    opacity: 0;
    transition: opacity var(--motion) var(--ease);
  }
  /* appearing, it settles in (DESIGN.md, Interaction) */
  .shown {
    opacity: 1;
    transition-timing-function: var(--ease-out);
  }
  /* a short segment gliding edge to edge and back: it never jumps, and it reads as waiting, not progress */
  .segment {
    width: 20%;
    height: 100%;
    background: var(--accent);
    animation: lsel-loading 1.6s var(--ease) infinite alternate;
  }
  @keyframes lsel-loading {
    from {
      transform: translateX(0);
    }
    to {
      transform: translateX(400%);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .segment {
      width: 100%;
      animation: none;
    }
  }
</style>
