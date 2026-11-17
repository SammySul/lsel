// The text/background pairs DESIGN.md allows, held to WCAG AA (4.5:1) against the palette itself.
import { expect, test } from "bun:test";

const palette = JSON.parse(
  Bun.spawnSync(["nix", "eval", "--json", ".#lib.palette"], { cwd: `${import.meta.dir}/..` }).stdout.toString(),
) as Record<string, string>;

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg: string, bg: string): number {
  const [hi, lo] = [luminance(palette[fg] as string), luminance(palette[bg] as string)].sort(
    (a, b) => b - a,
  ) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const ALLOWED: Record<string, string[]> = {
  text: ["base", "raise", "surface"],
  accent: ["base"],
  error: ["base", "raise", "surface"],
  warning: ["base", "raise", "surface"],
  select: ["base", "raise", "surface"],
  subtle: ["base", "raise"],
  success: ["base", "raise", "surface"],
};

test.each(Object.entries(ALLOWED))("%s is readable on %j", (fg, bgs) => {
  for (const bg of bgs) expect({ fg, bg, ok: contrast(fg, bg) >= 4.5 }).toEqual({ fg, bg, ok: true });
});

test("muted is never body text: it fails AA even on base", () => {
  expect(contrast("muted", "base")).toBeLessThan(4.5);
});

test("the accent carries text drawn in base, for filled buttons", () => {
  expect(contrast("base", "accent")).toBeGreaterThanOrEqual(4.5);
});
