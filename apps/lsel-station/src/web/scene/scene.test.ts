import { describe, expect, test } from "bun:test";
import { ASTEROID_RELIEF, drawAsteroid, drawPlanet } from "./bodies.ts";
import type { Color, Put } from "./palette.ts";
import { sprite } from "./sprites.ts";

function paint(draw: (put: Put) => void): Map<string, Color> {
  const pixels = new Map<string, Color>();
  draw((x, y, color) => pixels.set(`${x},${y}`, color));
  return pixels;
}

const distances = (pixels: Map<string, Color>) =>
  [...pixels.keys()].map((key) => {
    const [x = 0, y = 0] = key.split(",").map(Number);
    return Math.hypot(x, y);
  });

describe("a planet", () => {
  const pixels = paint((put) => drawPlanet(put, { x: 0, y: 0, radius: 10, seed: 3 }));

  test("fills its disc and stops at the rim", () => {
    let missing = 0;
    for (let y = -10; y <= 10; y++) {
      for (let x = -10; x <= 10; x++) {
        if (Math.hypot(x, y) <= 10 && !pixels.has(`${x},${y}`)) missing++;
      }
    }
    expect([missing, distances(pixels).filter((d) => d >= 11.2)]).toEqual([0, []]);
  });

  test("is lit from the upper right", () => {
    expect([pixels.get("5,-6"), pixels.get("-7,7")]).toEqual(["planet3", "planet0"]);
  });
});

describe("an asteroid", () => {
  const pixels = paint((put) => drawAsteroid(put, { x: 0, y: 0, radius: 10, seed: 4 }));

  test("is solid rock at its center, with no outline", () => {
    expect([...new Set(pixels.values())].sort()).toEqual(["rock", "rockDark", "rockLight"]);
    expect(pixels.has("0,0")).toBe(true);
  });

  test("stays within its relief", () => {
    expect(ASTEROID_RELIEF).toBe(0.32);
    expect(distances(pixels).filter((d) => d >= 13.2)).toEqual([]);
  });
});

describe("a sprite grid", () => {
  test("reads pixels, and a vertical run of w as one window", () => {
    const s = sprite(["#w.", "#w#", ".b#"]);
    expect({ ...s, pixels: s.pixels.length }).toEqual({
      width: 3,
      height: 3,
      pixels: 7,
      windows: [{ x: 1, y: 0, height: 2 }],
      beacons: [{ x: 1, y: 2 }],
    });
  });

  test("refuses a ragged row and a color outside the legend", () => {
    expect(() => sprite(["##", "#"])).toThrow("sprite row 1 is 1 wide, not 2");
    expect(() => sprite(["#x"])).toThrow('sprite row 0 has an unknown color "x"');
  });
});
