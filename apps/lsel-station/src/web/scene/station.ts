import type { ModuleId } from "../../content/modules.ts";
import { type Body, drawAsteroid, drawPlanet } from "./bodies.ts";
import type { Activity } from "./frame.ts";
import {
  BED_PLOTS,
  DRAW_ORDER,
  droneHome,
  FREIGHTER_TRIP,
  LAB_LIGHTS,
  MODULE_PLACES,
  type Point,
  SCANNER_DISH,
  SITES,
  SKIMMER_TRIP,
  TUG_TRIP,
  VENT,
  WORKSHOP_SPARKS,
  WRECKS,
} from "./layout.ts";
import { dither, fbm, hash } from "./noise.ts";
import { type Color, PALETTE, type Put } from "./palette.ts";
import {
  ANTENNA,
  DRONE,
  FREIGHTER,
  SKIMMER,
  SOLAR_PANEL,
  SPINE,
  type Sprite,
  STRUT,
  TUG,
  WRECK,
} from "./sprites.ts";

const CAMERA = { x: 18, y: 6 };
const PLANET = { x: -72, y: 102, radius: 80 };
// the frame every module hangs on, and the wrecks adrift nearby: they are there from the start
const FIXED: readonly (Point & { sprite: Sprite })[] = [
  { sprite: SPINE, x: -51, y: -2 },
  { sprite: STRUT, x: -41, y: -17 },
  { sprite: STRUT, x: -41, y: 3 },
  { sprite: SOLAR_PANEL, x: -52, y: -33 },
  { sprite: SOLAR_PANEL, x: -52, y: 18 },
  { sprite: ANTENNA, x: -5, y: -30 },
  ...WRECKS.map((at) => ({ sprite: WRECK, ...at })),
];
const BEAM_LENGTH = 7;
const PING_REACH = 26;

// share of a bar a craft spends flying out, and the share at which it turns back
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

/** Where a craft is on its trip out and back, for how far along its job's bar is. */
function leg(progress: number, still: boolean) {
  if (still || (progress >= OUT && progress < BACK)) {
    return { reach: 1, facing: 1 as const, moving: false, there: true };
  }
  if (progress < OUT) {
    return { reach: smooth(progress / OUT), facing: 1 as const, moving: true, there: false };
  }
  const reach = smooth((1 - progress) / (1 - BACK));
  return { reach, facing: -1 as const, moving: true, there: false };
}

const between = (from: Point, to: Point, reach: number): Point => ({
  x: Math.round(from.x + (to.x - from.x) * reach),
  y: Math.round(from.y + (to.y - from.y) * reach),
});

