/**
 * The rooms, rendered rather than recorded.
 *
 * A convolution reverb wants an impulse response, and the app has never shipped
 * one: the old room was a burst of noise under an exponential, which reads as a
 * gate opening onto a hall rather than as a hall. A real room has three things
 * a bare exponential lacks — a moment of silence before the first reflection,
 * a handful of discrete early reflections, and a tail whose top end dies sooner
 * than its bottom — and all three are cheap to write down.
 *
 * Nothing here touches Web Audio. The functions take a sample rate and hand back
 * channel data, which is what makes them testable in node and what lets the
 * engine render each room exactly once per context.
 */

export interface EarlyReflections {
  taps: number;
  /** Seconds after the pre-delay of the first tap, and of the last. */
  from: number;
  to: number;
  /** Gain of the first tap, falling to `end` by the last. */
  gain: number;
  end: number;
}

export interface LateTail {
  /** Seconds after the pre-delay before the diffuse tail begins. */
  start: number;
  length: number;
  /** Seconds to fall sixty decibels, per band. Highs always die first. */
  t60Low: number;
  t60Mid: number;
  t60High: number;
}

export interface RoomSpec {
  /** Seconds of nothing before the first reflection: the size of the room. */
  predelay: number;
  early: EarlyReflections;
  tail: LateTail;
  /** Edges of the three bands the tail decays in, in Hz. */
  split: { low: number; high: number };
  /** A resonance of the box itself, which a small closed space has. */
  colour?: { freq: number; q: number; mix: number };
}

/** The music's room: a hall, with a little air before it arrives. */
export const HALL: RoomSpec = {
  predelay: 0.018,
  early: { taps: 8, from: 0.008, to: 0.055, gain: 0.6, end: 0.2 },
  tail: { start: 0.045, length: 2.4, t60Low: 2.6, t60Mid: 2.1, t60High: 1.1 },
  split: { low: 250, high: 3000 },
};

/** The same hall, cut short for a machine that has fallen behind. */
export const HALL_LITE: RoomSpec = { ...HALL, tail: { ...HALL.tail, length: 1.5 } };

/**
 * The table's room: the inside of a cabinet. Reflections arrive at once and
 * the tail is over in a third of a second, with the box's own note under it.
 */
export const CAB: RoomSpec = {
  predelay: 0.002,
  early: { taps: 12, from: 0.001, to: 0.018, gain: 0.7, end: 0.25 },
  tail: { start: 0.012, length: 0.35, t60Low: 0.28, t60Mid: 0.22, t60High: 0.12 },
  split: { low: 300, high: 2500 },
  colour: { freq: 420, q: 1.2, mix: 0.3 },
};

export type Rng = () => number;
/** Channel data with a plain buffer behind it, which is what the audio graph will take. */
export type Samples = Float32Array<ArrayBuffer>;
export type Stereo = [Samples, Samples];

/** Natural log of a thousand: sixty decibels of amplitude. */
const DB60 = Math.log(1000);

/** Peak of every rendered response. Convolvers normalise anyway; this keeps the tests honest. */
const PEAK = 0.5;

/**
 * RMS of each band of the tail where it begins, against a first reflection
 * near 0.7. Diffuse sound sits a little under the reflections that seed it.
 */
const TAIL_LEVEL = 0.2;

const onePole = (freq: number, rate: number) => 1 - Math.exp((-2 * Math.PI * freq) / rate);

/** A one-pole lowpass, as a new array. */
export function onePoleLow(x: Samples, freq: number, rate: number): Samples {
  const a = onePole(freq, rate);
  const out = new Float32Array(x.length);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y += a * (x[i] - y);
    out[i] = y;
  }
  return out;
}

/** What the lowpass leaves out. */
export function onePoleHigh(x: Samples, freq: number, rate: number): Samples {
  const low = onePoleLow(x, freq, rate);
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] - low[i];
  return out;
}

function noise(len: number, rng: Rng): Samples {
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = rng() * 2 - 1;
  return out;
}

/** Scale to unit RMS, so the three bands of a tail start level with each other. */
function levelled(x: Samples): Samples {
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
  const rms = Math.sqrt(sum / Math.max(1, x.length));
  if (rms > 0) for (let i = 0; i < x.length; i++) x[i] /= rms;
  return x;
}

/** A single reflection, as a raised cosine rather than a bare sample. */
function reflect(out: Samples, at: number, gain: number, width: number): void {
  const centre = Math.round(at);
  const half = Math.max(1, Math.round(width / 2));
  for (let k = -half; k <= half; k++) {
    const i = centre + k;
    if (i < 0 || i >= out.length) continue;
    out[i] += gain * 0.5 * (1 + Math.cos((Math.PI * k) / (half + 1)));
  }
}

/** A resonant bandpass (RBJ), for the note a box adds to what is played in it. */
function resonance(x: Samples, freq: number, q: number, rate: number): Samples {
  const w = (2 * Math.PI * freq) / rate;
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0, b2 = -alpha / a0;
  const a1 = (-2 * Math.cos(w)) / a0, a2 = (1 - alpha) / a0;
  const out = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i];
    y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

