<script lang="ts">
import { go, route } from "@sammysul/lsel";
import NeedsKeyboard from "./components/NeedsKeyboard.svelte";
import PuzzleList from "./components/PuzzleList.svelte";
import Round from "./components/Round.svelte";
import { needsKeyboardNotice } from "./lib/device.ts";
import { findPuzzle, nextPuzzle } from "./lib/puzzles.ts";

const roundId = $derived(/^\/p\/([a-z0-9-]+)$/.exec(route.path)?.[1]);
let attempt = $state(0);
let lastId = $state<string | undefined>(undefined);

const anyFinePointer = matchMedia("(any-pointer: fine)").matches;
let width = $state(innerWidth);
let playAnyway = $state(false);

// The round on screen: narrowing the window never throws it away.
let onScreen = $state<string | undefined>(undefined);

const puzzle = $derived(roundId === undefined ? undefined : findPuzzle(roundId));
const showNotice = $derived(
  !playAnyway &&
    (puzzle === undefined || puzzle.id !== onScreen) &&
    needsKeyboardNotice(anyFinePointer, width),
);

$effect(() => {
  if (puzzle !== undefined) lastId = puzzle.id;
});

$effect(() => {
  onScreen = puzzle !== undefined && !showNotice ? puzzle.id : undefined;
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
{:else if puzzle}
  {#key `${puzzle.id}:${attempt}`}
    <Round {puzzle} onNext={() => next(puzzle.id)} onRetry={retry} onList={() => go("/")} />
  {/key}
{:else}
  <PuzzleList selected={lastId} missing={roundId} />
{/if}