/** The orbit view of a station, in art pixels; everything that never moves is painted once, here. */
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
  const parts = [...FIXED, ...built];
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
    draw(ctx, { timeMs, still, drones, tugs, skimmers, freighters, running, beds, building }) {
      ctx.putImageData(image, 0, 0);
      const fill = (x: number, y: number, w: number, h: number, color: Color) => {
        ctx.fillStyle = PALETTE[color];
        ctx.fillRect(x + ox, y + oy, w, h);
      };
      const stamp = (sprite: Sprite, at: Point, facing: 1 | -1) => {
        for (const p of sprite.pixels) {
          fill(at.x + (facing === 1 ? p.x : sprite.width - 1 - p.x), at.y + p.y, 1, 1, p.color);
        }
      };
      const t = timeMs / 1000;
      const flicker = still ? 0 : Math.floor(t * 10);
      /** A few sparks around a point, new ones every flicker. */
      const sparks = (at: Point, spread: number, salt: number) => {
        for (let i = 0; i < 3; i++) {
          if (!still && (flicker + i) % 3 === 0) continue;
          const sx = Math.floor(hash(flicker, i, seed + salt) * spread) - (spread >> 1);
          const sy = Math.floor(hash(i, flicker, seed + salt) * spread) - (spread >> 1);
          fill(at.x + sx, at.y + sy, 1, 1, i === 0 ? "warm" : "glow");
        }
      };

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

      // crops grow up their pane: dark while young, bright once half grown
      beds.forEach((grown, index) => {
        const plot = BED_PLOTS[index];
        if (grown === null || plot === undefined) return;
        const tall = 1 + Math.floor(grown * 3);
        fill(plot.x, plot.y - tall + 1, 3, tall, grown >= 0.5 ? "green" : "greenDark");
      });

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
        if (active) {
          sparks({ x: x + (sprite.width >> 1), y: y + (sprite.height >> 1) }, sprite.width - 4, 7);
        }
      }

      for (const module of running) {
        if (module === "refinery") {
          // the stack vents while it runs
          const beat = still ? 0 : Math.floor(t * 4);
          const puffs: readonly Color[] = ["hullLight", "hull", "starDim"];
          puffs.forEach((color, i) => {
            const rise = (beat + i * 2) % 6;
            const sway = Math.floor(hash(beat + i, rise, seed + 8) * 3) - 1;
            fill(VENT.x + sway, VENT.y - rise, 1, 1, color);
          });
        } else if (module === "workshop") sparks(WORKSHOP_SPARKS, 5, 9);
        else if (module === "greenhouse") {
          const { x, y } = MODULE_PLACES.greenhouse;
          fill(x + 6, y + 7, 2, 1, still || flicker % 4 < 2 ? "warm" : "glow");
        } else if (module === "lab") {
          LAB_LIGHTS.forEach((light, i) => {
            if (still || (Math.floor(t * 3) + i) % 3 !== 0) fill(light.x, light.y, 2, 2, "beam");
          });
        } else if (module === "scanner") {
          // a ring goes out from the dish every two seconds
          const radius = still ? PING_REACH / 2 : ((t % 2) / 2) * PING_REACH;
          const steps = Math.max(8, Math.round(radius * 3));
          for (let i = 0; i < steps; i += 2) {
            const angle = (i / steps) * Math.PI * 2;
            fill(
              SCANNER_DISH.x + Math.round(Math.cos(angle) * radius),
              SCANNER_DISH.y + Math.round(Math.sin(angle) * radius),
              1,
              1,
              "beam",
            );
          }
        }
      }

      // each drone flies the job that is running: out, at the rock with its beam on, and back
      drones.forEach(({ action, progress }, slot) => {
        const home = droneHome(slot);
        const site = SITES[action];
        const flight = site === undefined || progress === null ? null : leg(progress, still);
        const at = flight === null ? home : between(home, site?.drone ?? home, flight.reach);
        stamp(DRONE, at, flight?.facing ?? 1);
        if (flight === null || site === undefined) return;
        if (flight.moving && flicker % 2 === 1) {
          fill(flight.facing === 1 ? at.x - 1 : at.x + DRONE.width, at.y + 2, 1, 1, "glow");
        }
        if (!flight.there) return;
        for (let i = 0; i < BEAM_LENGTH; i++) {
          if (still || (i + flicker) % 3 !== 0) {
            fill(at.x + DRONE.width + i, at.y + 1 - Math.round(i * site.climb), 1, 1, "beam");
          }
        }
        if (still) return;
        const hit = {
          x: at.x + DRONE.width + BEAM_LENGTH,
          y: at.y + 1 - Math.round(BEAM_LENGTH * site.climb),
        };
        sparks(hit, 5, slot);
      });

      // the tug goes to the wrecks, cuts a piece loose and hauls it back
      tugs.forEach((progress, slot) => {
        const flight = leg(progress, still);
        const home = { x: TUG_TRIP.home.x, y: TUG_TRIP.home.y + slot * 6 };
        const at = between(home, TUG_TRIP.away, flight.reach);
        if (flight.facing === -1) fill(at.x + TUG.width, at.y + 2, 3, 2, "hullDark");
        stamp(TUG, at, flight.facing);
        if (flight.there && !still) sparks({ x: at.x + TUG.width + 2, y: at.y + 2 }, 5, 11 + slot);
      });

      // the skimmer leaves the frame for the gas giant, and the freighter for a market; both come back
      const away = (
        sprite: Sprite,
        trip: { home: Point; away: Point },
        progress: number,
        slot: number,
      ) => {
        const out = progress < 0.5;
        const reach = smooth(out ? progress * 2 : (1 - progress) * 2);
        const home = { x: trip.home.x, y: trip.home.y + slot * (sprite.height + 1) };
        const at = between(home, trip.away, still ? 0 : reach);
        stamp(sprite, at, out ? 1 : -1);
        if (!still && flicker % 2 === 1) {
          fill(out ? at.x - 1 : at.x + sprite.width, at.y + (sprite.height >> 1), 1, 1, "glow");
        }
      };
      skimmers.forEach((progress, slot) => {
        away(SKIMMER, SKIMMER_TRIP, progress, slot);
      });
      freighters.forEach((progress, slot) => {
        away(FREIGHTER, FREIGHTER_TRIP, progress, slot);
      });
    },
  };
}
