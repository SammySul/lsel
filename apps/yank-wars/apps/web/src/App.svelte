<script lang="ts">
import PuzzleList from "./components/PuzzleList.svelte";
import Round from "./components/Round.svelte";
import { findPuzzle, nextPuzzle } from "./lib/puzzles.ts";

type Route = { kind: "list" } | { kind: "round"; id: string };

function parseRoute(hash: string): Route {
  const id = /^#\/p\/([a-z0-9-]+)$/.exec(hash)?.[1];
  return id === undefined ? { kind: "list" } : { kind: "round", id };
}

let hash = $state(location.hash);
let attempt = $state(0);
let lastId = $state<string | undefined>(undefined);

const route = $derived(parseRoute(hash));
const puzzle = $derived(route.kind === "round" ? findPuzzle(route.id) : undefined);

$effect(() => {
  if (puzzle !== undefined) lastId = puzzle.id;
});

function onhashchange() {
  hash = location.hash;
}

function retry() {
  attempt++;
}

function next(id: string) {
  const n = nextPuzzle(id);
  if (n === undefined) location.hash = "#/";
  else if (n.id === id) retry();
  else location.hash = `#/p/${n.id}`;
}

function list() {
  location.hash = "#/";
}
</script>

<svelte:window {onhashchange} />

{#if puzzle}
  {#key `${puzzle.id}:${attempt}`}
    <Round {puzzle} onNext={() => next(puzzle.id)} onRetry={retry} onList={list} />
  {/key}
{:else}
  <PuzzleList selected={lastId} missing={route.kind === "round" ? route.id : undefined} />
{/if}
