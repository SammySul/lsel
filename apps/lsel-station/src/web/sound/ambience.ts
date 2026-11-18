import { SAMPLE_RATE } from "./zzfx.ts";

// A minor pentatonic, A3 to A4: any two of these sound fine together
const SCALE = [220, 261.63, 293.66, 329.63, 392, 440];
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

/**
 * The station's quiet bed, into `out`: a low hum of filtered noise that drifts, and now and then a soft note with
 * an echo. It follows the context, so it rests whenever the context is suspended.
 */
export function startAmbience(ctx: AudioContext, out: AudioNode): { stop(): void } {
  const hum = ctx.createBufferSource();
  hum.buffer = noiseLoop(ctx);
  hum.loop = true;
  const low = ctx.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 300;
  const humLevel = ctx.createGain();
  humLevel.gain.value = 0.8;
  hum.connect(low).connect(humLevel).connect(out);
  hum.start();
  // two periods that share no multiple, so the bed never audibly repeats
  const drifts = [drift(ctx, 0.07, 70, low.frequency), drift(ctx, 0.031, 0.15, humLevel.gain)];

  const echo = ctx.createDelay(1);
  echo.delayTime.value = 0.42;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.35;
  echo.connect(feedback).connect(echo);
  echo.connect(out);

  let timer: ReturnType<typeof setTimeout>;
  function note(): void {
    timer = setTimeout(note, 5000 + Math.random() * 9000);
    if (ctx.state !== "running") return;
    const voice = ctx.createOscillator();
    const level = ctx.createGain();
    const now = ctx.currentTime;
    voice.frequency.value = SCALE[Math.floor(Math.random() * SCALE.length)] ?? 220;
    level.gain.setValueAtTime(0, now);
    level.gain.linearRampToValueAtTime(0.2, now + 0.6);
    level.gain.setTargetAtTime(0, now + 0.6, 1.2);
    voice.connect(level);
    level.connect(out);
    level.connect(echo);
    voice.start(now);
    voice.stop(now + 8);
  }
  timer = setTimeout(note, 4000);

  return {
    stop() {
      clearTimeout(timer);
      hum.stop();
      for (const lfo of drifts) lfo.stop();
    },
  };
}
