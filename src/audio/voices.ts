/**
 * The instrument banks.
 *
 * Two lists: what a pressed key sounds like, and what the backing bed sounds
 * like. Both are the same idea as `DRUM_SPECS` next door — character held as
 * data so the synthesis stays one routine rather than forty — and the same
 * idea as the pattern library, which groups its entries by `family` so that a
 * generous list is still a list you can read.
 *
 * There is not an audio file in this project and there is not one here either.
 * Every voice below is oscillators, the shared noise buffer, and an envelope.
 *
 * The first entry of each bank is the default in all three modes: the same
 * sound everywhere is the app's identity, and a picker is no reason to lose
 * it. The lead bank opens on the piano. The synth the app grew up with is
 * kept right behind it as the Classic, held to the exact numbers the engine
 * used before there was a bank to pick from, and a test says so.
 */

import type { KeyTrack } from './shaping';
import type { SpectrumRef } from './spectra';

// ------------------------------------------------------------ played keys ---

/**
 * What a layer's oscillator is made of: one of the browser's four waves, or a
 * `spectrum` — a table of partials from `spectra.ts`, which is how a layer
 * gets to be a piano string or a vowel rather than a saw.
 */
export type LayerType = OscillatorType | 'spectrum';

/** One oscillator of a key voice. */
export interface VoiceLayer {
  type: LayerType;
  /** Multiple of the fundamental. 0.5 is a sub, 2.76 an inharmonic partial. */
  ratio: number;
  level: number;
  /** Added to `level` at full velocity: how much harder playing opens it up. */
  velLevel?: number;
  /** Cents, for the slow beating that makes two of the same wave sound wide. */
  detune?: number;
  /**
   * Seconds to silence for this layer alone. Left out, the layer holds and
   * follows the voice envelope; set, it dies on its own — which is the whole
   * difference between a bell's strike and the note left ringing under it.
   */
  decay?: number;
  /**
   * A second operator modulating this one's frequency: the same two-oscillator
   * trick `ping` uses. `index` is the depth in multiples of the pitch, falling
   * away over `decay` — a bright strike that settles into a tone.
   */
  fm?: { ratio: number; index: number; decay: number };
  /** The partial table of a `spectrum` layer. Ignored on the basic waves. */
  spectrum?: SpectrumRef;
  /**
   * Level follows v^velCurve on top of `velLevel`: a bright layer that is
   * silent when the key is stroked and takes over when it is hit, which is
   * what a sampler's velocity layers do.
   */
  velCurve?: number;
  /** This layer's own onset, in seconds: a rise of its own, and a hold before its own decay. */
  attack?: number;
  hold?: number;
}

/** A slice of the shared noise buffer under the attack: breath, or a click. */
export interface VoiceNoise {
  freq: number;
  q: number;
  decay: number;
  gain: number;
  /**
   * The band's centre as a multiple of the note rather than in Hz, so a
   * hammer's knock stays a knock up the keyboard instead of becoming a hiss.
   */
  pitchTrack?: number;
  /** Seconds to full, and seconds before it starts at all. */
  attack?: number;
  delay?: number;
  /** As a layer's: the burst follows v to this power. */
  velCurve?: number;
}

/** Two or three oscillators a few cents apart for every one: the strings behind a piano note. */
export interface Unison {
  voices: 2 | 3;
  cents: number;
}

/** The noise of a spec as a list, however it was written. */
export function noises(n: VoiceNoise | readonly VoiceNoise[] | undefined): readonly VoiceNoise[] {
  if (!n) return [];
  return Array.isArray(n) ? n : [n as VoiceNoise];
}

export interface VoiceSpec {
  layers: readonly VoiceLayer[];
  noise?: VoiceNoise | readonly VoiceNoise[];
  /**
   * The lowpass every layer runs through. It opens to `freq * (base + v² *
   * track)` on the attack and settles at `freq * (settle + v * settleVel)`,
   * which is most of why a synth reads as an instrument rather than a beep.
   */
  filter: {
    base: number; track: number;
    q: number; qVel: number;
    settle: number; settleVel: number; settleTime: number;
  };
  /** `sustain` is the fraction of peak held while the key is down. 1 is an organ. */
  env: { attack: number; decay: number; sustain: number; release: number };
  /** Loudness trim on the shared velocity curve. One is the signature voice. */
  gain: number;
  /** Send levels, before the shared tilt that sends a harder note wetter. */
  reverb: number;
  delay: number;
  /**
   * How far down the softest strike is from the hardest, in decibels. Left
   * out, the velocity curve is the straight line the app has always had.
   */
  velDb?: number;
  /** Fraction the attack shortens by at full velocity. */
  attackVel?: number;
  /** How the voice changes up and down the keyboard. See `shaping.ts`. */
  keyTrack?: KeyTrack;
  unison?: Unison;
  /** Scale on the small random drift every note gets. Zero for a voice that must not drift. */
  humanize?: number;
  /** Stretch tuning, in cents at one octave from the middle, growing with the square of the distance. */
  stretch?: number;
  /**
   * The sound of the note being stopped — a damper landing on a string, a
   * key contact opening. Played out through the note's own panner when a
   * finger lifts, as loud as what was left of the note.
   */
  damper?: VoiceNoise;
  /** How much of the note is sent through the soundboard, 0..1. */
  body?: number;
}

