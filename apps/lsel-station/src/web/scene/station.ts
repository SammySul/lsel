import type { ModuleId } from "../../content/modules.ts";
import { type Body, drawAsteroid, drawPlanet } from "./bodies.ts";
import type { Activity } from "./frame.ts";
import { DRAW_ORDER, droneHome, MODULE_PLACES, SITES, VENT } from "./layout.ts";
import { dither, fbm, hash } from "./noise.ts";
import { type Color, PALETTE, type Put } from "./palette.ts";
import { ANTENNA, DRONE, SOLAR_PANEL, SPINE, type Sprite, STRUT } from "./sprites.ts";

const CAMERA = { x: 8, y: 6 };
const PLANET = { x: -72, y: 102, radius: 80 };
// the frame every module hangs on: it is there from the start
const FRAME: readonly { sprite: Sprite; x: number; y: number }[] = [
  { sprite: SPINE, x: -51, y: -2 },
  { sprite: STRUT, x: -41, y: -17 },
  { sprite: STRUT, x: -41, y: 3 },
  { sprite: SOLAR_PANEL, x: -52, y: -33 },
  { sprite: SOLAR_PANEL, x: -52, y: 18 },
  { sprite: ANTENNA, x: -5, y: -30 },
];
const BEAM_LENGTH = 7;

// share of a mining bar spent flying out, and the share at which the drone turns back
const OUT = 0.3;
const BACK = 0.7;

export type StationFrame = Activity & {
  /** The render clock: it drives flicker and nothing else. */
  readonly timeMs: number;
  /** Reduced motion: one settled pose, nothing driven by time. */
  readonly still: boolean;
};

export type StationScene = { draw(ctx: CanvasRenderingContext2D, frame: StationFrame): void };

const smooth = (t: number) => t * t * (3 - 2 * t);

function abgr(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16)) >>> 0;
}

/**
 * The orbit view, `width` × `height` art pixels, of a station with these module levels.
 * Everything that never moves is painted once, here.
 */
