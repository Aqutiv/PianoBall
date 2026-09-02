/**
 * Spectra: the partial tables a `spectrum` layer is built from.
 *
 * The four waves a browser ships are most of the reason a synth sounds like
 * one. A `PeriodicWave` can be any set of partials at all, and the browser
 * band-limits it for free — so a piano string, a reed, a vowel or a drawbar
 * registration is a short function of the partial number, computed once per
 * register and cached. Nothing here touches Web Audio; the engine turns the
 * tables into waves.
 */
import { noteToFreq } from '../midi/notes';

export type SpectrumGen = 'piano' | 'saw' | 'pulse' | 'formant' | 'reed' | 'bowed' | 'drawbar';

export const SPECTRA: readonly SpectrumGen[] =
  ['piano', 'saw', 'pulse', 'formant', 'reed', 'bowed', 'drawbar'];

/** A generator and, where it takes any, its parameters. Cached by both. */
export interface SpectrumRef {
  gen: SpectrumGen;
  params?: readonly number[];
}

/**
 * Which part of the keyboard a table is built for.
 *
 * A real instrument's spectrum changes across its range — a bass string has
 * dozens of partials, a top one a handful — and a table built for the middle
 * would alias at the top and sound thin at the bottom. Four is enough steps
 * for the ear and few enough tables to build on the way in.
 */
export type Register = 0 | 1 | 2 | 3;
export const REGISTERS: readonly Register[] = [0, 1, 2, 3];
/** Highest note of each register, which bounds how many partials fit under Nyquist. */
const REGISTER_TOP = [47, 71, 83, 108];
/** The note a register's absolute-pitch shapes (formants, bows) are placed for. */
const REGISTER_CENTRE = [36, 60, 78, 96];

export function registerOf(note: number): Register {
  if (note <= REGISTER_TOP[0]) return 0;
  if (note <= REGISTER_TOP[1]) return 1;
  if (note <= REGISTER_TOP[2]) return 2;
  return 3;
}

export function spectrumKey(ref: SpectrumRef, register: Register): string {
  return `${ref.gen}:${(ref.params ?? []).join(',')}:${register}`;
}

/** Partial amplitudes, in the two arrays `createPeriodicWave` takes. Sines only. */
export interface Partials {
  real: Float32Array<ArrayBuffer>;
  imag: Float32Array<ArrayBuffer>;
}

/** Most partials any generator writes. Above this the tables cost more than they sound. */
const MAX_PARTIALS = 48;

interface Generator {
  /** Partials wanted in a register, before the Nyquist cap. */
  max(register: Register): number;
  /** Amplitude of partial `k`, given the register's centre pitch in Hz. */
  amp(k: number, f0: number, params: readonly number[], register: Register): number;
}

/**
 * A piano string, by register: the rolloff steepens and the partials thin
 * out going up, and the strike point — a hammer lands about an eighth of the
 * way along — takes a bite out of the partials whose node it sits on.
 */
const PIANO: readonly [p: number, kc: number, max: number][] =
  [[1.0, 40, 48], [1.3, 20, 32], [1.8, 8, 16], [2.5, 4, 8]];
const STRIKE = 0.12;

/** Which harmonic each of the nine drawbars sounds, 16' first, 1' last. */
const DRAWBAR_HARMONICS = [1, 3, 2, 4, 6, 8, 10, 12, 16];
/** Three drawbars out: the registration an organ is switched on with. */
const DEFAULT_DRAWBARS = [8, 8, 8, 0, 0, 0, 0, 0, 0];

const gaussian = (f: number, centre: number, width: number) => Math.exp(-(((f - centre) / width) ** 2));

const GENERATORS: Record<SpectrumGen, Generator> = {
  piano: {
    max: (r) => PIANO[r][2],
    amp: (k, _f0, _p, r) => {
      const [p, kc] = PIANO[r];
      return Math.pow(k, -p) * Math.exp(-k / kc) * Math.abs(Math.sin(Math.PI * k * STRIKE));
    },
  },
  /** One over k to a power. The power is the parameter; one is a sawtooth. */
  saw: {
    max: () => MAX_PARTIALS,
    amp: (k, _f0, p) => Math.pow(k, -(p[0] ?? 1)),
  },
  /** A pulse of the given width. Narrow is nasal; a half is a square. */
  pulse: {
    max: () => MAX_PARTIALS,
    amp: (k, _f0, p) => Math.abs(Math.sin(Math.PI * k * (p[0] ?? 0.3))) / k,
  },
  /**
   * A vowel: three formants at absolute frequencies, so the same 'ah' sits in
   * the same place in every register. Parameters are F1, F2, F3 and the width
   * of the first; the defaults are an open 'ah'. A faint one-over-k under
   * them keeps a register whose partials miss every formant from going silent.
   */
  formant: {
    max: () => MAX_PARTIALS,
    amp: (k, f0, p) => {
      const [f1 = 800, f2 = 1150, f3 = 2900, bw = 150] = p;
      const f = k * f0;
      return 0.02 / k + gaussian(f, f1, bw) + 0.6 * gaussian(f, f2, bw * 1.3) + 0.35 * gaussian(f, f3, bw * 1.6);
    },
  },
  /** A reed: strong odd partials, weak even ones, and a bump where the bark is. */
  reed: {
    max: () => 32,
    amp: (k) => ((k % 2 ? 1 : 0.35) / k) * (k >= 6 && k <= 10 ? 1.6 : 1),
  },
  /** A bowed string: one over k with the body's resonance near 2 kHz and nothing much above 6. */
  bowed: {
    max: () => MAX_PARTIALS,
    amp: (k, f0) => {
      const f = k * f0;
      return (1 / k) * (1 + 0.8 * gaussian(f, 2000, 600)) * Math.exp(-Math.max(0, f - 6000) / 3000);
    },
  },
  /**
   * Drawbars, nine levels of 0..8 in the order the bars sit on the console.
   * Three decibels a step, which is what the real thing's contacts give. The
   * 16' bar is the fundamental here, so a layer playing this at half the
   * note's frequency puts the 8' bar on the written pitch.
   */
  drawbar: {
    max: () => DRAWBAR_HARMONICS[DRAWBAR_HARMONICS.length - 1],
    amp: (k, _f0, p) => {
      const i = DRAWBAR_HARMONICS.indexOf(k);
      if (i < 0) return 0;
      const level = p[i] ?? DEFAULT_DRAWBARS[i];
      return level <= 0 ? 0 : Math.pow(10, (-(8 - level) * 3) / 20);
    },
  },
};

/**
 * The partial table for a generator in a register, peak-normalised.
 *
 * Capped under Nyquist for the register's highest note, so nothing a table
 * holds can fold back down — the browser culls the rest per octave anyway,
 * but a table that stops where the ear does is also a smaller table.
 */
export function spectrum(ref: SpectrumRef, register: Register, sampleRate: number): Partials {
  const gen = GENERATORS[ref.gen];
  const params = ref.params ?? [];
  const top = noteToFreq(REGISTER_TOP[register]);
  const f0 = noteToFreq(REGISTER_CENTRE[register]);
  const cap = Math.max(1, Math.min(gen.max(register), Math.floor(sampleRate / 2 / top) - 1));
  const real = new Float32Array(cap + 1);
  const imag = new Float32Array(cap + 1);
  let peak = 0;
  for (let k = 1; k <= cap; k++) {
    const a = Math.max(0, gen.amp(k, f0, params, register));
    imag[k] = a;
    peak = Math.max(peak, a);
  }
  if (peak > 0) for (let k = 1; k <= cap; k++) imag[k] /= peak;
  return { real, imag };
}