const KEY_BASE: VoiceSpec = {
  layers: [],
  filter: { base: 1.6, track: 11, q: 3.2, qVel: 3, settle: 1.1, settleVel: 2.4, settleTime: 0.35 },
  env: { attack: 0.004, decay: 0.16, sustain: 0.34, release: 0.22 },
  gain: 1,
  reverb: 0.2,
  delay: 0.1,
};

const key = (p: Partial<VoiceSpec>): VoiceSpec => ({ ...KEY_BASE, ...p });
/** A voice that must not drift: an organ's pipes and a synth's oscillators hold their pitch. */
const steady = (p: Partial<VoiceSpec>): VoiceSpec => key({ humanize: 0, ...p });

export interface VoiceDef {
  id: string;
  name: string;
  /** Groups the picker. Voices are listed in family order. */
  family: string;
  spec: VoiceSpec;
}

export const LEAD_VOICES: readonly VoiceDef[] = [
  // ---------------------------------------------------------------- keys ---
  {
    id: 'grand', name: 'Grand Piano', family: 'Keys',
    // The default. Three strings a few cents apart on a piano spectrum that
    // thins out going up the keyboard; a bright layer on top that only a hard
    // strike brings out and that is gone in a third of a second; a hammer's
    // knock that follows the pitch; a damper that thuds when the key is let
    // go; and a share of the soundboard under all of it. Felt-leaning on
    // purpose: a bright concert grand is the one instrument no synthesis gets
    // away with, and a warm one is easier to live with under a pinball table.
    spec: key({
      layers: [
        { type: 'spectrum', spectrum: { gen: 'piano' }, ratio: 1, level: 0.5 },
        {
          type: 'spectrum', spectrum: { gen: 'saw', params: [0.8] }, ratio: 1,
          level: 0.05, velLevel: 0.3, velCurve: 2, decay: 0.35,
        },
      ],
      noise: { freq: 1500, pitchTrack: 6, q: 1.2, decay: 0.025, gain: 0.07, velCurve: 1.5 },
      damper: { freq: 380, q: 0.8, decay: 0.06, gain: 0.05 },
      filter: { base: 2.2, track: 7, q: 0.8, qVel: 0.6, settle: 1.4, settleVel: 1.6, settleTime: 0.6 },
      env: { attack: 0.002, decay: 1.8, sustain: 0.1, release: 0.3 },
      velDb: 32, attackVel: 0.4,
      keyTrack: { decay: -0.55, release: -0.3, bright: 0.25, level: -0.1 },
      unison: { voices: 3, cents: 5 },
      stretch: 1.4,
      body: 0.35,
      reverb: 0.24, delay: 0.05,
    }),
  },
  {
    id: 'signature', name: 'PianoBall Classic', family: 'Keys',
    // The sound the app grew up with. Every number here was read out of
    // `noteOn` before there was a bank, and a test still says so.
    spec: key({
      layers: [
        { type: 'sawtooth', ratio: 1, level: 0.5 },
        { type: 'square', ratio: 1, level: 0.18, velLevel: 0.2, detune: 7.5 },
        { type: 'triangle', ratio: 0.5, level: 0.24 },
      ],
    }),
  },
  {
    id: 'electric-piano', name: 'Electric Piano', family: 'Keys',
    // A tine: a sine with a bell ringing on top of it for a tenth of a second.
    spec: key({
      layers: [
        { type: 'sine', ratio: 1, level: 0.6, fm: { ratio: 14, index: 3.4, decay: 0.11 } },
        { type: 'sine', ratio: 2, level: 0.12, decay: 0.7 },
      ],
      filter: { base: 3, track: 6, q: 0.9, qVel: 1, settle: 2, settleVel: 1.5, settleTime: 0.5 },
      env: { attack: 0.003, decay: 0.9, sustain: 0.26, release: 0.5 },
      reverb: 0.22, delay: 0.12,
    }),
  },
  {
    id: 'wurlitzer', name: 'Wurlitzer', family: 'Keys',
    spec: key({
      layers: [
        { type: 'triangle', ratio: 1, level: 0.5 },
        { type: 'square', ratio: 1, level: 0.14, velLevel: 0.16 },
        { type: 'sine', ratio: 3, level: 0.08, decay: 0.25 },
      ],
      filter: { base: 2.6, track: 8, q: 1.6, qVel: 2, settle: 1.6, settleVel: 2, settleTime: 0.4 },
      env: { attack: 0.003, decay: 0.5, sustain: 0.3, release: 0.35 },
      reverb: 0.18, delay: 0.1,
    }),
  },
  {
    id: 'clavinet', name: 'Clavinet', family: 'Keys',
    // Short, tight and dry: the one voice in the bank that wants no room.
    spec: key({
      layers: [
        { type: 'square', ratio: 1, level: 0.5 },
        { type: 'sawtooth', ratio: 1, level: 0.2, detune: 4 },
      ],
      filter: { base: 2.5, track: 14, q: 6, qVel: 3, settle: 1.4, settleVel: 2, settleTime: 0.12 },
      env: { attack: 0.002, decay: 0.11, sustain: 0.06, release: 0.1 },
      reverb: 0.06, delay: 0.04,
    }),
  },
  {
    id: 'felt-piano', name: 'Felt Piano', family: 'Keys',
    // The grand with a strip of felt between hammer and string: darker, the
    // knock a soft thump, two strings rather than three, and more of the
    // board because there is less string to hear over it.
    spec: key({
      layers: [
        { type: 'spectrum', spectrum: { gen: 'piano' }, ratio: 1, level: 0.56 },
        { type: 'sine', ratio: 0.5, level: 0.14 },
        { type: 'sine', ratio: 2, level: 0.08, decay: 0.5 },
      ],
      noise: { freq: 700, pitchTrack: 2.5, q: 0.8, decay: 0.04, gain: 0.1, velCurve: 1 },
      damper: { freq: 300, q: 0.7, decay: 0.07, gain: 0.06 },
      filter: { base: 1.3, track: 3, q: 1, qVel: 0.5, settle: 1, settleVel: 0.8, settleTime: 0.6 },
      env: { attack: 0.005, decay: 1.4, sustain: 0.12, release: 0.4 },
      velDb: 26, attackVel: 0.3,
      keyTrack: { decay: -0.5, bright: 0.2, level: -0.1 },
      unison: { voices: 2, cents: 4 },
      stretch: 1,
      body: 0.4,
      reverb: 0.3, delay: 0.08,
    }),
  },
  {
    id: 'toy-piano', name: 'Toy Piano', family: 'Keys',
    spec: key({
      layers: [
        { type: 'sine', ratio: 1, level: 0.5 },
        { type: 'sine', ratio: 4.2, level: 0.18, decay: 0.18 },
        { type: 'sine', ratio: 9.1, level: 0.08, decay: 0.09 },
      ],
      noise: { freq: 3000, q: 2, decay: 0.012, gain: 0.12 },
      filter: { base: 5, track: 10, q: 1.4, qVel: 2, settle: 3, settleVel: 2, settleTime: 0.3 },
      env: { attack: 0.002, decay: 0.35, sustain: 0.04, release: 0.2 },
      reverb: 0.24, delay: 0.08,
    }),
  },

  // --------------------------------------------------------------- organ ---
  // An organ does not decay: it holds while the key is down and stops when it
  // is let go, which is `sustain: 1` and a release measured in hundredths.
  {
    id: 'drawbar', name: 'Drawbar', family: 'Organ',
    spec: steady({
      layers: [
        { type: 'sine', ratio: 0.5, level: 0.3 },
        { type: 'sine', ratio: 1, level: 0.36 },
        { type: 'sine', ratio: 1.5, level: 0.14 },
        { type: 'sine', ratio: 2, level: 0.2 },
      ],
      filter: { base: 6, track: 4, q: 0.7, qVel: 0.5, settle: 6, settleVel: 2, settleTime: 0.2 },
      env: { attack: 0.006, decay: 0.05, sustain: 1, release: 0.08 },
      reverb: 0.24, delay: 0.06,
    }),
  },
  {
    id: 'rock-organ', name: 'Rock Organ', family: 'Organ',
    spec: steady({
      layers: [
        { type: 'square', ratio: 1, level: 0.34 },
        { type: 'sine', ratio: 2, level: 0.22 },
        { type: 'sine', ratio: 3, level: 0.14, decay: 0.25 },
        { type: 'square', ratio: 4, level: 0.08 },
      ],
      noise: { freq: 2400, q: 2, decay: 0.01, gain: 0.08 },
      filter: { base: 4, track: 8, q: 2, qVel: 2, settle: 3.4, settleVel: 2, settleTime: 0.25 },
      env: { attack: 0.004, decay: 0.06, sustain: 0.95, release: 0.09 },
      reverb: 0.2, delay: 0.08,
    }),
  },
  {
    id: 'pipe-organ', name: 'Pipe Organ', family: 'Organ',
    spec: steady({
      layers: [
        { type: 'sine', ratio: 1, level: 0.34 },
        { type: 'sine', ratio: 2, level: 0.2 },
        { type: 'sine', ratio: 3, level: 0.13 },
        { type: 'sine', ratio: 4, level: 0.09 },
      ],
      noise: { freq: 1800, q: 1.2, decay: 0.06, gain: 0.05 },
      filter: { base: 5, track: 5, q: 0.8, qVel: 0.5, settle: 5, settleVel: 2, settleTime: 0.3 },
      env: { attack: 0.05, decay: 0.1, sustain: 1, release: 0.5 },
      reverb: 0.55, delay: 0.05,
    }),
  },
  {
    id: 'reed-organ', name: 'Reed Organ', family: 'Organ',
    spec: steady({
      layers: [
        { type: 'square', ratio: 1, level: 0.36 },
        { type: 'sawtooth', ratio: 1, level: 0.22, detune: 6 },
        { type: 'sine', ratio: 3, level: 0.12 },
      ],
      filter: { base: 2.2, track: 5, q: 2.4, qVel: 2, settle: 2, settleVel: 1.5, settleTime: 0.3 },
      env: { attack: 0.02, decay: 0.08, sustain: 0.95, release: 0.15 },
      reverb: 0.3, delay: 0.08,
    }),
  },

  // ----------------------------------------------------------------- air ---
  {
    id: 'choir', name: 'Choir', family: 'Air',
    spec: key({
      layers: [
        { type: 'sawtooth', ratio: 1, level: 0.3, detune: -7 },
        { type: 'sawtooth', ratio: 1, level: 0.3, detune: 7 },
        { type: 'sine', ratio: 2, level: 0.1 },
        { type: 'sine', ratio: 3, level: 0.06 },
      ],
      noise: { freq: 1200, q: 1, decay: 0.4, gain: 0.05 },
      filter: { base: 2, track: 3, q: 1.5, qVel: 1, settle: 2.2, settleVel: 1, settleTime: 0.8 },
      env: { attack: 0.14, decay: 0.4, sustain: 0.85, release: 0.5 },
      reverb: 0.5, delay: 0.12,
    }),
  },
  {
    id: 'vox-pad', name: 'Vox Pad', family: 'Air',
    spec: key({
      layers: [
        { type: 'sawtooth', ratio: 1, level: 0.3, detune: -10 },
        { type: 'sawtooth', ratio: 1, level: 0.3, detune: 10 },
        { type: 'sine', ratio: 0.5, level: 0.14 },
      ],
      filter: { base: 1.8, track: 3, q: 1.2, qVel: 1, settle: 2, settleVel: 1, settleTime: 1 },
      env: { attack: 0.3, decay: 0.6, sustain: 0.9, release: 0.9 },
      reverb: 0.6, delay: 0.16,
    }),
  },
  {
    id: 'breath-flute', name: 'Breath Flute', family: 'Air',
    spec: key({
      layers: [
        { type: 'sine', ratio: 1, level: 0.62 },
        { type: 'sine', ratio: 2, level: 0.08 },
        { type: 'sine', ratio: 3, level: 0.04 },
      ],
      noise: { freq: 2200, q: 1.4, decay: 0.5, gain: 0.14 },
      filter: { base: 4, track: 5, q: 1, qVel: 1, settle: 3.5, settleVel: 1.5, settleTime: 0.5 },
      env: { attack: 0.06, decay: 0.2, sustain: 0.9, release: 0.22 },
      reverb: 0.4, delay: 0.14,
    }),
  },
  {
    id: 'glass', name: 'Glass', family: 'Air',
    spec: key({
      layers: [
        { type: 'sine', ratio: 1, level: 0.44 },
        { type: 'sine', ratio: 2.76, level: 0.18, decay: 1.4 },
        { type: 'sine', ratio: 5.4, level: 0.08, decay: 0.7 },
      ],
      filter: { base: 6, track: 6, q: 1, qVel: 1, settle: 5, settleVel: 2, settleTime: 0.9 },
      env: { attack: 0.02, decay: 1.2, sustain: 0.2, release: 0.9 },
      reverb: 0.6, delay: 0.2,
    }),
  },

  // ------------------------------------------------------------- mallets ---
  // Struck and left to ring: `sustain` near zero, and partials that die at
  // their own rates so the strike is bright and the tail under it is not.
  {
    id: 'music-box', name: 'Music Box', family: 'Mallets',
    spec: key({
      layers: [
        { type: 'sine', ratio: 1, level: 0.5, decay: 1.1 },
        { type: 'sine', ratio: 3.01, level: 0.16, decay: 0.5 },
        { type: 'sine', ratio: 5.03, level: 0.07, decay: 0.28 },
      ],
      noise: { freq: 4000, q: 3, decay: 0.008, gain: 0.08 },
      filter: { base: 7, track: 8, q: 1, qVel: 1, settle: 5, settleVel: 2, settleTime: 0.5 },
      env: { attack: 0.002, decay: 1, sustain: 0.02, release: 0.5 },
      reverb: 0.4, delay: 0.14,
    }),
  },
  {
    id: 'marimba', name: 'Marimba', family: 'Mallets',
    // The partial four times above the note is what makes a bar sound wooden.
    spec: key({
      layers: [
        { type: 'sine', ratio: 1, level: 0.56, decay: 0.5 },
        { type: 'sine', ratio: 4, level: 0.14, decay: 0.12 },
        { type: 'sine', ratio: 10, level: 0.05, decay: 0.05 },
      ],
      noise: { freq: 1600, q: 2, decay: 0.01, gain: 0.1 },
      filter: { base: 5, track: 8, q: 1.2, qVel: 1, settle: 3, settleVel: 2, settleTime: 0.3 },
      env: { attack: 0.002, decay: 0.45, sustain: 0.02, release: 0.22 },
      reverb: 0.26, delay: 0.08,
    }),
  },
  {
    id: 'vibraphone', name: 'Vibraphone', family: 'Mallets',
    spec: key({
      layers: [
        { type: 'sine', ratio: 1, level: 0.56, decay: 2.2 },
        { type: 'sine', ratio: 4, level: 0.12, decay: 0.9 },
        { type: 'sine', ratio: 9.2, level: 0.04, decay: 0.3 },
      ],
      filter: { base: 5, track: 6, q: 1, qVel: 1, settle: 4, settleVel: 2, settleTime: 0.6 },
      env: { attack: 0.003, decay: 1.8, sustain: 0.05, release: 1.1 },
      reverb: 0.45, delay: 0.14,
    }),
  },
  {
    id: 'tubular-bell', name: 'Tubular Bell', family: 'Mallets',
    // Partials at no whole-number ratio at all, which is what a bell is.
    spec: key({
      layers: [
        { type: 'sine', ratio: 1, level: 0.4, decay: 3 },
        { type: 'sine', ratio: 2.76, level: 0.18, decay: 2.2 },
        { type: 'sine', ratio: 5.4, level: 0.09, decay: 1.2 },
        { type: 'sine', ratio: 8.9, level: 0.05, decay: 0.6 },
      ],
      filter: { base: 7, track: 8, q: 1, qVel: 1, settle: 6, settleVel: 2, settleTime: 1 },
      env: { attack: 0.003, decay: 2.5, sustain: 0.04, release: 1.6 },
      reverb: 0.6, delay: 0.16,
    }),
  },
  {
    id: 'harp', name: 'Harp', family: 'Mallets',
    spec: key({
      layers: [
        { type: 'sawtooth', ratio: 1, level: 0.5, decay: 1.2 },
        { type: 'triangle', ratio: 2, level: 0.14, decay: 0.5 },
      ],
      filter: { base: 3, track: 8, q: 1.6, qVel: 2, settle: 1.2, settleVel: 2, settleTime: 0.4 },
      env: { attack: 0.003, decay: 0.9, sustain: 0.03, release: 0.5 },
      reverb: 0.38, delay: 0.14,
    }),
  },

  // --------------------------------------------------------------- synth ---
  {
    id: 'saw-lead', name: 'Saw Lead', family: 'Synth',
    spec: steady({
      layers: [
        { type: 'sawtooth', ratio: 1, level: 0.5 },
        { type: 'sawtooth', ratio: 1, level: 0.22, detune: 12 },
      ],
      filter: { base: 2, track: 12, q: 3.4, qVel: 3, settle: 1.4, settleVel: 2.6, settleTime: 0.35 },
      env: { attack: 0.005, decay: 0.2, sustain: 0.7, release: 0.18 },
      reverb: 0.2, delay: 0.14,
    }),
  },
  {
    id: 'square-lead', name: 'Square Lead', family: 'Synth',
    spec: steady({
      layers: [
        { type: 'square', ratio: 1, level: 0.5 },
        { type: 'square', ratio: 1, level: 0.18, detune: -9 },
      ],
      filter: { base: 2.2, track: 10, q: 3, qVel: 3, settle: 1.5, settleVel: 2.4, settleTime: 0.35 },
      env: { attack: 0.004, decay: 0.18, sustain: 0.72, release: 0.16 },
      reverb: 0.2, delay: 0.16,
    }),
  },
  {
    id: 'supersaw', name: 'Supersaw', family: 'Synth',
    spec: steady({
      layers: [
        { type: 'sawtooth', ratio: 1, level: 0.26, detune: -14 },
        { type: 'sawtooth', ratio: 1, level: 0.26, detune: -5 },
        { type: 'sawtooth', ratio: 1, level: 0.26, detune: 6 },
        { type: 'sawtooth', ratio: 1, level: 0.26, detune: 15 },
      ],
      filter: { base: 2, track: 11, q: 2.4, qVel: 2, settle: 1.6, settleVel: 2.4, settleTime: 0.5 },
      env: { attack: 0.01, decay: 0.3, sustain: 0.8, release: 0.4 },
      gain: 0.85, reverb: 0.35, delay: 0.2,
    }),
  },
  {
    id: 'bright-poly', name: 'Bright Poly', family: 'Synth',
    spec: steady({
      layers: [
        { type: 'square', ratio: 1, level: 0.34 },
        { type: 'sawtooth', ratio: 1, level: 0.26, detune: 8 },
        { type: 'triangle', ratio: 0.5, level: 0.14 },
      ],
      filter: { base: 2.4, track: 12, q: 4, qVel: 3, settle: 1.4, settleVel: 3, settleTime: 0.4 },
      env: { attack: 0.006, decay: 0.25, sustain: 0.55, release: 0.3 },
      reverb: 0.24, delay: 0.14,
    }),
  },
  {
    id: 'sub-bass', name: 'Sub Bass', family: 'Synth',
    spec: steady({
      layers: [
        { type: 'sine', ratio: 0.5, level: 0.6 },
        { type: 'triangle', ratio: 1, level: 0.2 },
        { type: 'square', ratio: 1, level: 0.06 },
      ],
      filter: { base: 1.2, track: 3, q: 1, qVel: 1, settle: 0.9, settleVel: 1, settleTime: 0.3 },
      env: { attack: 0.004, decay: 0.3, sustain: 0.75, release: 0.14 },
      reverb: 0.04, delay: 0.02,
    }),
  },
];

