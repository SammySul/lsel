import { SAMPLE_RATE } from "./zzfx.ts";

const LOOP_S = 4;
const BLEND_S = 0.25;

/** Brown noise that loops without a seam: its start is cross-faded with what would have followed its end. */
function noiseLoop(ctx: AudioContext): AudioBuffer {
  const length = LOOP_S * SAMPLE_RATE;
  const blend = BLEND_S * SAMPLE_RATE;
  const raw = new Float32Array(length + blend);
  let last = 0;
  for (let i = 0; i < raw.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    raw[i] = last * 3.5;
  }
  const buffer = ctx.createBuffer(1, length, SAMPLE_RATE);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const head = raw[i] ?? 0;
    const mix = i / blend;
    data[i] = i < blend ? head * mix + (raw[length + i] ?? 0) * (1 - mix) : head;
  }
  return buffer;
}

/** A slow sine that moves `target` up and down by `depth`. */
function drift(ctx: AudioContext, hz: number, depth: number, target: AudioParam): OscillatorNode {
  const lfo = ctx.createOscillator();
  const amount = ctx.createGain();
  lfo.frequency.value = hz;
  amount.gain.value = depth;
  lfo.connect(amount).connect(target);
  lfo.start();
  return lfo;
}

/** The station's quiet bed: a deep rumble that drifts slowly, and nothing else. It rests while the context is suspended. */
export function startAmbience(ctx: AudioContext, out: AudioNode): { stop(): void } {
  const hum = ctx.createBufferSource();
  hum.buffer = noiseLoop(ctx);
  hum.loop = true;
  const low = ctx.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 180;
  low.Q.value = 0.5;
  const humLevel = ctx.createGain();
  humLevel.gain.value = 0.7;
  hum.connect(low).connect(humLevel).connect(out);
  hum.start();
  // two periods that share no multiple, so the bed never audibly repeats
  const drifts = [drift(ctx, 0.05, 40, low.frequency), drift(ctx, 0.023, 0.12, humLevel.gain)];

  return {
    stop() {
      hum.stop();
      for (const lfo of drifts) lfo.stop();
    },
  };
}
