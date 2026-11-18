import { describe, expect, test } from "bun:test";
import { parseSettings } from "./settings.ts";
import { cueFor, SOUNDS } from "./sounds.ts";
import { buildSamples, SAMPLE_RATE, type Zzfx } from "./zzfx.ts";

/** Whole cycles in the samples, counted by sign changes. */
function cycles(samples: Float32Array): number {
  let crossings = 0;
  for (let i = 1; i < samples.length; i++) {
    if ((samples[i - 1] ?? 0) < 0 !== (samples[i] ?? 0) < 0) crossings++;
  }
  return Math.round(crossings / 2);
}

/** The loudest sample, to three places: samples are 32-bit floats. */
const peak = (samples: Float32Array) =>
  Math.round(samples.reduce((max, s) => Math.max(max, Math.abs(s)), 0) * 1000) / 1000;

describe("the synth", () => {
  const tone: Zzfx = { randomness: 0, frequency: 440, sustain: 1, release: 0 };

  test("a sound lasts its attack, sustain and release", () => {
    const samples = buildSamples({ randomness: 0, attack: 0.005, sustain: 0.03, release: 0.08 });
    expect([samples.length, SAMPLE_RATE]).toEqual([5071, 44100]);
  });

  test("a one-second 440 Hz sine has 440 cycles and peaks at its volume", () => {
    const samples = buildSamples({ ...tone, volume: 0.5 });
    expect([cycles(samples), peak(samples)]).toEqual([440, 0.5]);
  });

  test("randomness detunes by up to its share, and nothing else is random", () => {
    const sharp = buildSamples({ ...tone, randomness: 0.05 }, () => 1);
    const flat = buildSamples({ ...tone, randomness: 0.05 }, () => 0);
    expect([cycles(sharp), cycles(flat)]).toEqual([462, 418]);
    expect(buildSamples(tone, () => 1)).toEqual(buildSamples(tone, () => 0));
  });

  test("slide moves the pitch by 500 Hz a second", () => {
    const up = buildSamples({ ...tone, slide: 0.2 });
    const down = buildSamples({ ...tone, slide: -0.2 });
    expect([cycles(up), cycles(down)]).toEqual([490, 390]);
  });
});

describe("the game's sounds", () => {
  test("are short, and none is louder than its volume", () => {
    const facts = Object.entries(SOUNDS).map(([name, { synth }]) => {
      const samples = buildSamples(synth);
      return [name, samples.length, peak(samples) <= (synth.volume ?? 1)];
    });
    expect(facts).toEqual([
      ["assign", 5071, true],
      ["stop", 5071, true],
      ["done", 3616, true],
      ["levelUp", 27342, true],
    ]);
  });

  test("assign rises and stop falls from the same note", () => {
    expect([
      cycles(buildSamples(SOUNDS.assign.synth)),
      cycles(buildSamples(SOUNDS.stop.synth)),
    ]).toEqual([67, 53]);
  });

  test("each event has its sound", () => {
    expect([
      cueFor({ kind: "job-started", crew: "ana-petrov", action: "iron-asteroid" }),
      cueFor({ kind: "job-stopped", crew: "ana-petrov" }),
      cueFor({ kind: "action-done", crew: "ana-petrov", action: "iron-asteroid" }),
      cueFor({ kind: "level-up", department: "mining", level: 2 }),
    ]).toEqual(["assign", "stop", "done", "levelUp"]);
  });
});

describe("stored sound settings", () => {
  const defaults = { muted: false, effects: 0.6, ambience: 0.4 };

  test("a device with nothing stored gets quiet effects and ambience", () => {
    expect(parseSettings(null)).toEqual(defaults);
  });

  test("what was stored is kept", () => {
    expect(parseSettings('{"muted":true,"effects":0.1,"ambience":0}')).toEqual({
      muted: true,
      effects: 0.1,
      ambience: 0,
    });
  });

  test("anything unreadable falls back to the defaults", () => {
    expect([
      parseSettings("not json"),
      parseSettings('{"muted":"yes","effects":0.5,"ambience":0.5}'),
      parseSettings('{"muted":false,"effects":7,"ambience":0.5}'),
    ]).toEqual([defaults, defaults, defaults]);
  });
});