// ----------------------------------------------------------- backing bed ---

/**
 * The bed's voice is deliberately shorter on knobs than a key voice, because
 * its timing is not its own: `pad` is handed a length and an attack by whoever
 * scheduled the chord, and that is what lets one timbre serve the sustained
 * bed, the struck comp chords and the bass alike.
 *
 * A bed spec never decides how long a note *occupies* — only what it is made
 * of, how its filter moves, and, if it is a plucked thing, how much of that
 * length it actually *sounds* for.
 */
export interface BedLayer {
  type: LayerType;
  ratio: number;
  level: number;
  detune?: number;
  spectrum?: SpectrumRef;
}

export interface BedSpec {
  layers: readonly BedLayer[];
  /**
   * The lowpass, in absolute Hz. A chord that is struck rather than swelled
   * opens higher and sooner, or a short stab is over before the filter has
   * finished arriving. Both shapes close to `end` by the note's last moment.
   */
  filter: {
    start: number; startStruck: number;
    peak: number; peakStruck: number;
    end: number; q: number;
  };
  /**
   * Seconds to fall silent, for a voice that is struck rather than swelled.
   *
   * The length of a bed note belongs to whoever scheduled it, and that does
   * not change here — but a string is not a pad, and no choice of partials
   * rescues one that fades in over a third of a bar and back out again. Left
   * out, the voice swells and fades with the attack it was handed; set, it
   * arrives at once and decays inside the length it was given.
   */
  pluck?: number;
  gain: number;
  unison?: Unison;
  /**
   * How much of the bed goes through the engine's ensemble chorus, 0..1.
   * A section of strings is many players a hair apart, and this is the hair;
   * a plucked thing wants none of it, or the pluck smears.
   */
  ensemble?: number;
}

