// Every effect's synth parameters.

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

type Soft = 0 | 1;

// a sine has no overtones to take off; a triangle's are softened
const lowPass = (shape: Soft) => (shape === 1 ? -600 : 0);

/** A soft knock for a finished job: a low tone that drops a little and dies fast. */
const knock = (frequency: number, shape: Soft): Zzfx => ({
  volume: 0.35,
  randomness: 0,
  frequency,
  attack: 0.004,
  sustain: 0.01,
  release: 0.1,
  shape,
  slide: -0.3,
  filter: lowPass(shape),
});

/** Two low notes, the second a third to a fifth up, for something that matters. */
const chime = (
  frequency: number,
  up: number,
  at: number,
  length: number,
  volume: number,
  shape: Soft,
): Zzfx => ({
  volume,
  randomness: 0,
  frequency,
  attack: 0.02,
  sustain: length,
  release: length * 2,
  shape,
  pitchJump: up,
  pitchJumpTime: at,
  filter: lowPass(shape),
});

// Low and rounded on purpose (sine and triangle under 400 Hz); tune by ear in ZzFX's designer.
const table = {
  assign: {
    synth: {
      volume: 0.35,
      randomness: 0,
      frequency: 294,
      attack: 0.006,
      sustain: 0.02,
      release: 0.08,
      shape: 1,
      slide: 0.6,
      filter: lowPass(1),
    },
    vary: 0,
    fanfare: false,
  },
  stop: {
    synth: {
      volume: 0.35,
      randomness: 0,
      frequency: 294,
      attack: 0.006,
      sustain: 0.02,
      release: 0.08,
      shape: 1,
      slide: -0.6,
      filter: lowPass(1),
    },
    vary: 0,
    fanfare: false,
  },
  waiting: {
    synth: {
      volume: 0.3,
      randomness: 0,
      frequency: 147,
      attack: 0.008,
      sustain: 0.04,
      release: 0.14,
      shape: 1,
      slide: -0.2,
      filter: lowPass(1),
    },
    vary: 0,
    fanfare: false,
  },
  mined: { synth: knock(196, 1), vary: 0.03, fanfare: false },
  salvaged: { synth: knock(147, 1), vary: 0.05, fanfare: false },
  skimmed: { synth: knock(262, 0), vary: 0.03, fanfare: false },
  cooked: { synth: knock(220, 0), vary: 0.03, fanfare: false },
  refined: { synth: knock(165, 1), vary: 0.03, fanfare: false },
  made: { synth: knock(131, 1), vary: 0.03, fanfare: false },
  sold: { synth: chime(330, 110, 0.06, 0.03, 0.35, 0), vary: 0, fanfare: false },
  scanned: {
    synth: {
      volume: 0.3,
      randomness: 0,
      frequency: 294,
      attack: 0.01,
      sustain: 0.02,
      release: 0.3,
      slide: 0.1,
    },
    vary: 0,
    fanfare: false,
  },
  harvested: { synth: chime(262, 68, 0.05, 0.03, 0.35, 1), vary: 0, fanfare: false },
  levelUp: { synth: chime(262, 130, 0.1, 0.14, 0.5, 1), vary: 0, fanfare: true },
  mastery: { synth: chime(330, 110, 0.07, 0.06, 0.35, 0), vary: 0, fanfare: true },
  built: { synth: chime(196, 98, 0.14, 0.22, 0.6, 1), vary: 0, fanfare: true },
  ready: { synth: chime(262, 131, 0.12, 0.16, 0.45, 0), vary: 0, fanfare: true },
  claimed: { synth: chime(175, 87, 0.16, 0.25, 0.6, 1), vary: 0, fanfare: true },
  joined: { synth: chime(220, 110, 0.12, 0.16, 0.45, 0), vary: 0, fanfare: true },
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
