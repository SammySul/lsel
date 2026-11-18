import type { Color } from "./palette.ts";

// `w` is a window and `b` the beacon: both are drawn dark here and lit by the scene.
const LEGEND = {
  "#": "outline",
  L: "hullLight",
  h: "hull",
  d: "hullDark",
  a: "warm",
  g: "glow",
  s: "solar",
  S: "solarLine",
  w: "hullDark",
  b: "hullDark",
} as const satisfies Record<string, Color>;

export type Pixel = { readonly x: number; readonly y: number; readonly color: Color };

export type Sprite = {
  readonly width: number;
  readonly height: number;
  readonly pixels: readonly Pixel[];
  /** Windows: a vertical run of `w` is one window, lit or dark as a whole. */
  readonly windows: readonly { readonly x: number; readonly y: number; readonly height: number }[];
  readonly beacons: readonly { readonly x: number; readonly y: number }[];
};

const isLegend = (c: string): c is keyof typeof LEGEND => c in LEGEND;

/** A hand-drawn palette grid: one character per pixel, `.` for nothing. */
export function sprite(rows: readonly string[]): Sprite {
  const width = rows[0]?.length ?? 0;
  const pixels: Pixel[] = [];
  const windows: { x: number; y: number; height: number }[] = [];
  const beacons: { x: number; y: number }[] = [];
  rows.forEach((row, y) => {
    if (row.length !== width)
      throw new Error(`sprite row ${y} is ${row.length} wide, not ${width}`);
    [...row].forEach((c, x) => {
      if (c === ".") return;
      if (!isLegend(c)) throw new Error(`sprite row ${y} has an unknown color "${c}"`);
      pixels.push({ x, y, color: LEGEND[c] });
      if (c === "b") beacons.push({ x, y });
      if (c !== "w") return;
      const above = windows.find((w) => w.x === x && w.y + w.height === y);
      if (above === undefined) windows.push({ x, y, height: 1 });
      else above.height++;
    });
  });
  return { width, height: rows.length, pixels, windows, beacons };
}

export const CORE = sprite([
  "##############################",
  "#LLLLLLLLLLLLLLLLLLLLLLLLLLLd#",
  "#Lhhhhhhhhhhhhhhhhhhhhhhhhhhd#",
  "#Lhhhhhhhhhhhhhhhhhhhhhhhhhhd#",
  "#Lhhhhhhhhhhhhhhhhhhhhhhhhhhd#",
  "#Lhhhhhhhhhhhhhhhhhhhhhhhhhhd#",
  "#Lhhhhhhhhhhhhhhhhhhhhhhhhhhd#",
  "#Lhhhhhhhhhhhhhhhhhhhhhhhhhhd#",
  "#Lhhhhwhhhwhhhwhhhwhhhwhhhhhd#",
  "#Lhhhhwhhhwhhhwhhhwhhhwhhhhhd#",
  "#Lhhhhhhhhhhhhhhhhhhhhhhhhhhd#",
  "#Lhhhhhhhhhhhhhhhhhhhhhhhhhhd#",
  "#Lhhhhhhhhhhhhhhhhhhhhhhhhhhd#",
  "#Lhhhhhhhhhhhhhhhhhhhhhhhhhhd#",
  "#Lhhhhwhhhwhhhwhhhwhhhwhhhhhd#",
  "#Lhhhhwhhhwhhhwhhhwhhhwhhhhhd#",
  "#Lhhhhhhhhhhhhhhhhhhhhhhhhhhd#",
  "#Lhhhhhhhhhhhhhhhhhhhhhhhhhhd#",
  "#Lhhhhhhhhhhhhhhhhhhhhhhhhhhd#",
  "#Lhhhhhhhhhhhhhhhhhhhhhhhhhhd#",
  "#Lhhhhhhhhhhhhhhhhhhhhhhhhhhd#",
  "#Lhhhhhhhhhhhhhhhhhhhhhhhhhhd#",
  "#Lhhhhhhhhhhhhhhhhhhhhhhhhhhd#",
  "#Lhhhaaaaaaaaaaaaaaaaaaaahhhd#",
  "#Lhhhhhhhhhhhhhhhhhhhhhhhhhhd#",
  "#Lhhhhhhhhhhhhhhhhhhhhhhhhhhd#",
  "#Lhhhhhhhhhhhhhhhhhhhhhhhhhhd#",
  "#Lhhhhhhhhhhhhhhhhhhhhhhhhhhd#",
  "#dddddddddddddddddddddddddddd#",
  "##############################",
]);

export const DRONE_BAY = sprite([
  "##############",
  "#LLLLLLLLLLLd#",
  "#Lhhhhhhhhhhd#",
  "#Lh########hd#",
  "#Lh#dddddd#hd#",
  "#Lh#dddddd#hd#",
  "#Lh#dggggd#hd#",
  "#Lh#dddddd#hd#",
  "#Lh########hd#",
  "#Lhhhhhhhhhhd#",
  "#Lhhhhhhhhhhd#",
  "#Lhaaaaaaaahd#",
  "#Lhhhhhhhhhhd#",
  "#Lhhhhhhhhhhd#",
  "#dddddddddddd#",
  "##############",
]);

export const SOLAR_PANEL = sprite([
  "########################",
  "#SSSSSSSSSSSSSSSSSSSSSS#",
  "#sssssSsssssSsssssSssss#",
  "#sssssSsssssSsssssSssss#",
  "#sssssSsssssSsssssSssss#",
  "#sssssSsssssSsssssSssss#",
  "#sssssSsssssSsssssSssss#",
  "#sssssSsssssSsssssSssss#",
  "#SSSSSSSSSSSSSSSSSSSSSS#",
  "#sssssSsssssSsssssSssss#",
  "#sssssSsssssSsssssSssss#",
  "#sssssSsssssSsssssSssss#",
  "#sssssSsssssSsssssSssss#",
  "#sssssSsssssSsssssSssss#",
  "#sssssSsssssSsssssSssss#",
  "########################",
]);

export const STRUT = sprite([
  "#d#",
  "#d#",
  "#d#",
  "#d#",
  "#d#",
  "#d#",
  "#d#",
  "#d#",
  "#d#",
  "#d#",
  "#d#",
  "#d#",
  "#d#",
  "#d#",
  "#d#",
]);

export const ANTENNA = sprite([
  "....###....",
  "....#b#....",
  "###########",
  "#LLLLLLLLL#",
  "#LLLLLLLLL#",
  "#####h#####",
  "....#h#....",
  "....#h#....",
  "....#h#....",
  "....#h#....",
  "....#h#....",
  "....#h#....",
  "....#h#....",
  "....#h#....",
  "....#h#....",
]);

export const SPINE = sprite([
  "############################################################################################",
  "#dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd#",
  "#dhdddhdddhdddhdddhdddhdddhdddhdddhdddhdddhdddhdddhdddhdddhdddhdddhdddhdddhdddhdddhdddhdddh#",
  "#dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd#",
  "############################################################################################",
]);

export const DRONE = sprite(["#####", "#LLa#", "#hLL#", "#####"]);