const BED_BASE: BedSpec = {
  layers: [],
  filter: { start: 420, startStruck: 900, peak: 1100, peakStruck: 1700, end: 500, q: 1.4 },
  gain: 1,
};

const bed = (p: Partial<BedSpec>): BedSpec => ({ ...BED_BASE, ...p });

export interface BedDef {
  id: string;
  name: string;
  family: string;
  spec: BedSpec;
}

export const BED_VOICES: readonly BedDef[] = [
  // ---------------------------------------------------------------- pads ---
  {
    id: 'warm', name: 'Warm Pad', family: 'Pads',
    // The bed the app has always had: two saws six cents apart. Pinned by
    // test. The ensemble is what has changed under it, not the saws.
    spec: bed({
      layers: [
        { type: 'sawtooth', ratio: 1, level: 1, detune: -6 },
        { type: 'sawtooth', ratio: 1, level: 1, detune: 6 },
      ],
      ensemble: 0.6,
    }),
  },
  {
    id: 'strings', name: 'Strings', family: 'Pads',
    spec: bed({
      layers: [
        { type: 'sawtooth', ratio: 1, level: 0.8, detune: -8 },
        { type: 'sawtooth', ratio: 1, level: 0.8, detune: 8 },
        { type: 'sawtooth', ratio: 2, level: 0.25, detune: 4 },
      ],
      filter: { start: 380, startStruck: 850, peak: 1500, peakStruck: 2100, end: 460, q: 1.2 },
      ensemble: 0.8,
    }),
  },
  {
    id: 'bed-choir', name: 'Choir', family: 'Pads',
    spec: bed({
      layers: [
        { type: 'triangle', ratio: 1, level: 0.85, detune: -6 },
        { type: 'triangle', ratio: 1, level: 0.85, detune: 6 },
        { type: 'sine', ratio: 2, level: 0.22 },
      ],
      filter: { start: 320, startStruck: 700, peak: 900, peakStruck: 1300, end: 380, q: 1.1 },
      ensemble: 0.7,
    }),
  },
  {
    id: 'glass-pad', name: 'Glass Pad', family: 'Pads',
    spec: bed({
      layers: [
        { type: 'sine', ratio: 1, level: 1.1 },
        { type: 'sine', ratio: 2, level: 0.6, detune: 5 },
        { type: 'sine', ratio: 4.1, level: 0.2 },
      ],
      filter: { start: 600, startStruck: 1200, peak: 2400, peakStruck: 3200, end: 700, q: 0.9 },
      ensemble: 0.5,
    }),
  },
  {
    id: 'analog-brass', name: 'Analog Brass', family: 'Pads',
    spec: bed({
      layers: [
        { type: 'sawtooth', ratio: 1, level: 0.9, detune: -4 },
        { type: 'sawtooth', ratio: 1, level: 0.9, detune: 4 },
        { type: 'square', ratio: 1, level: 0.2 },
      ],
      filter: { start: 300, startStruck: 800, peak: 1900, peakStruck: 2600, end: 420, q: 2.2 },
      ensemble: 0.6,
    }),
  },

  // ---------------------------------------------------------------- keys ---
  {
    id: 'bed-electric-piano', name: 'Electric Piano', family: 'Keys',
    spec: bed({
      layers: [
        { type: 'sine', ratio: 1, level: 1.2 },
        { type: 'sine', ratio: 2, level: 0.45 },
        { type: 'sine', ratio: 4, level: 0.15 },
      ],
      filter: { start: 700, startStruck: 1400, peak: 1600, peakStruck: 2400, end: 600, q: 0.8 },
    }),
  },
  {
    id: 'bed-organ', name: 'Organ', family: 'Keys',
    spec: bed({
      layers: [
        { type: 'sine', ratio: 1, level: 0.8 },
        { type: 'sine', ratio: 2, level: 0.55 },
        { type: 'sine', ratio: 3, level: 0.3 },
        { type: 'sine', ratio: 4, level: 0.2 },
      ],
      filter: { start: 900, startStruck: 1500, peak: 1800, peakStruck: 2400, end: 900, q: 0.6 },
    }),
  },
  {
    id: 'bed-felt-piano', name: 'Felt Piano', family: 'Keys',
    spec: bed({
      layers: [
        { type: 'triangle', ratio: 1, level: 1.2 },
        { type: 'sine', ratio: 2, level: 0.35 },
        { type: 'sine', ratio: 0.5, level: 0.35 },
      ],
      filter: { start: 400, startStruck: 850, peak: 1100, peakStruck: 1500, end: 420, q: 1 },
    }),
  },

  // ------------------------------------------------------------- plucked ---
  // Every voice here strikes and decays. Without `pluck` they were pads with
  // plucked names — a nylon guitar that swelled in over a third of the bar.
  {
    id: 'bed-harp', name: 'Harp', family: 'Plucked',
    // Bright at the edge and ringing a long time, on a nearly harmonic stack.
    spec: bed({
      layers: [
        { type: 'triangle', ratio: 1, level: 1 },
        { type: 'sine', ratio: 2, level: 0.5 },
        { type: 'sine', ratio: 4, level: 0.24 },
        { type: 'sine', ratio: 6, level: 0.12 },
      ],
      filter: { start: 700, startStruck: 1600, peak: 1900, peakStruck: 2800, end: 480, q: 1.1 },
      pluck: 2.4,
    }),
  },
  {
    id: 'nylon-guitar', name: 'Nylon Guitar', family: 'Plucked',
    // A gut string is a strong fundamental with a couple of quiet harmonics
    // over it, and nothing else. The saw and its five cents of detune that
    // used to sit here were a chorus, which is what made it read as a pad.
    spec: bed({
      layers: [
        { type: 'triangle', ratio: 1, level: 1.15 },
        { type: 'sine', ratio: 2, level: 0.5 },
        { type: 'sine', ratio: 3, level: 0.26 },
      ],
      filter: { start: 460, startStruck: 1150, peak: 1400, peakStruck: 1900, end: 340, q: 1 },
      pluck: 1.7,
    }),
  },
  {
    id: 'bed-music-box', name: 'Music Box', family: 'Plucked',
    spec: bed({
      layers: [
        { type: 'sine', ratio: 1, level: 1.2 },
        { type: 'sine', ratio: 3.01, level: 0.45 },
        { type: 'sine', ratio: 5.02, level: 0.2 },
      ],
      filter: { start: 900, startStruck: 1800, peak: 2600, peakStruck: 3400, end: 800, q: 0.8 },
      pluck: 1.3,
    }),
  },

  // --------------------------------------------------------------- synth ---
  {
    id: 'square-pad', name: 'Square Pad', family: 'Synth',
    spec: bed({
      layers: [
        { type: 'square', ratio: 1, level: 0.75, detune: -7 },
        { type: 'square', ratio: 1, level: 0.75, detune: 7 },
        { type: 'sine', ratio: 0.5, level: 0.3 },
      ],
      filter: { start: 380, startStruck: 800, peak: 1100, peakStruck: 1600, end: 420, q: 1.5 },
      ensemble: 0.5,
    }),
  },
  {
    id: 'saw-swell', name: 'Saw Swell', family: 'Synth',
    spec: bed({
      layers: [
        { type: 'sawtooth', ratio: 1, level: 0.7, detune: -12 },
        { type: 'sawtooth', ratio: 1, level: 0.7 },
        { type: 'sawtooth', ratio: 1, level: 0.7, detune: 12 },
      ],
      filter: { start: 300, startStruck: 750, peak: 1400, peakStruck: 1900, end: 400, q: 1.8 },
      ensemble: 0.7,
    }),
  },
  {
    id: 'sine-bed', name: 'Sine Bed', family: 'Synth',
    spec: bed({
      layers: [
        { type: 'sine', ratio: 1, level: 1.1 },
        { type: 'sine', ratio: 2, level: 0.5 },
        { type: 'sine', ratio: 0.5, level: 0.4 },
      ],
      filter: { start: 800, startStruck: 1400, peak: 1800, peakStruck: 2200, end: 800, q: 0.5 },
      ensemble: 0.3,
    }),
  },
];

// ---------------------------------------------------------------- lookup ---

/** The bank's own order, which is the order the picker groups by. */
const families = (defs: readonly { family: string }[]): readonly string[] =>
  [...new Set(defs.map((d) => d.family))];

export const LEAD_FAMILIES = families(LEAD_VOICES);
export const BED_FAMILIES = families(BED_VOICES);

export const DEFAULT_LEAD_VOICE = LEAD_VOICES[0].id;
export const DEFAULT_BED_VOICE = BED_VOICES[0].id;

/** Falls back to the signature voice, so an id we have dropped is survivable. */
export function findLeadVoice(id: string): VoiceDef {
  return LEAD_VOICES.find((v) => v.id === id) ?? LEAD_VOICES[0];
}

export function findBedVoice(id: string): BedDef {
  return BED_VOICES.find((v) => v.id === id) ?? BED_VOICES[0];
}
