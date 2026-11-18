import * as v from "valibot";

const Level = v.pipe(v.number(), v.minValue(0), v.maxValue(1));
const Settings = v.object({ muted: v.boolean(), effects: Level, ambience: Level });

/** Kept per device, outside the save: volume belongs to the device, not to the game. */
export type SoundSettings = v.InferOutput<typeof Settings>;

export const DEFAULT_SETTINGS: SoundSettings = { muted: false, effects: 0.6, ambience: 0.4 };

/** What this device stored, or the defaults when that is missing or unreadable. */
export function parseSettings(stored: string | null): SoundSettings {
  if (stored === null) return DEFAULT_SETTINGS;
  let json: unknown;
  try {
    json = JSON.parse(stored);
  } catch {
    return DEFAULT_SETTINGS;
  }
  const parsed = v.safeParse(Settings, json);
  return parsed.success ? parsed.output : DEFAULT_SETTINGS;
}
