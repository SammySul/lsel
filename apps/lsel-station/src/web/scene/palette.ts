// The scene's palette: no other color is drawn.

/** The scene's whole palette (spec 12.2): nothing in the scene is drawn in any other color. */
export const PALETTE = {
  space: "#0b1020",
  nebula: "#141b33",
  star: "#e8ecf7",
  starDim: "#5a6791",
  hullLight: "#c9d2e6",
  hull: "#7f8cab",
  hullDark: "#414a6b",
  outline: "#05070f",
  warm: "#ffb347",
  glow: "#ffd27a",
  alert: "#e0523f",
  beam: "#7ef0ff",
  solar: "#2b4a8c",
  solarLine: "#6f9be0",
  green: "#5fd16a",
  greenDark: "#2f8f4a",
  planet0: "#0f2a3a",
  planet1: "#1b5560",
  planet2: "#2f8f86",
  planet3: "#a6e3c5",
  land: "#d98a4a",
  landDark: "#8a5a3a",
  rockLight: "#9a8f8a",
  rock: "#6b6064",
  rockDark: "#3b3440",
  ghost: "#4a5788",
} as const;

export type Color = keyof typeof PALETTE;

/** Paints one art pixel. */
export type Put = (x: number, y: number, color: Color) => void;
