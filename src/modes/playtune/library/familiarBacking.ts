import type { ChartNote } from '../chart';
import { score, scoreBars, type ScoreStrike } from './performanceNotation';

// Performance parts are written independently of the Backing course. Pitches
// name voices and inversions: a bass F# under D major never becomes F# minor.
type Bar = readonly ScoreStrike[];

const BELLS: Bar[] = [
  [[0, 4, 48, 0.6], [1, 3, [52, 55], 0.44]],
  [[0, 4, 43, 0.54], [1, 3, [48, 52], 0.42]],
  [[0, 2, 48, 0.6], [0.5, 1.5, [52, 55], 0.46], [2, 2, 43, 0.54], [2.5, 1.5, [47, 50], 0.42]],
  [[0, 2, 48, 0.56], [0.5, 1.5, [52, 55], 0.42], [2, 2, 43, 0.5], [2.5, 1.5, [47, 50], 0.4]],
  [[0, 2, 43, 0.6], [0.5, 1.5, [47, 50], 0.46], [2, 2, 48, 0.56], [2.5, 1.5, [52, 55], 0.42]],
  [[0, 2, 43, 0.56], [0.5, 1.5, [47, 50], 0.42], [2, 2, 48, 0.52], [2.5, 1.5, [52, 55], 0.4]],
  [[0, 2, 43, 0.53], [1, 1, 50, 0.4], [2, 2, [48, 52, 55], 0.5]],
  [[0, 2, 43, 0.5], [1, 1, 50, 0.38], [2, 2, [48, 52, 55], 0.46]],
];
export const JACQUES_BACKING = scoreBars([...BELLS, ...BELLS], 4);

// A folk accompaniment, not a claim that a shanty has one canonical piano
// part. The modal Dm/C alternation stays clear; cadences and chorus answers
// differ from the verse. Bass movement supplies direction without a leading C#.
const SHANTY: Bar[] = [
  [[0, 1.8, 50, 0.65], [1, 0.75, [53, 57, 62], 0.42], [2, 1.8, 45, 0.55], [3, 0.75, [53, 57, 62], 0.4]],
  [[0, 1.8, 50, 0.62], [1, 0.75, [53, 57, 62], 0.42], [2, 0.9, 53, 0.5], [3, 0.9, 50, 0.48]],
  [[0, 1.8, 48, 0.65], [1, 0.75, [52, 55, 60], 0.42], [2, 1.8, 43, 0.55], [3, 0.75, [52, 55, 60], 0.4]],
  [[0, 1.8, 48, 0.62], [1, 0.75, [52, 55, 60], 0.42], [2, 0.9, 52, 0.5], [3, 0.9, 48, 0.48]],
  [[0, 1.8, 50, 0.67], [1, 0.75, [53, 57, 62], 0.44], [2, 1.8, 45, 0.57], [3, 0.75, [53, 57, 62], 0.42]],
  [[0, 1, 50, 0.62], [1, 1, 53, 0.5], [2, 1, 57, 0.5], [3, 1, 50, 0.5]],
  [[0, 1, 48, 0.62], [1, 1, 52, 0.5], [2, 1, 55, 0.5], [3, 0.85, [52, 60], 0.4]],
  [[0, 1.8, [50, 53, 57], 0.58], [2, 1.8, [38, 50], 0.5]],
];
export const SAILOR_BACKING = scoreBars(Array.from({ length: 4 }, (_, verse) =>
  SHANTY.map((bar, index): Bar => verse === 3 && index === 7
    ? [[0, 4, [38, 50, 53, 57], 0.62]]
    : bar.map(([beat, len, notes, gain, sound]) => [beat, len, notes,
      (gain ?? 0.6) * (verse % 2 ? 1.08 : 1), sound]))).flat(), 4)
  // Nylon decays much sooner than the sustained choir above it. The full
  // production-synth render measured a 24dB RMS deficit; this local +8dB
  // adjustment restores support without changing either instrument globally.
  .map(n => ({ ...n, gain: n.gain! * 2.5 }));

// The galop has four eighth-note pulses per 2/4 bar. Full, short piano chords
// retain its orchestral rhythmic energy; phrase dynamics distinguish repeats.
const GALOP_BASS = [48, 43, 41, 43, 41, 43, 48, 43];
const GALOP_VOICINGS = [
  [52, 55, 60], [52, 55, 60], [53, 57, 60], [50, 55, 59],
  [53, 57, 60], [50, 55, 59], [52, 55, 60], [52, 55, 60],
];
export const GALOP_BACKING = scoreBars(Array.from({ length: 32 }, (_, bar): Bar => {
  const i = bar % 8, phrase = [0.88, 1, 0.9, 1.04][Math.floor(bar / 8)];
  if (bar === 31) return [[0, 1.7, [43, 52, 55, 60], 0.58], [2, 2, [36, 48, 52, 55, 60], 0.7]];
  return [
    [0, 0.8, [GALOP_BASS[i], ...GALOP_VOICINGS[i]], 0.65 * phrase, 0.48],
    [1, 0.8, GALOP_VOICINGS[i], 0.43 * phrase, 0.4],
    [2, 0.8, [GALOP_BASS[i], ...GALOP_VOICINGS[i]], 0.57 * phrase, 0.48],
    [3, 0.8, GALOP_VOICINGS[i], 0.43 * phrase, 0.4],
  ];
}), 4);

