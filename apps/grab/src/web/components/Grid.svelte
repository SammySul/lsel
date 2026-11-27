<!-- The files as tiles: arrows or hjkl move the current one, x ticks it for the zip, a click shows it. -->
<script lang="ts">
import { duration, keys } from "@sammysul/lsel";
import type { SvelteSet } from "svelte/reactivity";
import { mediaUrl } from "../lib/api.ts";
import { describe, type Entry } from "../lib/entries.ts";

interface Props {
  items: readonly Entry[];
  current: string | undefined;
  selected: SvelteSet<string>;
}

let { items, current = $bindable(), selected }: Props = $props();

const index = $derived(
  Math.max(
    0,
    items.findIndex((e) => e.media.id === current),
  ),
);
let list: HTMLUListElement | undefined = $state();
const tiles: HTMLElement[] = $state([]);

// a row is as many tiles as the grid's columns, which the window's width decides
function columns(): number {
  if (list === undefined) return 1;
  return getComputedStyle(list).gridTemplateColumns.split(" ").filter(Boolean).length;
}

function move(to: number): void {
  const entry = items[Math.min(items.length - 1, Math.max(0, to))];
  if (entry !== undefined) current = entry.media.id;
}

function toggle(id: string): void {
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
}

$effect(() => {
  tiles[index]?.scrollIntoView({ block: "nearest" });
});

keys(() =>
  items.length === 0
    ? []
    : [
        { key: ["l", "ArrowRight"], label: "Next", run: () => move(index + 1) },
        { key: ["h", "ArrowLeft"], label: "Previous", run: () => move(index - 1) },
        { key: ["j", "ArrowDown"], label: "Down a row", run: () => move(index + columns()) },
        { key: ["k", "ArrowUp"], label: "Up a row", run: () => move(index - columns()) },
        { key: "g", label: "First", run: () => move(0) },
        { key: "G", label: "Last", run: () => move(items.length - 1) },
        {
          key: ["x", " "],
          label: "Tick for the zip",
          hint: true,
          run: () => {
            const id = items[index]?.media.id;
            if (id !== undefined) toggle(id);
          },
        },
      ],
);
</script>

<ul class="grid" aria-label="Files" bind:this={list}>
  {#each items as entry, i (entry.media.id)}
    {@const id = entry.media.id}
    <!-- the keys above are the keyboard way in; a click is the pointer's -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <li
      bind:this={tiles[i]}
      class="tile"
      aria-current={i === index}
      aria-label={describe(entry)}
      onclick={(e) => {
        if (!(e.target instanceof HTMLInputElement)) current = id;
      }}
    >
      <img
        src={mediaUrl(entry.media.thumb)}
        alt=""
        loading="lazy"
        width={entry.media.width}
        height={entry.media.height}
      />
      <input
        type="checkbox"
        class="pick"
        aria-label="Tick {describe(entry)} for the zip"
        checked={selected.has(id)}
        onchange={() => toggle(id)}
      />
      {#if entry.media.kind === "video" || entry.of > 1}
        <span class="badge">
          {#if entry.media.kind === "video"}Video{#if entry.media.duration !== null}{" "}{duration(entry.media.duration * 1000, "m:ss")}{/if}{/if}
          {#if entry.media.kind === "video" && entry.of > 1}{" · "}{/if}
          {#if entry.of > 1}{entry.index}/{entry.of}{/if}
        </span>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  @media (max-width: 600px) {
    .grid {
      grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    }
  }
  .tile {
    position: relative;
    aspect-ratio: 4 / 5;
    overflow: hidden;
    background: var(--raise);
    border: 2px solid var(--overlay);
    cursor: default;
    transition: border-color var(--motion-fast) var(--ease);
  }
  .tile[aria-current="true"] {
    border-color: var(--accent);
  }
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .pick {
    position: absolute;
    top: var(--space-1);
    left: var(--space-1);
    margin: 0;
    width: 18px;
    height: 18px;
  }
  .badge {
    position: absolute;
    right: 0;
    bottom: 0;
    padding: 0 var(--space-1);
    background: var(--base);
    color: var(--text);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }
</style>
