<!-- The page frame every app uses: title, key hints under it, version and source link. -->
<script module lang="ts">
import * as v from "valibot";
import { persisted } from "./persisted.svelte.ts";

// one setting per app, shared by every page it shows
const hintsShown = persisted("lsel:hints", v.boolean(), true);
</script>

<script lang="ts">
import { onMount, type Snippet, untrack } from "svelte";
import { palette } from "./assets/palette.ts";
import KeyHelp from "./KeyHelp.svelte";
import { activeBindings, isField, keyHelp, keyName, keys, keysOf } from "./keys.svelte.ts";
import LoadingBar from "./LoadingBar.svelte";
import { reducedMotion } from "./motion.svelte.ts";
import { route } from "./route.svelte.ts";

interface Props {
  name: string;
  sub?: string;
  version: string;
  source?: string;
  width?: number;
  /** Fills the window, children taking the height left: a game or an editor. */
  fill?: boolean;
  actions?: Snippet;
  children: Snippet;
}

let {
  name,
  sub,
  version,
  source,
  width = 960,
  fill = false,
  actions,
  children,
}: Props = $props();

const toggleHints = () => (hintsShown.value = !hintsShown.value);

keys(() => [
  { key: "?", label: "List the keys", hint: true, run: () => (keyHelp.open = true) },
  { key: "K", label: hintsShown.value ? "Hide these keys" : "Show the keys", run: toggleHints },
]);

// Ghostty's glitch (squares' crt.glsl): the title and the frame tear for a moment when the screen changes
const GLITCH_MS = 200;
let frame: HTMLElement | undefined = $state();
let glitch: { top: number; left: number; width: number; height: number } | null = $state(null);
let typedAt = Number.NEGATIVE_INFINITY;
let glitchedAt = Number.NEGATIVE_INFINITY;

function fire(): void {
  const now = performance.now();
  // never while typing: a keystroke into a field in the last second
  if (glitch !== null || frame === undefined || reducedMotion() || now - typedAt < 1000) return;
  glitchedAt = now;
  const r = frame.getBoundingClientRect();
  glitch = { top: r.top, left: r.left, width: r.width, height: r.height };
  setTimeout(() => (glitch = null), GLITCH_MS);
}

const typed = (e: KeyboardEvent) => {
  if (isField(e.target)) typedAt = performance.now();
};

// a window or tab coming back sends focus and visibilitychange together: one glitch
const back = () => {
  if (document.visibilityState === "visible" && performance.now() - glitchedAt > 1000) fire();
};

onMount(fire);
let path = route.path;
$effect(() => {
  if (route.path === path) return;
  path = route.path;
  untrack(fire);
});

// `?` first: it leads to every other key, and the line is cut from the end
const hints = $derived(
  activeBindings()
    .filter((b) => b.hint)
    .toSorted((a, b) => Number(b.key === "?") - Number(a.key === "?")),
);
</script>

<svelte:window onfocus={back} onkeydowncapture={typed} />
<svelte:document onvisibilitychange={back} />

<svelte:head>
  <!-- the browser's own chrome follows the palette, so no page repeats its base color -->
  <meta name="theme-color" content={palette.base} />
</svelte:head>

<main
  bind:this={frame}
  class="lsel-page"
  class:fill
  class:glitch={glitch !== null}
  style:max-width="{width}px"
  style:--glitch-time="{GLITCH_MS}ms"
