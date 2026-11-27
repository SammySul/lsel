<!-- Routes between the puzzle list, a solo round, the daily and a room. -->
<script lang="ts">
import { go, route } from "@sammysul/lsel";
import NeedsKeyboard from "./components/NeedsKeyboard.svelte";
import PuzzleList from "./components/PuzzleList.svelte";
import RoomScreen from "./components/RoomScreen.svelte";
import Round from "./components/Round.svelte";
import { dailyAt } from "./lib/daily.ts";
import { needsKeyboardNotice } from "./lib/device.ts";
import { findPuzzle, nextPuzzle, puzzles } from "./lib/puzzles.ts";

const roundId = $derived(/^\/p\/([a-z0-9-]+)$/.exec(route.path)?.[1]);
// the day is read as the route opens: a round that runs past midnight stays on its day
const daily = $derived(route.path === "/daily" ? dailyAt(puzzles, Date.now()) : undefined);
const roomPath = $derived(/^\/r(?:\/([a-z2-7]{10}))?$/.exec(route.path));
let attempt = $state(0);
let lastId = $state<string | undefined>(undefined);

const anyFinePointer = matchMedia("(any-pointer: fine)").matches;
let width = $state(innerWidth);
let playAnyway = $state(false);

// The round or room on screen: narrowing the window never throws it away.
let onScreen = $state<string | undefined>(undefined);

const puzzle = $derived(daily?.puzzle ?? (roundId === undefined ? undefined : findPuzzle(roundId)));
const screen = $derived(puzzle?.id ?? (roomPath === null ? undefined : "room"));
const showNotice = $derived(
  !playAnyway &&
    (screen === undefined || screen !== onScreen) &&
    needsKeyboardNotice(anyFinePointer, width),
);

$effect(() => {
  if (puzzle !== undefined) lastId = puzzle.id;
});

$effect(() => {
  onScreen = screen !== undefined && !showNotice ? screen : undefined;
});

function retry() {
  attempt++;
}

function next(id: string) {
  const n = nextPuzzle(id);
  if (n === undefined) go("/");
  else if (n.id === id) retry();
  else go(`/p/${n.id}`);
}
</script>

<svelte:window bind:innerWidth={width} />

{#if showNotice}
  <NeedsKeyboard onDismiss={() => (playAnyway = true)} />
{:else if roomPath !== null}
  <RoomScreen id={roomPath[1]} />
{:else if puzzle}
  {#key `${daily?.day ?? ""}:${puzzle.id}:${attempt}`}
    <Round {puzzle} {daily} onNext={() => next(puzzle.id)} onRetry={retry} onList={() => go("/")} />
  {/key}
{:else}
  <PuzzleList selected={lastId} missing={roundId} />
{/if}
