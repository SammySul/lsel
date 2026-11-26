<!-- One round on screen, solo or in a room: HUD, editors, study overlay and result. -->
<script lang="ts">
import type { Puzzle } from "@yank-wars/engine";
import { onDestroy, untrack } from "svelte";
import { prefs } from "../lib/prefs.svelte.ts";
import type { RoomClient } from "../lib/room.svelte.ts";
import { isOver, RoundController } from "../lib/round.svelte.ts";
import FocusHint from "./FocusHint.svelte";
import Hud from "./Hud.svelte";
import Panes from "./Panes.svelte";
import ResultCard from "./ResultCard.svelte";
import RoomResult from "./RoomResult.svelte";
import StatusLine from "./StatusLine.svelte";
import StudyOverlay from "./StudyOverlay.svelte";

/** Solo: a puzzle, and the round is this component's. In a room: the room's round. */
type Props =
  | { puzzle: Puzzle; onNext(): void; onRetry(): void; onList(): void; room?: never; ctl?: never }
  | { room: RoomClient; ctl: RoundController; onList(): void; puzzle?: never };

let props: Props = $props();

// Keyed by its parent on the puzzle (or the room's round), so the first is the only one it ever sees.
const own = untrack(() => props.ctl === undefined);
const ctl = untrack(() =>
  props.room === undefined
    ? new RoundController(props.puzzle, prefs, () => performance.now())
    : props.ctl,
);
const room = untrack(() => props.room);
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
  if (own) ctl.destroy();
});
</script>

<div class="round lsel-appear">
  <Hud {ctl} {room} />
  <div class="stage">
    <Panes {ctl} />
    {#if !isOver(ctl.phase) && !ctl.focused}
      <FocusHint {ctl} />
    {/if}
    {#if room !== undefined}
      {#if room.view?.phase === "results"}
        <RoomResult {room} onLeave={props.onList} />
      {:else if isOver(ctl.phase)}
        <p class="waiting lsel-appear" role="status">
          {ctl.phase === "locked" ? `Locked in at ${ctl.keys} keys.` : "Out of this round."}
          Waiting for {room.them?.name ?? "the other player"}…
        </p>
      {/if}
    {:else if ctl.showResult && props.puzzle !== undefined}
      <ResultCard {ctl} onNext={props.onNext} onRetry={props.onRetry} onList={props.onList} />
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
  .waiting {
    position: absolute;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    margin: 0;
    padding: 8px 16px;
    background: var(--raise);
    border: 1px solid var(--overlay);
  }
  .footer {
    position: relative;
    min-height: 72px;
    border-top: 1px solid var(--overlay);
    background: var(--base);
  }
</style>
