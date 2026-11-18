import type { GameEvent } from "../../sim/events.ts";
import { startAmbience } from "./ambience.ts";
import { parseSettings, type SoundSettings } from "./settings.ts";
import { cueFor, SOUNDS, type SoundName } from "./sounds.ts";
import { buildSamples, SAMPLE_RATE } from "./zzfx.ts";

const STORAGE_KEY = "lsel-station.sound";
// ZzFX's own master level, which its designer's volumes assume
const MASTER = 0.3;
const FADE_S = 0.02;
const MIN_GAP_S = 0.05;
// fanfares further behind than this are dropped: a sound is for now, not for later
const MAX_WAIT_S = 2;

type Graph = {
  ctx: AudioContext;
  master: GainNode;
  effects: GainNode;
  ambience: GainNode;
  bed: { stop(): void };
};

export type Sound = ReturnType<typeof createSound>;

function stored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** All of the game's sound. Nothing is created until the first key press or click, as browsers require. */
export function createSound() {
  let settings = $state.raw(parseSettings(stored()));
  let graph: Graph | undefined;
  let resting: ReturnType<typeof setTimeout> | undefined;
  const buffers = new Map<SoundName, AudioBuffer>();
  const lastPlayed = new Map<SoundName, number>();
  let fanfareEnd = 0;

  const audible = () => !settings.muted && document.visibilityState === "visible";

  function open(): Graph {
    const ctx = new AudioContext();
    const master = ctx.createGain();
    const effects = ctx.createGain();
    const ambience = ctx.createGain();
    master.gain.value = 0;
    effects.gain.value = settings.effects;
    ambience.gain.value = settings.ambience;
    effects.connect(master);
    ambience.connect(master);
    master.connect(ctx.destination);
    return { ctx, master, effects, ambience, bed: startAmbience(ctx, ambience) };
  }

  /** Runs the context while the game should be heard and rests it otherwise; only `gesture` may create it. */
  function sync(gesture: boolean): void {
    clearTimeout(resting);
    if (audible()) {
      if (graph === undefined) {
        if (!gesture) return;
        graph = open();
      }
      void graph.ctx.resume();
      graph.master.gain.setTargetAtTime(MASTER, graph.ctx.currentTime, FADE_S);
    } else if (graph !== undefined) {
      // a hidden tab that keeps sounding is never throttled, and plays to nobody
      const { ctx, master } = graph;
      master.gain.setTargetAtTime(0, ctx.currentTime, FADE_S);
      resting = setTimeout(() => void ctx.suspend(), 150);
    }
  }

  function onGesture(): void {
    // Esc is a key press but not an activation, and a context made before one logs a warning
    if (!(navigator.userActivation?.hasBeenActive ?? true)) return;
    if (graph === undefined || graph.ctx.state !== "running") sync(true);
  }
  const onVisibility = () => sync(false);
  const GESTURES = ["keydown", "pointerdown", "pointerup"] as const;
  for (const type of GESTURES) addEventListener(type, onGesture, { capture: true });
  document.addEventListener("visibilitychange", onVisibility);

  function play(name: SoundName): void {
    if (graph === undefined || !audible()) return;
    const { ctx, effects } = graph;
    const now = ctx.currentTime;
    const last = lastPlayed.get(name);
    if (last !== undefined && now - last < MIN_GAP_S) return;
    lastPlayed.set(name, now);
    const { synth, vary, fanfare } = SOUNDS[name];
    let buffer = buffers.get(name);
    if (buffer === undefined) {
      const samples = buildSamples(synth);
      buffer = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
      buffer.copyToChannel(samples, 0);
      buffers.set(name, buffer);
    }
    const when = fanfare ? Math.max(now, fanfareEnd) : now;
    if (when - now > MAX_WAIT_S) return;
    if (fanfare) fanfareEnd = when + buffer.duration * 0.7;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 1 + (Math.random() * 2 - 1) * vary;
    source.connect(effects);
    source.start(when);
  }

  function change(next: SoundSettings): void {
    settings = next;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // a browser that refuses storage keeps the setting for this visit only
    }
  }

  return {
    get settings(): SoundSettings {
      return settings;
    },
    /** Plays the sound of something that just happened; an event that cannot be heard now is dropped, never queued. */
    hear(event: GameEvent): void {
      const cue = cueFor(event);
      if (cue !== null) play(cue);
    },
    /** Call from a key press or click. */
    toggle(): void {
      change({ ...settings, muted: !settings.muted });
      sync(true);
    },
    setLevel(bus: "effects" | "ambience", level: number): void {
      change({ ...settings, [bus]: level });
      graph?.[bus].gain.setTargetAtTime(level, graph.ctx.currentTime, FADE_S);
    },
    stop(): void {
      clearTimeout(resting);
      for (const type of GESTURES) removeEventListener(type, onGesture, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
      graph?.bed.stop();
      void graph?.ctx.close();
    },
  };
}
