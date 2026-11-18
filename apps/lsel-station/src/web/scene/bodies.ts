import { dither, fbm, hash, noise } from "./noise.ts";
import type { Put } from "./palette.ts";

export type Body = {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly seed: number;
};

// toward the viewer's upper right, as everything in the scene is lit
const LIGHT = { x: 0.5, y: -0.62, z: 0.6 };

/** An ocean world: a dithered sphere with land from noise and a lit rim one pixel beyond the radius. */
export function drawPlanet(put: Put, { x: cx, y: cy, radius, seed }: Body): void {
  for (let y = cy - radius - 1; y <= cy + radius + 1; y++) {
    for (let x = cx - radius - 1; x <= cx + radius + 1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);
      if (d > radius) {
        const lit = (dx / d) * LIGHT.x + (dy / d) * LIGHT.y > 0.25;
        if (d < radius + 1.2 && lit && dither(x, y) < 0.6) put(x, y, "planet3");
        continue;
      }
      const nx = dx / radius;
      const ny = dy / radius;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const t = nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z + (dither(x, y) - 0.5) * 0.22;
      const land = fbm(dx / 26, dy / 11, seed) > 0.56;
      if (t < 0.12) put(x, y, "planet0");
      else if (t < 0.42) put(x, y, land ? "landDark" : "planet1");
      else if (t < 0.92) put(x, y, land ? "land" : "planet2");
      else put(x, y, "planet3");
    }
  }
}

/** How far an asteroid's surface can sit from its radius. */
export const ASTEROID_RELIEF = 0.32;

/** A lumpy rock: its outline comes from noise around the rim. No outline, as nothing natural has one. */
export function drawAsteroid(put: Put, { x: cx, y: cy, radius, seed }: Body): void {
  const reach = Math.ceil(radius * (1 + ASTEROID_RELIEF));
  for (let y = cy - reach; y <= cy + reach; y++) {
    for (let x = cx - reach; x <= cx + reach; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const angle = Math.atan2(dy, dx);
      const lump = noise(Math.cos(angle) * 1.7 + 5, Math.sin(angle) * 1.7 + 5, seed) - 0.5;
      if (Math.hypot(dx, dy) >= radius * (1 + lump * 2 * ASTEROID_RELIEF)) continue;
      const t = (dx * LIGHT.x + dy * LIGHT.y) / (radius * 1.1) + (dither(x, y) - 0.5) * 0.3;
      const pit = hash(x >> 1, y >> 1, seed) > 0.9;
      put(x, y, pit || t <= -0.2 ? "rockDark" : t > 0.25 ? "rockLight" : "rock");
    }
  }
}
