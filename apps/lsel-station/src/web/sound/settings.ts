import { persisted } from "@sammysul/lsel";
import * as v from "valibot";

const Level = v.pipe(v.number(), v.minValue(0), v.maxValue(1));
const Settings = v.object({ muted: v.boolean(), effects: Level, ambience: Level });

export type SoundSettings = v.InferOutput<typeof Settings>;

const DEFAULT_SETTINGS: SoundSettings = { muted: false, effects: 0.6, ambience: 0.4 };

/** Kept per device, outside the save: volume belongs to the device, not to the game. */
export const storedSettings = (storage?: Parameters<typeof persisted>[3]) =>
  persisted("lsel-station.sound", Settings, DEFAULT_SETTINGS, storage);