// Spina 1867, printed p.4, Waltz 1. Source bass notes and chord inversions,
// with the inner voices retained at phrase turns. The opening bar is silent.
const waltz = (bass: number, answer: readonly number[], gain = 0.58): Bar => [
  [0, 0.9, bass, gain, 0.75],
  [1, 0.8, answer, gain * 0.72, 0.65],
  [2, 0.8, answer, gain * 0.65, 0.58],
];
const D = [57, 62, 66], A7 = [57, 61, 67];
const DANUBE_BARS: Bar[] = [
  [], waltz(50, D), waltz(50, D),
  [[0, 0.9, 50, 0.55], [1, 0.8, [54, 57, 62], 0.4], [2, 0.8, [54, 57], 0.36]],
  [[0, 0.9, 50, 0.58], [1, 0.8, [57, 62], 0.42], [2, 0.8, D, 0.4]],
  waltz(52, A7), waltz(52, A7),
  [[0, 0.9, 52, 0.56], [1, 0.8, [55, 57, 61], 0.4], [2, 0.8, [55, 57], 0.36]],
  waltz(52, [55, 57, 61]), waltz(45, A7), waltz(45, A7),
  [[0, 0.9, 45, 0.55], [1, 0.8, [55, 57, 61], 0.4], [2, 0.8, [55, 57], 0.36]],
  waltz(45, [55, 57, 61]), waltz(50, D, 0.62), waltz(50, D, 0.6),
  [[0, 0.9, 50, 0.56], [1, 0.8, [54, 57, 62], 0.4], [2, 0.8, [54, 57], 0.34]],
  [[0, 0.9, 50, 0.63], [1, 0.8, [57, 62], 0.46], [2, 0.8, D, 0.43]],
  waltz(54, D, 0.64), waltz(54, D, 0.66),
  // Bars20-24 drop into the source's lower register, leaving the lead space.
  waltz(42, [45, 50, 54], 0.61),
  waltz(42, [45, 50, 54], 0.64), waltz(43, [47, 50, 52], 0.67), waltz(43, [47, 50, 52], 0.7),
  [[0, 0.9, [43, 47, 50, 52], 0.54], [2, 0.9, 52, 0.63]],
  [[0, 0.9, 52, 0.66], [1, 0.9, 55, 0.63], [2, 0.5, 59, 0.61, 0.4]],
  waltz(52, A7, 0.72), waltz(45, A7, 0.71),
  waltz(50, D, 0.75), waltz(54, D, 0.7),
  [[0, 3, [43, 47, 50, 52], 0.52, 2.8]],
  [[0, 3, [45, 52, 55], 0.5, 2.8]],
  [[0, 3, [38, 50, 54, 57], 0.58, 3]],
];
export const DANUBE_BACKING = scoreBars(DANUBE_BARS, 3);

// Joplin 1902, first strain (original bars 5–20). Each item is one written
// eighth-note pulse. These are the bass/chord identities from the score, with
// octave doublings selectively retained and register compacted for the mix.
const RAG_PULSES: readonly (readonly (readonly number[])[])[] = [
  [[48], [52, 55, 60], [43, 55], [55, 58, 60]],
  [[41, 53], [57, 60], [40, 52], [55, 60]],
  [[43], [52, 55, 60], [43], [53, 55, 59]],
  [[48], [52, 55, 60], [52, 55, 60], [55, 59]],
  [[48], [52, 55, 60], [43, 55], [55, 58, 60]],
  [[41, 53], [57, 60], [40, 52], [39, 51]],
  [[38, 50], [50, 54, 57, 60], [50], [54, 57, 60]],
  [[55, 59], [43, 55], [45, 57], [47, 59]],
  [[48], [52, 55, 60], [43, 55], [55, 58, 60]],
  [[41, 53], [57, 60], [40, 52], [55, 60]],
  [[43], [52, 55, 60], [43], [53, 55, 59]],
  [[48], [52, 55, 60], [55, 60, 64], []],
  [[36, 48], [52, 55, 60], [34, 46], [52, 55, 60]],
  [[33, 45], [53, 57, 60], [32, 44], [53, 56, 60]],
  [[31, 43], [52, 55, 60], [43], [55, 59]],
  [[36, 48, 55, 60], [43, 55], [45, 57], [47, 59]],
];
export const RAG_BACKING: ChartNote[] = [
  ...score([[0, 1, [55, 59], 0.4, 0.8]]),
  ...scoreBars(Array.from({ length: 32 }, (_, bar): Bar => {
    if (bar === 31) return [[0, 4, [36, 48, 52, 55, 60], 0.65, 4]];
    const phrase = bar % 16;
    const shaping = phrase % 4 === 2 ? 1.06 : phrase % 4 === 3 ? 0.9 : 1;
    return RAG_PULSES[phrase].flatMap((notes, beat): ScoreStrike[] => notes.length
      ? [[beat, 0.9, notes, (beat % 2 ? 0.43 : 0.62) * shaping, beat % 2 ? 0.65 : 0.8]] : []);
  }), 4, 1),
];