export function stationScene(opts: {
  seed: number;
  width: number;
  height: number;
  modules: Readonly<Partial<Record<ModuleId, number>>>;
}): StationScene {
  const { seed, width, height, modules } = opts;
  const ox = Math.floor(width / 2) - CAMERA.x;
  const oy = Math.floor(height / 2) - CAMERA.y;
  const image = new ImageData(width, height);
  const buffer = new Uint32Array(image.data.buffer);
  const covered = new Uint8Array(width * height);
  const stars: { x: number; y: number; phase: number }[] = [];

  for (let sy = 0; sy < height; sy++) {
    for (let sx = 0; sx < width; sx++) {
      const x = sx - ox;
      const y = sy - oy;
      const cloud = fbm(x / 46, y / 34, seed) > 0.58 + dither(x, y) * 0.14;
      let color: Color = cloud ? "nebula" : "space";
      if (hash(x, y, seed + 1) > 0.9963) {
        const bright = hash(x, y, seed + 2);
        color = bright > 0.8 ? "star" : "starDim";
        if (bright > 0.8) stars.push({ x: sx, y: sy, phase: bright * 40 });
      }
      buffer[sy * width + sx] = abgr(PALETTE[color]);
    }
  }

  const put: Put = (x, y, color) => {
    const sx = x + ox;
    const sy = y + oy;
    if (sx < 0 || sy < 0 || sx >= width || sy >= height) return;
    buffer[sy * width + sx] = abgr(PALETTE[color]);
    covered[sy * width + sx] = 1;
  };
  const planet: Body = { ...PLANET, seed: seed + 3 };
  drawPlanet(put, planet);
  Object.values(SITES).forEach((site, i) => {
    drawAsteroid(put, { ...site, seed: seed + 4 + i }, site.shades);
  });
  const built = DRAW_ORDER.filter((id) => (modules[id] ?? 0) > 0).map((id) => MODULE_PLACES[id]);
  const parts = [...FRAME, ...built];
  for (const part of parts) {
    for (const p of part.sprite.pixels) put(part.x + p.x, part.y + p.y, p.color);
  }
  const twinkling = stars.filter((s) => covered[s.y * width + s.x] === 0);
  const windows = parts.flatMap((part) =>
    part.sprite.windows.map((w) => ({ x: part.x + w.x, y: part.y + w.y, height: w.height })),
  );
  const beacons = parts.flatMap((part) =>
    part.sprite.beacons.map((b) => ({ x: part.x + b.x, y: part.y + b.y })),
  );

  return {
    draw(ctx, { timeMs, still, drones, refining, building }) {
      ctx.putImageData(image, 0, 0);
      const fill = (x: number, y: number, w: number, h: number, color: Color) => {
        ctx.fillStyle = PALETTE[color];
        ctx.fillRect(x + ox, y + oy, w, h);
      };
      const t = timeMs / 1000;
      const flicker = Math.floor(t * 10);

      if (!still) {
        ctx.fillStyle = PALETTE.starDim;
        for (const s of twinkling) {
          if (Math.sin(t * 2.2 + s.phase) <= -0.2) ctx.fillRect(s.x, s.y, 1, 1);
        }
      }
      windows.forEach((w, i) => {
        if (still || hash(i, Math.floor(t / 1.4), seed) > 0.18) fill(w.x, w.y, 1, w.height, "warm");
      });
      if (still || Math.floor(t * 1.5) % 2 === 0) {
        for (const b of beacons) fill(b.x, b.y, 1, 1, "alert");
      }

      // a module being built: its dashed slot, and sparks while someone is welding
      for (const { module, active } of building) {
        const { sprite, x, y } = MODULE_PLACES[module];
        for (let i = 0; i < sprite.width; i++) {
          if ((i >> 1) % 2 === 0) {
            fill(x + i, y, 1, 1, "ghost");
            fill(x + i, y + sprite.height - 1, 1, 1, "ghost");
          }
        }
        for (let i = 0; i < sprite.height; i++) {
          if ((i >> 1) % 2 === 0) {
            fill(x, y + i, 1, 1, "ghost");
            fill(x + sprite.width - 1, y + i, 1, 1, "ghost");
          }
        }
        if (!active) continue;
        const beat = still ? 0 : flicker;
        for (let i = 0; i < 3; i++) {
          if (!still && (beat + i) % 3 === 0) continue;
          const sx = 2 + Math.floor(hash(beat, i, seed + 7) * (sprite.width - 4));
          const sy = 2 + Math.floor(hash(i, beat, seed + 7) * (sprite.height - 4));
          fill(x + sx, y + sy, 1, 1, i === 0 ? "warm" : "glow");
        }
      }

      // the Refinery vents while it runs
      if (refining) {
        const beat = still ? 0 : Math.floor(t * 4);
        const puffs: readonly Color[] = ["hullLight", "hull", "starDim"];
        puffs.forEach((color, i) => {
          const rise = (beat + i * 2) % 6;
          const sway = Math.floor(hash(beat + i, rise, seed + 8) * 3) - 1;
          fill(VENT.x + sway, VENT.y - rise, 1, 1, color);
        });
      }

      // each drone flies the job that is running: out, at the rock with its beam on, and back
      drones.forEach(({ action, progress }, slot) => {
        const home = droneHome(slot);
        const site = SITES[action];
        let reach = 0;
        let facing: 1 | -1 = 1;
        let moving = false;
        let firing = false;
        if (site !== undefined && progress !== null) {
          if (still || (progress >= OUT && progress < BACK)) {
            reach = 1;
            firing = true;
          } else {
            moving = true;
            if (progress < OUT) reach = smooth(progress / OUT);
            else {
              reach = smooth((1 - progress) / (1 - BACK));
              facing = -1;
            }
          }
        }
        const at = site?.drone ?? home;
        const dx = Math.round(home.x + (at.x - home.x) * reach);
        const dy = Math.round(home.y + (at.y - home.y) * reach);
        for (const p of DRONE.pixels) {
          fill(dx + (facing === 1 ? p.x : DRONE.width - 1 - p.x), dy + p.y, 1, 1, p.color);
        }
        if (moving && flicker % 2 === 1) {
          fill(facing === 1 ? dx - 1 : dx + DRONE.width, dy + 2, 1, 1, "glow");
        }
        if (!firing || site === undefined) return;
        for (let i = 0; i < BEAM_LENGTH; i++) {
          if (still || (i + flicker) % 3 !== 0) {
            fill(dx + DRONE.width + i, dy + 1 - Math.round(i * site.climb), 1, 1, "beam");
          }
        }
        const hit = {
          x: dx + DRONE.width + BEAM_LENGTH,
          y: dy + 1 - Math.round(BEAM_LENGTH * site.climb),
        };
        for (let i = 0; i < 3 && !still; i++) {
          const sx = Math.floor(hash(flicker, i + slot * 3, seed) * 5) - 2;
          const sy = Math.floor(hash(i + slot * 3, flicker, seed) * 5) - 2;
          fill(hit.x + sx, hit.y + sy, 1, 1, "glow");
        }
      });
    },
  };
}
