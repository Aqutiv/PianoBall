/**
 * Strings, rendered rather than oscillated.
 *
 * A plucked string is a loop: the pluck goes round a delay the length of one
 * period, losing a little brightness on every pass, and that is the whole
 * sound — the attack, the decay from the top down, the way a hard pluck rings
 * brighter than a soft one. Oscillators cannot do it and a browser's delay
 * node cannot run a loop shorter than a render quantum, so the string is
 * rendered here into a buffer, in a millisecond or so, and played back like
 * a note. It is still not a recording: nothing here existed before the note
 * was asked for.
 *
 * Extended Karplus-Strong, after Jaffe and Smith: the loop carries a two-tap
 * average whose weighting stretches the decay, a one-pole lowpass for the
 * damping, and a first-order allpass for the fraction of a sample the period
 * does not divide into, which is what keeps the string in tune with the
 * oscillators around it.
 */
import { noteToFreq } from '../midi/notes';
import type { Rng, Samples } from './rooms';

export interface StringSpec {
  /** Seconds to fall sixty decibels, at C4. */
  decay: number;
  /** Octave exponent on the decay. A piano's strings are about -0.6. */
  keyTrack: number;
  /** Brightness lost on every pass round the loop, 0..1. */
  damp: number;
  /** Jaffe-Smith stretch, 0..1. A half is plain Karplus-Strong. */
  stretch: number;
  /** Where along the string it is plucked, 0..0.5: a comb on the excitation. */
  pick: number;
  /** Lowpass on the pluck at the softest strike, and at the hardest, in Hz. */
  bright: number;
  velBright: number;
}

/** Four strengths of pluck. Loudness stays continuous; only the colour is stepped. */
export type Bucket = 0 | 1 | 2 | 3;

export function velocityBucket(v: number): Bucket {
  return Math.min(3, Math.floor(Math.max(0, Math.min(1, v)) * 4)) as Bucket;
}

/** Longest string rendered, in seconds: past this a buffer costs more than it rings. */
export const STRING_MAX_SECONDS = 3;
/** A block whose RMS falls under this — eighty decibels down — ends the render. */
const SILENCE = 1e-4;
const BLOCK = 2048;
const C4 = 60;

/** Seconds a string at this note takes to fall sixty decibels. */
export function stringSeconds(spec: StringSpec, note: number): number {
  return Math.min(STRING_MAX_SECONDS, spec.decay * Math.pow(2, (spec.keyTrack * (note - C4)) / 12));
}

export function renderString(spec: StringSpec, note: number, bucket: Bucket, rate: number, rng: Rng): Samples {
  const freq = noteToFreq(note);
  const period = rate / freq;
  const s = spec.stretch;
  // The loop's other parts each delay the signal a little: the two-tap
  // average by its weighting, the lowpass by its coefficient. The delay line
  // takes the whole samples of what is left and the allpass the fraction.
  const lowpassDelay = spec.damp / (1 - spec.damp);
  const whole = period - s - lowpassDelay;
  const n = Math.max(2, Math.floor(whole - 0.1));
  const fraction = whole - n;
  const c = (1 - fraction) / (1 + fraction);
  const t60 = stringSeconds(spec, note);
  const g = Math.pow(10, -3 / (t60 * rate));
  const len = Math.min(Math.round(1.2 * t60 * rate), STRING_MAX_SECONDS * rate);

  // The pluck: noise, dulled by how softly the string was struck, with the
  // comb of the pick's position on it, filling the loop once.
  const cut = spec.bright + (spec.velBright - spec.bright) * (bucket / 3);
  const a = 1 - Math.exp((-2 * Math.PI * cut) / rate);
  const line = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    lp += a * (rng() * 2 - 1 - lp);
    line[i] = lp;
  }
  const pickAt = Math.round(spec.pick * n);
  if (pickAt > 0) for (let i = n - 1; i >= pickAt; i--) line[i] -= line[i - pickAt];
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(line[i]));
  if (peak > 0) for (let i = 0; i < n; i++) line[i] *= 0.9 / peak;

  const out = new Float32Array(len);
  let head = 0;
  let last = 0;
  let z = 0;
  let apIn = 0;
  let apOut = 0;
  let acc = 0;
  let end = len;
  for (let i = 0; i < len; i++) {
    const oldest = line[head];
    const y = g * ((1 - s) * oldest + s * last);
    last = oldest;
    z = (1 - spec.damp) * y + spec.damp * z;
    const ap = c * z + apIn - c * apOut;
    apIn = z;
    apOut = ap;
    line[head] = ap;
    head = head + 1 === n ? 0 : head + 1;
    out[i] = ap;
    acc += ap * ap;
    if ((i + 1) % BLOCK === 0) {
      if (Math.sqrt(acc / BLOCK) < SILENCE) { end = i + 1; break; }
      acc = 0;
    }
  }
  return end < len ? out.slice(0, end) : out;
}

/**
 * A cache that forgets its oldest entries first, by count and by weight.
 *
 * Rendered strings are cheap to make and dear to keep: three seconds of one
 * note is half a megabyte, and a harp across the keyboard at four strengths
 * of pluck would be more memory than a phone wants held. Reading an entry
 * makes it the newest.
 */
export class Lru<T> {
  private map = new Map<string, { value: T; bytes: number }>();
  bytes = 0;

  constructor(readonly maxEntries: number, readonly maxBytes: number) {}

  get size(): number { return this.map.size; }

  get(key: string): T | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }

  set(key: string, value: T, bytes: number): void {
    const old = this.map.get(key);
    if (old) {
      this.bytes -= old.bytes;
      this.map.delete(key);
    }
    this.map.set(key, { value, bytes });
    this.bytes += bytes;
    while (this.map.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.bytes -= this.map.get(oldest.value)!.bytes;
      this.map.delete(oldest.value);
    }
  }

  clear(): void {
    this.map.clear();
    this.bytes = 0;
  }
}
