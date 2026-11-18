// The synth of ZzFX 1.4.0 (github.com/KilledByAPixel/ZzFX, MIT: ZZFX-LICENSE.txt), with named parameters.

export const SAMPLE_RATE = 44100;

/** One sound, in the order ZzFX's designer lists its numbers (a field left out is a hole); times are seconds. */
export type Zzfx = {
  readonly volume?: number;
  readonly randomness?: number;
  readonly frequency?: number;
  readonly attack?: number;
  readonly sustain?: number;
  readonly release?: number;
  /** 0 sine, 1 triangle, 2 saw, 3 tan, 4 noise, 5 square */
  readonly shape?: 0 | 1 | 2 | 3 | 4 | 5;
  readonly shapeCurve?: number;
  /** In 500 Hz per second. */
  readonly slide?: number;
  readonly deltaSlide?: number;
  readonly pitchJump?: number;
  readonly pitchJumpTime?: number;
  readonly repeatTime?: number;
  readonly noise?: number;
  readonly modulation?: number;
  readonly bitCrush?: number;
  readonly delay?: number;
  readonly sustainVolume?: number;
  readonly decay?: number;
  readonly tremolo?: number;
  readonly filter?: number;
};

const PI2 = Math.PI * 2;
const sign = (v: number) => (v < 0 ? -1 : 1);

/** The sound as mono samples at SAMPLE_RATE. `random` only detunes it, by up to `randomness`. */
export function buildSamples(
  sound: Zzfx,
  random: () => number = Math.random,
): Float32Array<ArrayBuffer> {
  const {
    volume = 1,
    randomness = 0.05,
    shape = 0,
    shapeCurve = 1,
    noise = 0,
    bitCrush = 0,
    sustainVolume = 1,
    tremolo = 0,
    filter = 0,
  } = sound;

  let slide = ((sound.slide ?? 0) * 500 * PI2) / SAMPLE_RATE / SAMPLE_RATE;
  const startSlide = slide;
  let frequency =
    ((sound.frequency ?? 220) * (1 + randomness * 2 * random() - randomness) * PI2) / SAMPLE_RATE;
  let startFrequency = frequency;

  // biquad low-pass (positive filter) or high-pass (negative)
  const w = (PI2 * Math.abs(filter) * 2) / SAMPLE_RATE;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / 2 / 2;
  const a0 = 1 + alpha;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  const b0 = (1 + sign(filter) * cos) / 2 / a0;
  const b1 = -(sign(filter) + cos) / a0;
  const b2 = b0;
  let x2 = 0;
  let x1 = 0;
  let y2 = 0;
  let y1 = 0;

  // an attack of 0 would pop
  const attack = (sound.attack ?? 0) * SAMPLE_RATE || 9;
  const decay = (sound.decay ?? 0) * SAMPLE_RATE;
  const sustain = (sound.sustain ?? 0) * SAMPLE_RATE;
  const release = (sound.release ?? 0.1) * SAMPLE_RATE;
  const delay = (sound.delay ?? 0) * SAMPLE_RATE;
  const deltaSlide = ((sound.deltaSlide ?? 0) * 500 * PI2) / SAMPLE_RATE ** 3;
  const modulation = ((sound.modulation ?? 0) * PI2) / SAMPLE_RATE;
  const pitchJump = ((sound.pitchJump ?? 0) * PI2) / SAMPLE_RATE;
  const pitchJumpTime = (sound.pitchJumpTime ?? 0) * SAMPLE_RATE;
  const repeatTime = ((sound.repeatTime ?? 0) * SAMPLE_RATE) | 0;
  const crushEvery = (bitCrush * 100) | 0;

  const length = (attack + decay + sustain + release + delay) | 0;
  const samples = new Float32Array(Math.max(length, 0));
  let t = 0;
  let s = 0;
  let modOffset = 0;
  let repeat = 0;
  let crush = 0;
  let jump = 1;

  for (let i = 0; i < length; i++) {
    crush++;
    if (crushEvery === 0 || crush % crushEvery === 0) {
      if (shape === 5) s = (t / PI2) % 1 < shapeCurve / 2 ? 1 : -1;
      else if (shape === 4) s = Math.sin(t ** 3);
      else if (shape === 3) s = Math.max(Math.min(Math.tan(t), 1), -1);
      else if (shape === 2) s = 1 - (((((2 * t) / PI2) % 2) + 2) % 2);
      else if (shape === 1) s = 1 - 4 * Math.abs(Math.round(t / PI2) - t / PI2);
      else s = Math.sin(t);

      const wobble = repeatTime ? 1 - tremolo + tremolo * Math.sin((PI2 * i) / repeatTime) : 1;
      const curved = shape === 5 ? s : sign(s) * Math.abs(s) ** shapeCurve;
      let envelope = 0;
      if (i < attack) envelope = i / attack;
      else if (i < attack + decay) envelope = 1 - ((i - attack) / decay) * (1 - sustainVolume);
      else if (i < attack + decay + sustain) envelope = sustainVolume;
      else if (i < length - delay) envelope = ((length - i - delay) / release) * sustainVolume;
      s = wobble * curved * envelope;

      if (delay) {
        const tail = i < length - delay ? 1 : (length - i) / delay;
        const echo = delay > i ? 0 : (tail * (samples[(i - delay) | 0] ?? 0)) / 2 / volume;
        s = s / 2 + echo;
      }
      if (filter) {
        const out = b2 * x2 + b1 * x1 + b0 * s - a2 * y2 - a1 * y1;
        x2 = x1;
        x1 = s;
        y2 = y1;
        y1 = out;
        s = out;
      }
    }

    slide += deltaSlide;
    frequency += slide;
    const f = frequency * Math.cos(modulation * modOffset);
    modOffset++;
    t += f + f * noise * (((i * i * PI2) % 2) - 1);

    if (jump) {
      jump++;
      if (jump > pitchJumpTime) {
        frequency += pitchJump;
        startFrequency += pitchJump;
        jump = 0;
      }
    }
    if (repeatTime) {
      repeat++;
      if (repeat % repeatTime === 0) {
        frequency = startFrequency;
        slide = startSlide;
        jump ||= 1;
      }
    }
    samples[i] = s * volume;
  }
  return samples;
}
