export const SIZE = { min: 8, max: 96, default: 16 } as const;

export interface Prefs {
  /** Fonts the user switched off; a font added later starts switched on. */
  hidden: string[];
  /** Preview size in px. */
  size: number;
}

const KEY = "typ:prefs:v1";

export type PrefsStorage = Pick<Storage, "getItem" | "setItem">;

export const clampSize = (n: number) => Math.min(SIZE.max, Math.max(SIZE.min, Math.round(n)));

/** The stored choices; anything unreadable falls back to every font shown at the default size. */
export function readPrefs(storage: PrefsStorage | undefined): Prefs {
  const fallback: Prefs = { hidden: [], size: SIZE.default };
  let data: unknown;
  try {
    data = JSON.parse(storage?.getItem(KEY) ?? "null");
  } catch {
    return fallback;
  }
  if (typeof data !== "object" || data === null) return fallback;
  const { hidden, size } = data as Record<string, unknown>;
  return {
    hidden: Array.isArray(hidden) ? hidden.filter((h) => typeof h === "string") : fallback.hidden,
    size: typeof size === "number" && Number.isFinite(size) ? clampSize(size) : fallback.size,
  };
}

export function writePrefs(storage: PrefsStorage | undefined, prefs: Prefs): void {
  try {
    storage?.setItem(KEY, JSON.stringify(prefs));
  } catch {}
}
