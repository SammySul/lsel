import { ACTIONS, isOnce } from "../../content/actions.ts";
import type { DepartmentId } from "../../content/departments.ts";
import type { GameEvent } from "../../sim/events.ts";
import type { Zzfx } from "./zzfx.ts";

export type Sound = {
  readonly synth: Zzfx;
  /** Each play is detuned by up to this share, so a sound heard every few seconds never repeats exactly. */
  readonly vary: number;
  /** Fanfares that fall together are played one after another instead of on top of each other. */
  readonly fanfare: boolean;
};

const tick = (frequency: number, shape: NonNullable<Zzfx["shape"]>): Zzfx => ({
  volume: 0.25,
  randomness: 0,
  frequency,
  attack: 0.002,
  sustain: 0.01,
  release: 0.07,
  shape,
});

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
    fanfare: false,
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
    fanfare: false,
  },
  waiting: {
    synth: {
      volume: 0.3,
      randomness: 0,
      frequency: 200,
      attack: 0.005,
      sustain: 0.04,
      release: 0.12,
      shape: 1,
      slide: -0.4,
    },
    vary: 0,
    fanfare: false,
  },
  mined: { synth: tick(1040, 0), vary: 0.03, fanfare: false },
  salvaged: { synth: tick(300, 2), vary: 0.05, fanfare: false },
  skimmed: { synth: tick(820, 0), vary: 0.03, fanfare: false },
  cooked: { synth: tick(700, 1), vary: 0.03, fanfare: false },
  refined: { synth: tick(620, 1), vary: 0.03, fanfare: false },
  made: { synth: tick(480, 5), vary: 0.03, fanfare: false },
  sold: {
    synth: {
      volume: 0.35,
      randomness: 0,
      frequency: 1320,
      attack: 0.003,
      sustain: 0.03,
      release: 0.15,
      pitchJump: 660,
      pitchJumpTime: 0.05,
    },
    vary: 0,
    fanfare: false,
  },
  scanned: {
    synth: {
      volume: 0.25,
      randomness: 0,
      frequency: 1400,
      attack: 0.002,
      sustain: 0.01,
      release: 0.15,
      delay: 0.08,
    },
    vary: 0,
    fanfare: false,
  },
  harvested: {
    synth: {
      volume: 0.3,
      randomness: 0,
      frequency: 660,
      attack: 0.005,
      sustain: 0.03,
      release: 0.12,
      shape: 1,
      pitchJump: 220,
      pitchJumpTime: 0.04,
    },
    vary: 0,
    fanfare: false,
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
    fanfare: true,
  },
  mastery: {
    synth: {
      volume: 0.4,
      randomness: 0,
      frequency: 880,
      attack: 0.005,
      sustain: 0.06,
      release: 0.2,
      pitchJump: 440,
      pitchJumpTime: 0.05,
    },
    vary: 0,
    fanfare: true,
  },
  built: {
    synth: {
      volume: 0.7,
      randomness: 0,
      frequency: 392,
      attack: 0.01,
      sustain: 0.25,
      release: 0.5,
      shape: 1,
      pitchJump: 195.33,
      pitchJumpTime: 0.12,
      delay: 0.12,
    },
    vary: 0,
    fanfare: true,
  },
  ready: {
    synth: {
      volume: 0.6,
      randomness: 0,
      frequency: 440,
      attack: 0.01,
      sustain: 0.2,
      release: 0.4,
      pitchJump: 219.26,
      pitchJumpTime: 0.1,
      delay: 0.1,
    },
    vary: 0,
    fanfare: true,
  },
  claimed: {
    synth: {
      volume: 0.6,
      randomness: 0,
      frequency: 349.23,
      attack: 0.01,
      sustain: 0.3,
      release: 0.5,
      shape: 1,
      pitchJump: 174.02,
      pitchJumpTime: 0.15,
      delay: 0.12,
    },
    vary: 0,
    fanfare: true,
  },
  joined: {
    synth: {
      volume: 0.5,
      randomness: 0,
      frequency: 329.63,
      attack: 0.01,
      sustain: 0.2,
      release: 0.25,
      pitchJump: 110.37,
      pitchJumpTime: 0.12,
    },
    vary: 0,
    fanfare: true,
  },
} as const satisfies Record<string, Sound>;

export type SoundName = keyof typeof table;
export const SOUNDS: Readonly<Record<SoundName, Sound>> = table;

// what is made once has its own fanfare, so its last bar stays quiet
const DONE: Readonly<Record<DepartmentId, SoundName | null>> = {
  mining: "mined",
  salvage: "salvaged",
  skimming: "skimmed",
  hydroponics: "cooked",
  refining: "refined",
  fabrication: "made",
  construction: null,
  survey: "scanned",
  research: null,
  trade: "sold",
};

/** The sound an event makes, if any. */
export function cueFor(event: GameEvent): SoundName | null {
  switch (event.kind) {
    case "job-started":
      return "assign";
    case "job-stopped":
      return "stop";
    case "job-waiting":
      return "waiting";
    case "action-done":
      return isOnce(ACTIONS[event.action]) ? null : DONE[ACTIONS[event.action].department];
    case "level-up":
      return "levelUp";
    case "mastery-step":
      return "mastery";
    case "module-built":
      return "built";
    case "unlocked":
      return "ready";
    case "planted":
      return "assign";
    case "harvested":
      return "harvested";
    case "sector-claimed":
      return "claimed";
    case "outpost-changed":
      return "assign";
    case "sector-revealed":
      // the chart's own bar has just sounded
      return null;
    case "crew-joined":
      return "joined";
    default: {
      const _exhaustive: never = event;
      return null;
    }
  }
}
