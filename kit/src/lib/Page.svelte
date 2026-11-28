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

// Ghostty's glitch (squares' crt.glsl, sampleGlitched), redrawn every frame for 150 ms as an SVG filter on the frame
const GLITCH_MS = 150;
// the shader's sizes, in device pixels: 18 px bands, a tear of up to ±30 px, red and blue 4 px either side of green
const BAND = 18;
const TEAR = 60;
const SPLIT = 4;
const SVG = "http://www.w3.org/2000/svg";
// red, green or blue alone, kept opaque so the three add back up to the frame (main paints --base)
const CHANNEL = [
  "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0",
  "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0",
  "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0",
] as const;
const hash = (n: number) => {
  const x = Math.sin(n * 78.233 + 1) * 43758.5453;
  return x - Math.floor(x);
};
let frame: HTMLElement | undefined = $state();
let filter: SVGFilterElement | undefined = $state();
let glitching = $state(false);
let typedAt = Number.NEGATIVE_INFINITY;
let glitchedAt = Number.NEGATIVE_INFINITY;
let glitches = 0;

function primitive(name: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(SVG, name);
  for (const [a, value] of Object.entries(attrs)) el.setAttribute(a, String(value));
  return el;
}

/** The filter at strength k (1 to 0): a fifth of the bands, picked anew each 60th of a second, torn sideways, then red and blue split. */
function draw(f: SVGFilterElement, main: HTMLElement, k: number, now: number): boolean {
  const px = 1 / devicePixelRatio;
  const band = BAND * px;
  const tick = Math.floor((now / 1000) * 60);
  // in fractions of main's box: WebKit puts user space's origin at the page's, not main's
  const { top, bottom, width, height } = main.getBoundingClientRect();
  // a frame not laid out (hidden, or not yet sized) has no fractions to draw in
  if (width === 0 || height === 0) return false;
  // the tears as a map: red at 0.5 leaves a pixel, at h shows the pixel (h - 0.5) * TEAR * k px to its right
  const bands = [primitive("feFlood", { "flood-color": "rgb(128 128 128)", result: "still" })];
  const map = primitive("feMerge", { result: "map" });
  map.append(primitive("feMergeNode", { in: "still" }));
  // bands count from the window's top, as the shader's do, cut to main: WebKit blanks the frame for a band outside the filter
  const last = Math.min(bottom, innerHeight) / band;
  for (let n = Math.floor(Math.max(top, 0) / band); n < last; n++) {
    if (hash(n + tick) <= 0.8) continue;
    const from = Math.max(n * band - top, 0);
    const to = Math.min((n + 1) * band - top, height);
    const red = Math.round(hash(n * 3.7) * 255);
    bands.push(
      primitive("feFlood", {
        y: from / height,
        height: (to - from) / height,
        "flood-color": `rgb(${red} 128 128)`,
        result: `b${n}`,
      }),
    );
    map.append(primitive("feMergeNode", { in: `b${n}` }));
  }
  const split = (SPLIT * k * px) / width;
  const only = (channel: 0 | 1 | 2) =>
    primitive("feColorMatrix", { in: "torn", values: CHANNEL[channel] });
  f.replaceChildren(
    ...bands,
    map,
    primitive("feDisplacementMap", {
      in: "SourceGraphic",
      in2: "map",
      scale: (TEAR * k * px) / width,
      xChannelSelector: "R",
      yChannelSelector: "G",
      result: "torn",
    }),
    // red from split px to the right, blue from split px to the left, green where it was
    only(0),
    primitive("feOffset", { dx: -split, result: "r" }),
    only(1),
    primitive("feComposite", { in2: "r", operator: "arithmetic", k2: 1, k3: 1, result: "rg" }),
    only(2),
    primitive("feOffset", { dx: split }),
    primitive("feComposite", { in2: "rg", operator: "arithmetic", k2: 1, k3: 1 }),
  );
  return true;
}

function fire(): void {
  const start = performance.now();
  // never while typing: a keystroke into a field in the last second
  if (glitching || frame === undefined || filter === undefined || reducedMotion()) return;
  if (start - typedAt < 1000) return;
  const [f, main] = [filter, frame];
  glitchedAt = start;
  // drawn before it applies: an empty filter would hide the frame
  if (!draw(f, main, 1, start)) return;
  glitching = true;
  const step = (now: number) => {
    if (!glitching) return;
    const k = Math.min(1, Math.max(0, 1 - (now - start) / GLITCH_MS));
    if (draw(f, main, k, now)) requestAnimationFrame(step);
    else glitching = false;
  };
  requestAnimationFrame(step);
  const run = ++glitches;
  // a glitch cut short by a collapsed frame leaves its timer to the next one's
  setTimeout(() => {
    if (run === glitches) glitching = false;
  }, GLITCH_MS);
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
  style:max-width="{width}px"
  style:filter={glitching ? "url(#lsel-glitch)" : undefined}
>
  <div class="top">
    <header>
      <div class="title">
        <h1>{name}</h1>
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

<svg class="lsel-glitch" aria-hidden="true" width="0" height="0">
  <filter
    bind:this={filter}
    id="lsel-glitch"
    primitiveUnits="objectBoundingBox"
    color-interpolation-filters="sRGB"
  ></filter>
</svg>
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
  /* opaque, so the glitch's red, green and blue each have a whole frame to split */
  .lsel-page {
    background: var(--base);
  }
  /* the app's name is its logo: the show's title face, in the accent */
  h1 {
    font-family: var(--font-display);
    font-weight: 400;
    color: var(--accent);
  }
  /* takes no room; not display: none, which would leave the filter undrawn in some engines */
  .lsel-glitch {
    position: absolute;
    width: 0;
    height: 0;
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
