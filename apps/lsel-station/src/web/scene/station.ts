import { type Body, drawAsteroid, drawPlanet } from "./bodies.ts";
import { dither, fbm, hash } from "./noise.ts";
import { type Color, PALETTE, type Put } from "./palette.ts";
import {
  ANTENNA,
  CORE,
  DRONE,
  DRONE_BAY,
  SOLAR_PANEL,
  SPINE,
  type Sprite,
  STRUT,
} from "./sprites.ts";

// World coordinates are art pixels with the core's center at 0, 0; every module has a fixed place.
const CAMERA = { x: 8, y: 6 };
const PLANET = { x: -72, y: 102, radius: 80 };
const ROCK = { x: 58, y: -26, radius: 10 };
const PARTS: readonly { sprite: Sprite; x: number; y: number }[] = [
  { sprite: SPINE, x: -51, y: -2 },
  { sprite: STRUT, x: -41, y: -17 },
  { sprite: STRUT, x: -41, y: 3 },
  { sprite: SOLAR_PANEL, x: -52, y: -33 },
  { sprite: SOLAR_PANEL, x: -52, y: 18 },
  { sprite: ANTENNA, x: -5, y: -30 },
  { sprite: DRONE_BAY, x: 15, y: -8 },
  { sprite: CORE, x: -15, y: -15 },
];
const DRONE_HOME = { x: 20, y: -12 };
const DRONE_AT_ROCK = { x: 39, y: -21 };
const BEAM_LENGTH = 7;

// share of the mining bar spent flying out, and the share at which the drone turns back
const OUT = 0.3;
const BACK = 0.7;

export type StationFrame = {
  /** The render clock: it drives flicker and nothing else. */
  readonly timeMs: number;
  /** 0 to 1 through the mining job's bar, or null when nobody is mining. */
  readonly mining: number | null;
  /** Reduced motion: one settled pose, nothing driven by time. */
  readonly still: boolean;
};

export type StationScene = { draw(ctx: CanvasRenderingContext2D, frame: StationFrame): void };

const smooth = (t: number) => t * t * (3 - 2 * t);

function abgr(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16)) >>> 0;
}

/** The orbit view, `width` × `height` art pixels: everything that never moves is painted once, here. */
export function stationScene(opts: { seed: number; width: number; height: number }): StationScene {
  const { seed, width, height } = opts;
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
  const rock: Body = { ...ROCK, seed: seed + 4 };
  drawPlanet(put, planet);
  drawAsteroid(put, rock);
  for (const part of PARTS) {
    for (const p of part.sprite.pixels) put(part.x + p.x, part.y + p.y, p.color);
  }
  const twinkling = stars.filter((s) => covered[s.y * width + s.x] === 0);
  const windows = PARTS.flatMap((part) =>
    part.sprite.windows.map((w) => ({ x: part.x + w.x, y: part.y + w.y, height: w.height })),
  );
  const beacons = PARTS.flatMap((part) =>
    part.sprite.beacons.map((b) => ({ x: part.x + b.x, y: part.y + b.y })),
  );

  return {
    draw(ctx, { timeMs, mining, still }) {
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

      // the drone flies the job that is running: out, at the rock with its beam on, and back
      let reach = 0;
      let facing: 1 | -1 = 1;
      let moving = false;
      let firing = false;
      if (mining !== null && (still || (mining >= OUT && mining < BACK))) {
        reach = 1;
        firing = true;
      } else if (mining !== null) {
        moving = true;
        if (mining < OUT) reach = smooth(mining / OUT);
        else {
          reach = smooth((1 - mining) / (1 - BACK));
          facing = -1;
        }
      }
      const dx = Math.round(DRONE_HOME.x + (DRONE_AT_ROCK.x - DRONE_HOME.x) * reach);
      const dy = Math.round(DRONE_HOME.y + (DRONE_AT_ROCK.y - DRONE_HOME.y) * reach);
      for (const p of DRONE.pixels) {
        fill(dx + (facing === 1 ? p.x : DRONE.width - 1 - p.x), dy + p.y, 1, 1, p.color);
      }
      if (moving && flicker % 2 === 1) {
        fill(facing === 1 ? dx - 1 : dx + DRONE.width, dy + 2, 1, 1, "glow");
      }
      if (firing) {
        for (let i = 0; i < BEAM_LENGTH; i++) {
          if (still || (i + flicker) % 3 !== 0) {
            fill(dx + DRONE.width + i, dy + 1 - Math.round(i * 0.6), 1, 1, "beam");
          }
        }
        const hit = {
          x: dx + DRONE.width + BEAM_LENGTH,
          y: dy + 1 - Math.round(BEAM_LENGTH * 0.6),
        };
        for (let i = 0; i < 3 && !still; i++) {
          const sx = Math.floor(hash(flicker, i, seed) * 5) - 2;
          const sy = Math.floor(hash(i, flicker, seed) * 5) - 2;
          fill(hit.x + sx, hit.y + sy, 1, 1, "glow");
        }
      }
    },
  };
}
