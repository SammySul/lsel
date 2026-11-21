import { persisted } from "@sammysul/lsel";
import * as v from "valibot";

export const SIZE = { min: 8, max: 96, default: 16 } as const;

export const clampSize = (n: number) => Math.min(SIZE.max, Math.max(SIZE.min, Math.round(n)));

export const Prefs = v.object({
  /** Fonts switched off, so a font added later starts switched on. */
  hidden: v.fallback(v.array(v.string()), []),
  size: v.fallback(v.pipe(v.number(), v.finite(), v.transform(clampSize)), SIZE.default),
});

export const prefs = persisted("typ:prefs:v1", Prefs, { hidden: [], size: SIZE.default });