function normalise(out: Stereo, peak: number): void {
  let max = 0;
  for (const ch of out) for (let i = 0; i < ch.length; i++) max = Math.max(max, Math.abs(ch[i]));
  if (max <= 0) return;
  const k = peak / max;
  for (const ch of out) for (let i = 0; i < ch.length; i++) ch[i] *= k;
}

/**
 * Render a room.
 *
 * Early reflections are placed by hand, each on one side more than the other
 * so the room has a left and a right. The tail is three tails, one per band,
 * each drawn from its own noise and dying at its own rate, and the two
 * channels are drawn from different noise too — a tail that is the same in
 * both ears collapses to the middle of the head.
 */
export function roomImpulse(spec: RoomSpec, rate: number, rng: Rng): Stereo {
  const pre = Math.round(spec.predelay * rate);
  const tailAt = pre + Math.round(spec.tail.start * rate);
  const tailLen = Math.round(spec.tail.length * rate);
  const len = tailAt + tailLen;
  const out: Stereo = [new Float32Array(len), new Float32Array(len)];
  const width = Math.max(2, Math.round(0.0005 * rate));

  const e = spec.early;
  for (let i = 0; i < e.taps; i++) {
    const f = e.taps > 1 ? i / (e.taps - 1) : 0;
    const gain = e.gain + (e.end - e.gain) * f;
    const at = pre + (e.from + (e.to - e.from) * f) * rate;
    for (let ch = 0; ch < 2; ch++) {
      const jitter = (rng() * 2 - 1) * 0.0003 * rate;
      reflect(out[ch], at + jitter, ch === i % 2 ? gain : gain * 0.5, width);
    }
  }

  const { low, high } = spec.split;
  const fade = Math.max(1, Math.round(0.002 * rate));
  for (let ch = 0; ch < 2; ch++) {
    const bands: [Samples, number][] = [
      [levelled(onePoleLow(noise(tailLen, rng), low, rate)), spec.tail.t60Low],
      [levelled(onePoleLow(onePoleHigh(noise(tailLen, rng), low, rate), high, rate)), spec.tail.t60Mid],
      [levelled(onePoleHigh(noise(tailLen, rng), high, rate)), spec.tail.t60High],
    ];
    const dest = out[ch];
    for (const [band, t60] of bands) {
      const k = -DB60 / (t60 * rate);
      for (let i = 0; i < tailLen; i++) {
        dest[tailAt + i] += band[i] * TAIL_LEVEL * Math.exp(k * i) * Math.min(1, i / fade);
      }
    }
  }

  if (spec.colour) {
    const c = spec.colour;
    for (let ch = 0; ch < 2; ch++) {
      const res = resonance(out[ch], c.freq, c.q, rate);
      for (let i = 0; i < len; i++) out[ch][i] += res[i] * c.mix;
    }
  }

  // Nothing below the lowest note of the bass belongs in a room.
  for (let ch = 0; ch < 2; ch++) out[ch] = onePoleHigh(out[ch], 60, rate);
  normalise(out, PEAK);
  return out;
}

/** Hz of the plate's modes, lowest first. The lows ring longest. */
export const BOARD_MODES: readonly number[] =
  [90, 132, 178, 210, 265, 330, 410, 520, 640, 800, 1010, 1300, 1700, 2200];
const BOARD_SECONDS = 0.6;
const BOARD_T60_LOW = 0.9;
const BOARD_T60_HIGH = 0.25;

/**
 * A soundboard: a plate with a dozen modes, struck once.
 *
 * Convolving a note with this is what lets a piano's other strings and its
 * board answer the one that was played. The modes are placed by hand and the
 * higher ones die sooner, the way a wooden plate's do; a whisper of lowpassed
 * noise under them keeps it from ringing like a set of tuning forks.
 */
export function boardImpulse(rate: number, rng: Rng): Stereo {
  const len = Math.round(BOARD_SECONDS * rate);
  const out: Stereo = [new Float32Array(len), new Float32Array(len)];
  const first = BOARD_MODES[0], last = BOARD_MODES[BOARD_MODES.length - 1];
  for (let ch = 0; ch < 2; ch++) {
    const dest = out[ch];
    BOARD_MODES.forEach((f, m) => {
      const t60 = BOARD_T60_LOW
        * Math.pow(BOARD_T60_HIGH / BOARD_T60_LOW, Math.log(f / first) / Math.log(last / first));
      const k = -DB60 / (t60 * rate);
      const gain = 1 / (1 + m * 0.12);
      const phase = rng() * 2 * Math.PI;
      const w = (2 * Math.PI * f) / rate;
      for (let i = 0; i < len; i++) dest[i] += gain * Math.sin(w * i + phase) * Math.exp(k * i);
    });
    const hiss = onePoleLow(noise(len, rng), 2000, rate);
    const k = -DB60 / (0.4 * rate);
    for (let i = 0; i < len; i++) dest[i] += hiss[i] * 0.03 * Math.exp(k * i);
  }
  normalise(out, PEAK);
  return out;
}
