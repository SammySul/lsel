import type { Owner } from "../../content/factions.ts";
import { mapOf, type Sector, type SectorId } from "../../sim/map.ts";
import { outpostAt, ownerOf } from "../../sim/rules.ts";
import type { Snapshot } from "../../sim/state.ts";
import { drawPlanet } from "./bodies.ts";
import { dither, hash } from "./noise.ts";
import { type Color, PALETTE } from "./palette.ts";
import { OUTPOST } from "./sprites.ts";

/** Each holder's color on the map. Shape tells them apart too, so color is never the only cue. */
export const OWNER_COLORS: Readonly<Record<Owner, Color>> = {
  you: "warm",
  none: "hull",
  pirates: "land",
  strays: "rockLight",
  "co-op": "green",
  company: "solarLine",
  navy: "alert",
  archive: "beam",
};

// 7 × 7 marks, one per holder; `fog` is a sector that is known of but not charted
const MARKS: Readonly<Record<Owner | "fog", readonly string[]>> = {
  you: ["...#...", "..###..", ".##.##.", "##...##", ".##.##.", "..###..", "...#..."],
  none: [".......", "...#...", "..###..", ".#####.", "..###..", "...#...", "......."],
  pirates: ["##...##", "###.###", ".#####.", "..###..", ".#####.", "###.###", "##...##"],
  strays: ["...#...", ".#.#.#.", "..###..", "#######", "..###..", ".#.#.#.", "...#..."],
  "co-op": ["..###..", "..###..", "#######", "#######", "#######", "..###..", "..###.."],
  company: [".......", ".#####.", ".#####.", ".#####.", ".#####.", ".#####.", "......."],
  navy: ["...#...", "..###..", "..###..", ".#####.", ".#####.", "#######", "#######"],
  archive: ["..###..", ".#####.", "##...##", "##...##", "##...##", ".#####.", "..###.."],
  fog: [".......", "...#...", "..#.#..", ".#...#.", "..#.#..", "...#...", "......."],
};

const PLANET_RADIUS = 20;

export type MapFrame = {
  readonly state: Snapshot;
  readonly selected: SectorId;
  readonly timeMs: number;
  readonly still: boolean;
};

export type MapScene = { draw(ctx: CanvasRenderingContext2D, frame: MapFrame): void };

/** The sector map, `width` × `height` art pixels: what is charted, who holds it, and the lanes between. */
export function mapScene(opts: { seed: number; width: number; height: number }): MapScene {
  const { seed, width, height } = opts;
  const map = mapOf(seed);
  const planets = new Map<SectorId, HTMLCanvasElement>();

  /** A sector's planet, painted once. */
  function planetOf(sector: Sector): HTMLCanvasElement {
    const cached = planets.get(sector.id);
    if (cached !== undefined) return cached;
    const size = PLANET_RADIUS * 2 + 4;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const paint = canvas.getContext("2d");
    if (paint !== null) {
      drawPlanet(
        (x, y, color) => {
          paint.fillStyle = PALETTE[color];
          paint.fillRect(x, y, 1, 1);
        },
        { x: size >> 1, y: size >> 1, radius: PLANET_RADIUS, seed: sector.seed },
      );
    }
    planets.set(sector.id, canvas);
    return canvas;
  }

  return {
    draw(ctx, { state, selected, timeMs, still }) {
      const shown = map.sectors.filter((s) => state.revealed.includes(s.id));
      const fog = map.sectors.filter(
        (s) => !state.revealed.includes(s.id) && s.lanes.some((l) => state.revealed.includes(l)),
      );
      // the camera frames what is known
      const known = [...shown, ...fog];
      const xs = known.map((s) => s.x);
      const ys = known.map((s) => s.y);
      const ox = (width >> 1) - Math.round((Math.min(...xs) + Math.max(...xs)) / 2);
      const oy = (height >> 1) - Math.round((Math.min(...ys) + Math.max(...ys)) / 2);
      const fill = (x: number, y: number, w: number, h: number, color: Color) => {
        ctx.fillStyle = PALETTE[color];
        ctx.fillRect(x + ox, y + oy, w, h);
      };

      ctx.fillStyle = PALETTE.space;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = PALETTE.starDim;
      for (let y = 0; y < height; y += 2) {
        for (let x = 0; x < width; x += 2) {
          if (hash(x - ox, y - oy, seed + 21) > 0.992) ctx.fillRect(x, y, 1, 1);
        }
      }

      // held space is tinted with its holder's color, one pixel in four
      for (const sector of shown) {
        const owner = ownerOf(state, sector.id);
        if (owner === "none") continue;
        for (let dy = -9; dy <= 9; dy++) {
          for (let dx = -9; dx <= 9; dx++) {
            const x = sector.x + dx;
            const y = sector.y + dy;
            if (Math.hypot(dx, dy) <= 9 && dither(x, y) < 0.25 && (x + y) % 2 === 0) {
              fill(x, y, 1, 1, OWNER_COLORS[owner]);
            }
          }
        }
      }

      // lanes are dotted; the ones into fog more sparsely
      for (const a of shown) {
        for (const id of a.lanes) {
          const b = map.sectors[id];
          if (b === undefined) continue;
          const charted = state.revealed.includes(b.id);
          if (charted && b.id < a.id) continue;
          const steps = Math.round(Math.hypot(b.x - a.x, b.y - a.y));
          for (let i = 0; i <= steps; i += charted ? 3 : 5) {
            fill(
              Math.round(a.x + ((b.x - a.x) * i) / steps),
              Math.round(a.y + ((b.y - a.y) * i) / steps),
              1,
              1,
              "starDim",
            );
          }
        }
      }

      const mark = (sector: Sector, rows: readonly string[], color: Color) => {
        rows.forEach((row, y) => {
          [...row].forEach((c, x) => {
            if (c === "#") fill(sector.x - 3 + x, sector.y - 3 + y, 1, 1, color);
          });
        });
      };
      for (const sector of fog) mark(sector, MARKS.fog, "starDim");
      for (const sector of shown) {
        const owner = ownerOf(state, sector.id);
        fill(sector.x - 4, sector.y - 4, 9, 9, "space");
        mark(sector, MARKS[owner], OWNER_COLORS[owner]);
      }

      const at = map.sectors[selected];
      if (at === undefined) return;
      // the selection's corners blink, unless motion is reduced
      if (still || Math.floor(timeMs / 500) % 2 === 0) {
        for (const [sx, sy] of [
          [-6, -6],
          [5, -6],
          [-6, 5],
          [5, 5],
        ] as const) {
          fill(at.x + sx, at.y + sy, 2, 1, "glow");
          fill(at.x + (sx < 0 ? sx : sx + 1), at.y + sy, 1, 2, "glow");
        }
      }

      // the selected sector from orbit, in the corner: its planet, and your outpost if you hold it
      const planet = planetOf(at);
      const px = 3;
      const py = height - planet.height - 3;
      ctx.drawImage(planet, px, py);
      if (outpostAt(state, selected) !== undefined) {
        for (const p of OUTPOST.pixels) {
          ctx.fillStyle = PALETTE[p.color];
          ctx.fillRect(px + planet.width - 6 + p.x, py + 2 + p.y, 1, 1);
        }
      }
    },
  };
}
