import type { GameEvent } from "../../sim/events.ts";
import type { Zzfx } from "./zzfx.ts";

export type Sound = {
  readonly synth: Zzfx;
  /** Each play is detuned by up to this share, so a sound heard every few seconds never repeats exactly. */
  readonly vary: number;
};

// Tune these by ear in ZzFX's designer (killedbyapixel.github.io/ZzFX) and copy the numbers over by name.
const table = {
  assign: {
    synth: {
      volume: 0.5,
      randomness: 0,
      frequency: 520,
      attack: 0.005,
      sustain: 0.03,
      release: 0.08,
      shape: 1,
      slide: 2,
    },
    vary: 0,
  },
  stop: {
    synth: {
      volume: 0.5,
      randomness: 0,
      frequency: 520,
      attack: 0.005,
      sustain: 0.03,
      release: 0.08,
      shape: 1,
      slide: -2,
    },
    vary: 0,
  },
  done: {
    synth: {
      volume: 0.25,
      randomness: 0,
      frequency: 1040,
      attack: 0.002,
      sustain: 0.01,
      release: 0.07,
    },
    vary: 0.03,
  },
  levelUp: {
    synth: {
      volume: 0.6,
      randomness: 0,
      frequency: 523.25,
      attack: 0.01,
      sustain: 0.16,
      release: 0.35,
      shape: 1,
      pitchJump: 260.74,
      pitchJumpTime: 0.09,
      delay: 0.1,
    },
    vary: 0,
  },
} as const satisfies Record<string, Sound>;

export type SoundName = keyof typeof table;
export const SOUNDS: Readonly<Record<SoundName, Sound>> = table;

/** The sound an event makes, if any. */
export function cueFor(event: GameEvent): SoundName | null {
  switch (event.kind) {
    case "job-started":
      return "assign";
    case "job-stopped":
      return "stop";
    case "action-done":
      return "done";
    case "level-up":
      return "levelUp";
    default: {
      const _exhaustive: never = event;
      return null;
    }
  }
}
