<script lang="ts">
import { OWNER_NAMES } from "../../content/factions.ts";
import { MODULE_IDS } from "../../content/modules.ts";
import { mapOf, type SectorId, sectorOf } from "../../sim/map.ts";
import { ownedSectors, ownerOf } from "../../sim/rules.ts";
import type { Game } from "../game.svelte.ts";
import { activityOf, describeScene } from "../scene/frame.ts";
import { mapScene } from "../scene/map.ts";
import { stationScene } from "../scene/station.ts";

// one whole-number scale: a larger panel shows more space, never larger pixels
const SCALE = 3;
const FRAME_MS = 1000 / 12;

let { game, view, selected }: { game: Game; view: "station" | "map"; selected: SectorId } =
  $props();

let box: HTMLDivElement | undefined = $state();
let canvas: HTMLCanvasElement | undefined = $state();
let size = $state.raw({ width: 0, height: 0 });
let still = $state(false);

// plain values, so the draw effect reruns only when what is built or what is shown changes
const seed = $derived(game.snapshot.seed);
const built = $derived(MODULE_IDS.map((id) => game.snapshot.modules[id] ?? 0).join());
const label = $derived.by(() => {
  if (view === "station") return describeScene(game.snapshot);
  const sector = sectorOf(mapOf(seed), selected);
  const owner = OWNER_NAMES[ownerOf(game.snapshot, selected)].toLowerCase();
  const charted = game.snapshot.revealed.length;
  return `The sector map: ${charted} ${charted === 1 ? "sector" : "sectors"} charted, ${ownedSectors(game.snapshot).length} yours. Selected: ${sector.name}, ${owner}.`;
});

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
  let draw: (timeMs: number) => void;
  if (view === "map") {
    const scene = mapScene({ seed, ...size });
    // `selected` is read when a frame is drawn, so moving the selection needs no new scene
    draw = (timeMs) => scene.draw(ctx, { state: game.frame().state, selected, timeMs, still });
  } else {
    void built;
    const scene = stationScene({ seed, ...size, modules: game.frame().state.modules });
    draw = (timeMs) => {
      const { state, sinceTickMs } = game.frame();
      scene.draw(ctx, { ...activityOf(state, sinceTickMs), timeMs, still });
    };
  }
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