>
  <div class="top">
    <header>
      <div class="title">
        <h1 data-text={name}>{name}</h1>
        {#if sub}<p class="sub">{sub}</p>{/if}
      </div>
      <div class="actions">
        {#if actions}{@render actions()}{/if}
        <button
          type="button"
          class="keys"
          aria-pressed={hintsShown.value}
          aria-controls="lsel-hints"
          onclick={toggleHints}>Keys <kbd>K</kbd></button
        >
      </div>
    </header>
    {#if hints.length > 0}
      <div class="hints" class:shown={hintsShown.value} id="lsel-hints" aria-hidden={!hintsShown.value}>
        <p>
          {#each hints as b, i (keysOf(b)[0])}
            {@const first = keysOf(b)[0] ?? ""}
            {#if i > 0}{" · "}{/if}<kbd>{keyName(first)}</kbd> {b.label.toLowerCase()}
          {/each}
        </p>
      </div>
    {/if}
  </div>

  {#if fill}<div class="body">{@render children()}</div>{:else}{@render children()}{/if}

  <footer>
    <p class="meta">
      {name} <span class="version">v{version}</span>
      {#if source}· <a href={source}>source</a>{/if}
      · MIT
    </p>
  </footer>
</main>

{#if glitch !== null}
  <div
    class="lsel-glitch"
    aria-hidden="true"
    style:top="{glitch.top}px"
    style:left="{glitch.left}px"
    style:width="{glitch.width}px"
    style:height="{glitch.height}px"
    style:--glitch-time="{GLITCH_MS}ms"
  ></div>
{/if}
<KeyHelp />
<LoadingBar />

<style>
  .lsel-page {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    padding: var(--space-6) var(--space-4);
  }
  .fill {
    height: calc(100dvh - 2 * var(--frame-gap));
  }
  .body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-5);
    min-height: 0;
  }
  header {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3) var(--space-5);
    align-items: start;
    justify-content: space-between;
  }
  /* the hints fold away to nothing, their spacing with them */
  .hints {
    display: grid;
    grid-template-rows: 0fr;
    opacity: 0;
    color: var(--subtle);
    font-size: var(--text-xs);
    transition:
      grid-template-rows var(--motion) var(--ease),
      opacity var(--motion) var(--ease);
  }
  .hints.shown {
    grid-template-rows: 1fr;
    opacity: 1;
  }
  /* one line, cut short: keys that arrive with a loaded view never push the page down */
  .hints p {
    min-height: 0;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: padding-top var(--motion) var(--ease);
  }
  /* a touch screen has no keys to list: its height goes to the page instead */
  @media (pointer: coarse) {
    .hints,
    .keys {
      display: none;
    }
  }
  .hints.shown p {
    padding-top: var(--space-3);
  }
  /* the app's name is its logo: the show's title face, in the accent */
  /* as wide as the name, so the torn bands' background ends with it */
  h1 {
    position: relative;
    isolation: isolate;
    width: fit-content;
    font-family: var(--font-display);
    font-weight: 400;
    color: var(--accent);
  }
  /* the title's copies are generated content with empty alt text: its text and accessible name stay the name */
  .glitch h1::before,
  .glitch h1::after {
    content: attr(data-text) / "";
    position: absolute;
    inset: 0;
    clip-path: inset(50% 0);
    animation: var(--glitch-time) steps(1, end);
  }
  /* the cyan half of the red/cyan split, behind the red title */
  .glitch h1::before {
    z-index: -1;
    color: var(--term-14);
    animation-name: split;
  }
  /* bands of the title torn sideways, covering the original under them */
  .glitch h1::after {
    background: var(--base);
    animation-name: tear;
  }
  @keyframes split {
    0% {
      clip-path: inset(0);
      transform: translateX(4px);
    }
    25% {
      clip-path: polygon(0 0, 100% 0, 100% 45%, 0 45%, 0 70%, 100% 70%, 100% 100%, 0 100%);
      transform: translateX(3px);
    }
    50% {
      clip-path: inset(0);
      transform: translateX(2px);
    }
    75% {
      clip-path: inset(30% 0 20%);
      transform: translateX(1px);
    }
  }
  @keyframes tear {
    0% {
      clip-path: polygon(0 12%, 100% 12%, 100% 30%, 0 30%, 0 62%, 100% 62%, 100% 74%, 0 74%);
      transform: translateX(-9px);
    }
    25% {
      clip-path: polygon(0 40%, 100% 40%, 100% 52%, 0 52%, 0 80%, 100% 80%, 100% 94%, 0 94%);
      transform: translateX(6px);
    }
    50% {
      clip-path: polygon(0 4%, 100% 4%, 100% 20%, 0 20%, 0 55%, 100% 55%, 100% 63%, 0 63%);
      transform: translateX(-4px);
    }
    75% {
      clip-path: inset(70% 0 14%);
      transform: translateX(2px);
    }
  }
  /* the frame's border twice, cyan and red, in bands torn sideways; fixed over main, so nothing in the page moves */
  .lsel-glitch {
    position: fixed;
    z-index: 1;
    pointer-events: none;
  }
  .lsel-glitch::before,
  .lsel-glitch::after {
    content: "";
    position: absolute;
    inset: 0;
    border: 1px solid var(--term-14);
    clip-path: inset(50% 0);
    animation: frame-cyan var(--glitch-time) steps(1, end);
  }
  .lsel-glitch::after {
    border-color: var(--accent);
    animation-name: frame-red;
  }
  @keyframes frame-cyan {
    0% {
      clip-path: polygon(0 0, 100% 0, 100% 3%, 0 3%, 0 9%, 100% 9%, 100% 12%, 0 12%, 0 41%, 100% 41%, 100% 43%, 0 43%);
      transform: translateX(8px);
    }
    25% {
      clip-path: polygon(0 1%, 100% 1%, 100% 5%, 0 5%, 0 14%, 100% 14%, 100% 16%, 0 16%, 0 72%, 100% 72%, 100% 75%, 0 75%);
      transform: translateX(-5px);
    }
    50% {
      clip-path: polygon(0 0, 100% 0, 100% 2%, 0 2%, 0 22%, 100% 22%, 100% 26%, 0 26%, 0 26%, 100% 26%, 100% 26%, 0 26%);
      transform: translateX(3px);
    }
    75% {
      clip-path: inset(8% 0 89%);
      transform: translateX(-1px);
    }
  }
  @keyframes frame-red {
    0% {
      clip-path: polygon(0 4%, 100% 4%, 100% 7%, 0 7%, 0 25%, 100% 25%, 100% 28%, 0 28%, 0 86%, 100% 86%, 100% 88%, 0 88%);
      transform: translateX(-6px);
    }
    25% {
      clip-path: polygon(0 0, 100% 0, 100% 2%, 0 2%, 0 18%, 100% 18%, 100% 21%, 0 21%, 0 55%, 100% 55%, 100% 57%, 0 57%);
      transform: translateX(4px);
    }
    50% {
      clip-path: polygon(0 6%, 100% 6%, 100% 10%, 0 10%, 0 33%, 100% 33%, 100% 35%, 0 35%, 0 35%, 100% 35%, 100% 35%, 0 35%);
      transform: translateX(-3px);
    }
    75% {
      clip-path: inset(0 0 98%);
      transform: translateX(1px);
    }
  }
  .sub {
    margin: var(--space-1) 0 0;
    color: var(--subtle);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }
  footer {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-top: var(--space-3);
    color: var(--subtle);
    font-size: var(--text-xs);
  }
  footer p {
    margin: 0;
  }
</style>
