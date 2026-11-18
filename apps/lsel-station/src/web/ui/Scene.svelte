<script lang="ts">
import { MODULE_IDS } from "../../content/modules.ts";
import type { Game } from "../game.svelte.ts";
import { activityOf, describeScene } from "../scene/frame.ts";
import { stationScene } from "../scene/station.ts";

// one whole-number scale: a larger panel shows more space, never larger pixels
const SCALE = 3;
const FRAME_MS = 1000 / 12;

let { game }: { game: Game } = $props();

let box: HTMLDivElement | undefined = $state();
let canvas: HTMLCanvasElement | undefined = $state();
let size = $state.raw({ width: 0, height: 0 });
let still = $state(false);

// plain values, so the draw effect reruns only when what is built or what is shown changes
const seed = $derived(game.snapshot.seed);
const built = $derived(MODULE_IDS.map((id) => game.snapshot.modules[id] ?? 0).join());
const label = $derived(describeScene(game.snapshot));

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
  void built;
  const { modules } = game.frame().state;
  const scene = stationScene({ seed, ...size, modules });
  const draw = (timeMs: number) => {
    const { state, sinceTickMs } = game.frame();
    scene.draw(ctx, { ...activityOf(state, sinceTickMs), timeMs, still });
  };
  if (still) {
    // a still frame is redrawn only when what it shows changes
    void label;
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

<div class="scene" bind:this={box} role="img" aria-label={label}>
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
