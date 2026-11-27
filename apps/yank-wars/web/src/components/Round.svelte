<!-- One round on screen, solo or in a room: the bar, the editors, the status line under them, the study countdown and the result. -->
<script lang="ts">
import { keys, Page } from "@sammysul/lsel";
import type { Puzzle } from "@yank-wars/engine";
import { onDestroy, untrack } from "svelte";
import { CHORD_LABELS } from "../lib/chords.ts";
import type { Daily } from "../lib/daily.ts";
import { PAGE } from "../lib/page.ts";
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
  | {
      puzzle: Puzzle;
      daily?: Daily | undefined;
      onNext(): void;
      onRetry(): void;
      onList(): void;
      room?: never;
      ctl?: never;
    }
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

// listed under ? and the title; while the editor has focus its own handler runs them
keys(() => [
  ...(ctl.phase === "study"
    ? [{ key: [" ", "Enter"], label: "Ready", hint: true, run: () => ctl.ready() }]
    : []),
  { key: CHORD_LABELS.reset, label: "Reset", hint: true, run: () => ctl.reset() },
  { key: CHORD_LABELS.forfeit, label: "Give up", hint: true, run: () => ctl.forfeit() },
  { key: CHORD_LABELS.numbers, label: "Line numbers", hint: true, run: () => ctl.toggleNumbers() },
]);
</script>

<Page {...PAGE} width={1600} fill>
  <!-- one box for the bar, the editors and the status line, so a result card can cover all three -->
  <div class="round">
    <Hud {ctl} {room} />
    <div class="stage">
      <Panes {ctl} />
      {#if !isOver(ctl.phase) && !ctl.focused}
        <FocusHint {ctl} />
      {/if}
      {#if room !== undefined && room.view?.phase !== "results" && isOver(ctl.phase)}
        <p class="waiting lsel-appear" role="status">
          {ctl.phase === "locked" ? `Locked in at ${ctl.keys} keys.` : "Out of this round."}
          Waiting for {room.them?.name ?? "the other player"}…
        </p>
      {/if}
    </div>
    <div class="footer">
      <StatusLine {ctl} />
      {#if ctl.phase === "study"}
        <StudyOverlay {ctl} />
      {/if}
    </div>
    {#if room !== undefined}
      {#if room.view?.phase === "results"}
        <RoomResult {room} onLeave={props.onList} />
      {/if}
    {:else if ctl.showResult && props.puzzle !== undefined}
      <ResultCard
        {ctl}
        daily={props.daily}
        onNext={props.onNext}
        onRetry={props.onRetry}
        onList={props.onList}
      />
    {/if}
  </div>
</Page>

<style>
  /* the page's own gap between the bar, the editors and the status line */
  .round {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-5);
    min-height: 0;
  }
  .stage {
    position: relative;
    flex: 1;
    min-height: 0;
  }
  .waiting {
    position: absolute;
    left: 50%;
    bottom: var(--space-5);
    transform: translateX(-50%);
    margin: 0;
    padding: var(--space-2) var(--space-4);
    background: var(--raise);
    border: var(--border);
  }
  /* kept as tall as the study countdown over it, so the editors don't grow when it goes */
  .footer {
    position: relative;
    min-height: var(--space-7);
  }
</style>
