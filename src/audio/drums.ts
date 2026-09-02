/**
 * The drum voice bank.
 *
 * There is not a single audio file in this project, and there is not one here
 * either: every drum is oscillators and the shared noise buffer, shaped by an
 * envelope. The table below is the same idea as `IMPACTS` in the engine — a
 * character per voice, held as data so the synthesis code stays one routine
 * rather than eleven — just large enough that it earns its own module.
 */

export type DrumVoice =
  | 'kick' | 'snare' | 'rim' | 'clap' | 'hat' | 'openhat'
  | 'ride' | 'crash' | 'shaker' | 'tomLo' | 'tomHi' | 'cowbell';

/** A partial of the tone layer: absolute Hz, level, and its share of the decay. */
export type DrumPartial = readonly [freq: number, level: number, decay: number, type: OscillatorType];

/**
 * A cymbal: several square waves at ratios that share no harmonics, so what
 * comes through a high bandpass is a cluster of partials with no pitch to
 * it — the recipe the 808 used, and still the best there is without a
 * recording. `velBright` is octaves the band moves across the velocity range.
 */
export interface DrumMetal {
  freq: number;
  ratios: readonly number[];
  bp: number;
  bpQ: number;
  hp: number;
  decay: number;
  gain: number;
  velBright: number;
}

/** The beater or the stick meeting the head: a blip a few milliseconds long. */
export interface DrumClick {
  freq: number;
  decay: number;
  gain: number;
}

/** The snare's wires: a second noise layer, higher and looser than the shell's, with a decay of its own. */
export interface DrumWires {
  freq: number;
  q: number;
  hp: number;
  decay: number;
  gain: number;
}

/** The six ratios of the 808's cymbals. */
export const METAL_RATIOS: readonly number[] = [1, 1.4471, 1.617, 1.9265, 2.5028, 2.6637];

export interface DrumSpec {
  /** Centre of the noise band, in Hz. Zero means the voice has no noise layer. */
  noiseFreq: number;
  noiseQ: number;
  /** Highpass under the noise, so a snare's rattle leaves the kick its floor. */
  noiseHp: number;
  /** Time to full. A struck thing is instant; a shaker is not. */
  noiseAttack: number;
  noiseDecay: number;
  noiseGain: number;
  /** Repeats of the noise layer, and the gap between them. A handclap is four. */
  bursts: number;
  burstGap: number;
  tone: readonly DrumPartial[];
  /**
   * The tone starts this many times above its pitch and falls to it over
   * `pitchTime`. That drop is most of what makes a sine read as a drum.
   */
  pitchDrop: number;
  pitchTime: number;
  toneDecay: number;
  /** Bandpass over the tone layer. Zero bypasses it. */
  toneBp: number;
  toneBpQ: number;
  gain: number;
  /** Where the voice sits in the kit. Hats right, toms wide, kick centred. */
  pan: number;
  reverb: number;
  metal?: DrumMetal;
  click?: DrumClick;
  wires?: DrumWires;
  /** Octaves the noise band moves across the velocity range: a hard hit is a brighter one. */
  velBright?: number;
  /** Fraction of every decay lost at the softest hit: a ghost note is a short one. */
  velDecay?: number;
}

const BASE: DrumSpec = {
  noiseFreq: 0,
  noiseQ: 1,
  noiseHp: 120,
  noiseAttack: 0.001,
  noiseDecay: 0.05,
  noiseGain: 0.3,
  bursts: 1,
  burstGap: 0.01,
  tone: [],
  pitchDrop: 1,
  pitchTime: 0.04,
  toneDecay: 0.2,
  toneBp: 0,
  toneBpQ: 2,
  gain: 0.6,
  pan: 0,
  reverb: 0.14,
};

const spec = (p: Partial<DrumSpec>): DrumSpec => ({ ...BASE, ...p });

