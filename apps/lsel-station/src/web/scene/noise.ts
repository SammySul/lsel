const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** The 4×4 ordered-dither threshold at a pixel, 0 to under 1. */
export function dither(x: number, y: number): number {
  return (BAYER[(y & 3) * 4 + (x & 3)] ?? 0) / 16;
}

/** A repeatable value from 0 to under 1 for a whole-number point and a seed. */
export function hash(x: number, y: number, seed: number): number {
  let n =
    (Math.imul(x | 0, 374761393) +
      Math.imul(y | 0, 668265263) +
      Math.imul(seed | 0, 2246822519)) >>>
    0;
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Smooth value noise, 0 to 1. */
export function noise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

/** Three octaves of `noise`, 0 to 1. */
export function fbm(x: number, y: number, seed: number): number {
  return (
    noise(x, y, seed) * 0.6 +
    noise(x * 2.1, y * 2.1, seed) * 0.3 +
    noise(x * 4.3, y * 4.3, seed) * 0.1
  );
}
