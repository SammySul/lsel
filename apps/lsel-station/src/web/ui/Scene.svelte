<script lang="ts">
import { ACTIONS } from "../../content/actions.ts";
import { CREW_IDS } from "../../content/crew.ts";
import type { Game } from "../game.svelte.ts";
import { stationScene } from "../scene/station.ts";

// one whole-number scale: a larger panel shows more space, never larger pixels
const SCALE = 3;
const FRAME_MS = 1000 / 12;

let { game }: { game: Game } = $props();

let box: HTMLDivElement | undefined = $state();
let canvas: HTMLCanvasElement | undefined = $state();
let size = $state.raw({ width: 0, height: 0 });
let still = $state(false);

const seed = $derived(game.snapshot.seed);
const mining = $derived(
  CREW_IDS.some((crew) => {
    const job = game.snapshot.jobs[crew];
    return job !== undefined && ACTIONS[job.action].department === "mining";
  }),
);

/** How far the mining bar is right now, between ticks included. */
function miningProgress(): number | null {
  const { state, sinceTickMs } = game.frame();
  for (const crew of CREW_IDS) {
    const job = state.jobs[crew];
    if (job === undefined) continue;
    const action = ACTIONS[job.action];
    if (action.department === "mining") {
      return Math.min((job.progressMs + sinceTickMs) / action.durationMs, 1);
    }
  }
  return null;
}

$effect(() => {
  if (box === undefined) return;
  const observer = new ResizeObserver(([entry]) => {
    if (entry === undefined) return;
    const { width, height } = entry.contentRect;
    size = { width: Math.ceil(width / SCALE), height: Math.ceil(height / SCALE) };
  });
  observer.observe(box);
  return () => observer.disconnect();
});

$effect(() => {
  const query = matchMedia("(prefers-reduced-motion: reduce)");
  const read = () => {
    still = query.matches;
  };
  read();
  query.addEventListener("change", read);
  return () => query.removeEventListener("change", read);
});

$effect(() => {
  const ctx = canvas?.getContext("2d");
  if (canvas === undefined || ctx === null || ctx === undefined) return;
  if (size.width === 0 || size.height === 0) return;
  canvas.width = size.width;
  canvas.height = size.height;
  const scene = stationScene({ seed, ...size });
  const draw = (timeMs: number) => scene.draw(ctx, { timeMs, mining: miningProgress(), still });
  if (still) {
    // a still frame is redrawn only when what it shows changes
    void mining;
    draw(0);
    return;
  }
  draw(performance.now());
  let last = performance.now();
  let request = requestAnimationFrame(function loop(now) {
    if (now - last >= FRAME_MS) {
      last = now;
      draw(now);
    }
    request = requestAnimationFrame(loop);
  });
  return () => cancelAnimationFrame(request);
});
</script>

<div
  class="scene"
  bind:this={box}
  role="img"
  aria-label={mining
    ? "The station in orbit above a planet. A drone is mining the iron asteroid."
    : "The station in orbit above a planet. The drone is docked."}
>
  <canvas
    bind:this={canvas}
    style:width="{size.width * SCALE}px"
    style:height="{size.height * SCALE}px"
  ></canvas>
</div>

<style>
  .scene {
    position: relative;
    overflow: hidden;
    min-height: 0;
  }
  canvas {
    position: absolute;
    top: 0;
    left: 0;
    image-rendering: pixelated;
  }
</style>
