<script lang="ts">
import type { Puzzle } from "@yank-wars/engine";
import { onDestroy, untrack } from "svelte";
import { now } from "../lib/clock.ts";
import { prefs } from "../lib/prefs.svelte.ts";
import { isOver, RoundController } from "../lib/round.svelte.ts";
import FocusHint from "./FocusHint.svelte";
import Hud from "./Hud.svelte";
import Panes from "./Panes.svelte";
import ResultCard from "./ResultCard.svelte";
import StatusLine from "./StatusLine.svelte";
import StudyOverlay from "./StudyOverlay.svelte";

interface Props {
  puzzle: Puzzle;
  onNext(): void;
  onRetry(): void;
  onList(): void;
}

let { puzzle, onNext, onRetry, onList }: Props = $props();

// App keys this component on the puzzle id, so the first puzzle is the only one it ever sees.
const ctl = untrack(() => new RoundController(puzzle, prefs, now));
let unprobe: (() => void) | undefined;
let destroyed = false;
// A dynamic import inside a DEV branch, so the production bundle drops the probe entirely.
if (import.meta.env.DEV) {
  void import("../dev/roundProbe.ts").then((m) => {
    if (!destroyed) unprobe = m.exposeRound(ctl);
  });
}
onDestroy(() => {
  destroyed = true;
  unprobe?.();
  ctl.destroy();
});
</script>

<div class="round lsel-appear">
  <Hud {ctl} />
  <div class="stage">
    <Panes {ctl} />
    {#if !isOver(ctl.phase) && !ctl.focused}
      <FocusHint {ctl} />
    {/if}
    {#if ctl.showResult}
      <ResultCard {ctl} {onNext} {onRetry} {onList} />
    {/if}
  </div>
  <div class="footer">
    <StatusLine {ctl} />
    {#if ctl.phase === "study"}
      <StudyOverlay {ctl} />
    {/if}
  </div>
</div>

<style>
  .round {
    display: grid;
    grid-template-rows: auto 1fr auto;
    height: 100%;
    min-height: 0;
  }
  .stage {
    position: relative;
    min-height: 0;
  }
  .footer {
    position: relative;
    min-height: 72px;
    border-top: 1px solid var(--overlay);
    background: var(--base);
  }
</style>