export const DRUM_SPECS: Record<DrumVoice, DrumSpec> = {
  // A sine falling two and a half octaves in forty milliseconds, its second
  // partial under it for a moment, the beater's click on top so it survives
  // a laptop speaker with no low end, and the skin brighter the harder it
  // is hit.
  kick: spec({
    tone: [[52, 1, 1, 'sine'], [104, 0.15, 0.35, 'sine']],
    pitchDrop: 5.2, pitchTime: 0.045, toneDecay: 0.34,
    noiseFreq: 2200, noiseQ: 0.9, noiseHp: 260, noiseDecay: 0.012, noiseGain: 0.1,
    click: { freq: 1800, decay: 0.005, gain: 0.35 },
    velBright: 0.8, velDecay: 0.35,
    gain: 1, reverb: 0.05,
  }),
  // Three modes of the shell, the noise of the head, and over it the wires:
  // a second, higher noise that rings on after the shell has stopped.
  snare: spec({
    tone: [[185, 0.5, 1, 'triangle'], [332, 0.32, 0.7, 'triangle'], [493, 0.18, 0.5, 'triangle']],
    toneDecay: 0.11,
    noiseFreq: 1900, noiseQ: 0.8, noiseHp: 360, noiseDecay: 0.09, noiseGain: 0.35,
    wires: { freq: 4200, q: 0.7, hp: 2200, decay: 0.22, gain: 0.55 },
    click: { freq: 2400, decay: 0.004, gain: 0.2 },
    velBright: 1, velDecay: 0.4,
    gain: 0.85, reverb: 0.22,
  }),
  rim: spec({
    tone: [[1720, 0.5, 1, 'square'], [432, 0.35, 0.6, 'triangle']],
    toneDecay: 0.035, toneBp: 2000, toneBpQ: 3,
    noiseFreq: 2900, noiseQ: 2.2, noiseHp: 900, noiseDecay: 0.02, noiseGain: 0.3,
    gain: 0.6, pan: 0.12, reverb: 0.16,
  }),
  // Four bursts nine milliseconds apart: one hit sounds like a click, a short
  // scatter sounds like hands.
  clap: spec({
    noiseFreq: 1350, noiseQ: 1.1, noiseHp: 700, noiseDecay: 0.16, noiseGain: 0.68,
    bursts: 4, burstGap: 0.009,
    gain: 0.75, pan: -0.1, reverb: 0.26,
  }),
  // The cymbals are metal (see `DrumMetal`) with a little noise left under
  // them: a hat closed and open, a ride, and a crash for the multiball.
  hat: spec({
    metal: { freq: 40, ratios: METAL_RATIOS, bp: 10000, bpQ: 1.2, hp: 7000, decay: 0.05, gain: 0.5, velBright: 0.4 },
    noiseFreq: 9000, noiseQ: 0.9, noiseHp: 6500, noiseDecay: 0.045, noiseGain: 0.25,
    velDecay: 0.5,
    gain: 0.5, pan: 0.18, reverb: 0.08,
  }),
  openhat: spec({
    metal: { freq: 40, ratios: METAL_RATIOS, bp: 9000, bpQ: 1, hp: 6500, decay: 0.35, gain: 0.45, velBright: 0.4 },
    noiseFreq: 8600, noiseQ: 0.8, noiseHp: 6000, noiseDecay: 0.32, noiseGain: 0.2,
    velDecay: 0.5,
    gain: 0.48, pan: 0.18, reverb: 0.18,
  }),
  ride: spec({
    metal: { freq: 90, ratios: METAL_RATIOS, bp: 6000, bpQ: 0.8, hp: 3500, decay: 0.7, gain: 0.35, velBright: 0.3 },
    tone: [[522, 0.16, 1, 'square'], [794, 0.11, 0.8, 'square']],
    toneDecay: 0.5, toneBp: 3600, toneBpQ: 1.2,
    noiseFreq: 7200, noiseQ: 0.7, noiseHp: 4500, noiseDecay: 0.55, noiseGain: 0.2,
    velDecay: 0.3,
    gain: 0.5, pan: 0.26, reverb: 0.24,
  }),
  crash: spec({
    metal: { freq: 55, ratios: METAL_RATIOS, bp: 7000, bpQ: 0.5, hp: 3000, decay: 1.4, gain: 0.45, velBright: 0.3 },
    noiseFreq: 8000, noiseQ: 0.6, noiseHp: 4000, noiseDecay: 1.1, noiseGain: 0.4,
    velDecay: 0.3,
    gain: 0.55, pan: -0.2, reverb: 0.3,
  }),
  shaker: spec({
    noiseFreq: 6200, noiseQ: 1.4, noiseHp: 3800,
    noiseAttack: 0.012, noiseDecay: 0.075, noiseGain: 0.4,
    gain: 0.42, pan: -0.22, reverb: 0.1,
  }),
  // A drum head's modes sit at 1.53 and 2.16 times its fundamental; the
  // pitch drop bends all three together, which is what the ear reads as skin.
  tomLo: spec({
    tone: [[128, 1, 1, 'sine'], [196, 0.35, 0.5, 'sine'], [276, 0.15, 0.3, 'triangle']],
    pitchDrop: 1.6, pitchTime: 0.09, toneDecay: 0.34,
    noiseFreq: 900, noiseQ: 1, noiseHp: 220, noiseDecay: 0.02, noiseGain: 0.11,
    click: { freq: 1500, decay: 0.004, gain: 0.15 },
    velDecay: 0.3,
    gain: 0.75, pan: -0.28, reverb: 0.2,
  }),
  tomHi: spec({
    tone: [[205, 1, 1, 'sine'], [314, 0.35, 0.5, 'sine'], [443, 0.15, 0.3, 'triangle']],
    pitchDrop: 1.6, pitchTime: 0.07, toneDecay: 0.26,
    noiseFreq: 1200, noiseQ: 1, noiseHp: 300, noiseDecay: 0.018, noiseGain: 0.11,
    click: { freq: 1500, decay: 0.004, gain: 0.15 },
    velDecay: 0.3,
    gain: 0.7, pan: 0.28, reverb: 0.2,
  }),
  cowbell: spec({
    tone: [[540, 0.55, 1, 'square'], [800, 0.45, 1, 'square']],
    toneDecay: 0.24, toneBp: 2400, toneBpQ: 1.6,
    gain: 0.4, pan: 0.3, reverb: 0.14,
  }),
};
