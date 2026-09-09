import { melodyInstruments } from '../fixedPairings';
import type { ChartNote, Tune } from '../chart';
import { figure } from './backingNotation';
import { line, progression, R, type ChordStep, type Step } from './notation';
import { repeatRhythm } from './rhythmNotation';
import { melodyPerformance } from './performanceNotation';

const E3 = 52, F3 = 53, G3 = 55, A3 = 57, B3 = 59;
const C4 = 60, D4 = 62, E4 = 64, F4 = 65, Fs4 = 66, G4 = 67, A4 = 69, B4 = 71;
const C5 = 72, D5 = 74, E5 = 76, Fs5 = 78, G5 = 79, A5 = 81, B5 = 83;

// Stewart, 1880, p. 2: the three systems preceding "1st Var.". The printed
// A-major banjo melody is transposed to C; its chordal third system is folded
// into the same register as the second. Banjo bass/chord doublings and shortened
// upper-voice articulation are left to the separately authored accompaniment.
// The transcription below uses quarter durations, converted to eighth-note
// chart beats when published. See docs/traditional-marching-jig.md.
const YANKEE_STRAIN: Step[] = [
  [C4, .5], [C4, .5], [D4, .5], [E4, .5],
  [C4, .5], [C4, .5], [B3, .5], [G3, .5],
  [C4, .5], [C4, .5], [D4, .5], [E4, .5],
  [C4, .5], [B3, .5], [G3, .5], [G3, .5],
  [C4, .5], [C4, .5], [D4, .5], [E4, .5],
  [F4, .5], [E4, .5], [D4, .5], [C4, .5],
  [B3, .5], [G3, .5], [A3, .5], [B3, .5],
  [C4, 1], [C4, .5], [R, .5],
];
const YANKEE_CHORUS: Step[] = [
  [A3, .75], [A3, .25], [A3, .5], [G3, .5],
  [A3, .5], [B3, .5], [C4, .5], [A3, .5],
  [G3, .5], [A3, .5], [G3, .5], [F3, .5],
  [E3, .75], [E3, .25], [G3, 1],
  [A3, .75], [A3, .25], [A3, .5], [G3, .5],
  [A3, .5], [B3, .5], [C4, .5], [A3, .5],
  [G3, .5], [C4, .5], [B3, .5], [D4, .5],
  [C4, 1], [R, 1],
];
const YANKEE_CHORDAL_CHORUS: Step[] = [
  ...YANKEE_CHORUS.slice(0, 12),
  [E3, 1], [G3, 1],
  ...YANKEE_CHORUS.slice(15, 23),
  [G3, .5], [C4, .75], [B3, .25], [D4, .5],
  // Sustain the final melody tonic over the source's concluding bass motion.
  [C4, 2],
];
const YANKEE_A_HARMONY: ChordStep[] = [
  [0, 'maj', 2], [4, 'maj', 2], [0, 'maj', 2], [4, 'maj', 2],
  [0, 'maj', 2], [3, 'maj', 2], [4, 'dom7', 2], [0, 'maj', 2],
];
const YANKEE_B_HARMONY: ChordStep[] = [
  [3, 'maj', 2], [3, 'maj', 2], [0, 'maj', 2], [0, 'maj', 2],
  [3, 'maj', 2], [1, 'min', 2], [4, 'dom7', 2], [0, 'maj', 2],
];

export const YANKEE_DOODLE: Tune = {
  id: 'yankee-doodle', title: 'Yankee Doodle', composer: 'Traditional', origin: 'classic',
  difficulty: 2, pass: .63,
  teaches: 'A marching tune with dotted rhythms and a returning chorus.',
  bpm: 132, beatsPerBar: 4, pickup: 1, root: C4, scaleId: 'ionian',
  ...melodyInstruments('yankee-doodle'), accompaniment: 'march',
  melody: line([[G3, .5], ...YANKEE_STRAIN, ...YANKEE_CHORUS, ...YANKEE_CHORDAL_CHORUS]
    .map(([note, len]): Step => [note, len * 2])),
  chords: progression([[4, 'maj', .5], ...YANKEE_A_HARMONY, ...YANKEE_B_HARMONY, ...YANKEE_B_HARMONY])
    .map(c => ({ ...c, beat: c.beat * 2, len: c.len * 2 })),
  rhythm: repeatRhythm({
    beatsPerBar: 4, barOrigin: 1, endBeat: 97,
    hits: [
      { beat: 0, voice: 'kick', gain: .17 },
      { beat: 0, voice: 'snare', gain: .22 },
      { beat: 1, voice: 'snare', gain: .075 },
      { beat: 2, voice: 'snare', gain: .16 },
      { beat: 3, voice: 'snare', gain: .075 },
    ],
  }),
};
// The automatic duet has chord answers; the player learns an independent
// marching bass line, alternating root and fifth before the final chord.
YANKEE_DOODLE.backingNotes = figure(YANKEE_DOODLE, [
  [0, 'bass', 1.8], [2, 'dyad', 1.8],
], { cadence: 93 });
export const YANKEE_DOODLE_BACKING: ChartNote[] = figure(YANKEE_DOODLE, [
  [0, 'bass', 1.8], [2, 'fifth', 1.8],
], { cadence: 93 });

// O'Neill, The Dance Music of Ireland (1907), no. 317, "The Irishwoman",
// printed p. 67. The actual score, including both repeats, supplies AABB.
// Chart beats are eighth notes: each opening sixteenth is half a beat.
const IRISH_A: Step[] = [
  [D5, .5], [C5, .5],
  [B4, 1], [G4, 1], [G4, 1], [D4, 1], [G4, 1], [G4, 1],
  [B4, 1], [G4, 1], [B4, 1], [D5, 1], [C5, 1], [B4, 1],
  [C5, 1], [A4, 1], [A4, 1], [Fs4, 1], [A4, 1], [A4, 1],
  [C5, 1], [A4, 1], [C5, 1], [E5, 1], [D5, 1], [C5, 1],
  [B4, 1], [G4, 1], [G4, 1], [D4, 1], [G4, 1], [G4, 1],
  [B4, 1], [G4, 1], [B4, 1], [D5, 1], [C5, 1], [B4, 1],
  [C5, 1], [B4, 1], [C5, 1], [A4, 1], [D5, 1], [C5, 1],
  [B4, 1], [G4, 1], [G4, 1], [G4, 2],
];
const IRISH_B: Step[] = [
  [G5, 1],
  [G5, 1], [D5, 1], [G5, 1], [G5, 1], [D5, 1], [G5, 1],
  [G5, 1], [D5, 1], [G5, 1], [B5, 1], [A5, 1], [G5, 1],
  [Fs5, 1], [D5, 1], [Fs5, 1], [Fs5, 1], [D5, 1], [Fs5, 1],
  [Fs5, 1], [D5, 1], [Fs5, 1], [A5, 1], [G5, 1], [Fs5, 1],
  [E5, 1], [G5, 1], [G5, 1], [D5, 1], [G5, 1], [G5, 1],
  [C5, 1], [G5, 1], [G5, 1], [B4, 1], [G5, 1], [G5, 1],
  [C5, 1], [A4, 1], [C5, 1], [A4, 1], [D5, 1], [C5, 1],
  [B4, 1], [G4, 1], [G4, 1], [G4, 2],
];
const IRISH_A_HARMONY: ChordStep[] = [
  [4, 'dom7', 1],
  [0, 'maj', 6], [0, 'maj', 6], [4, 'dom7', 6], [4, 'dom7', 6],
  [0, 'maj', 6], [0, 'maj', 6], [4, 'dom7', 6], [0, 'maj', 5],
];
const IRISH_B_HARMONY: ChordStep[] = [
  [0, 'maj', 1],
  [0, 'maj', 6], [0, 'maj', 6], [4, 'maj', 6], [4, 'maj', 6],
  [3, 'maj', 3], [0, 'maj', 3], [3, 'maj', 3], [0, 'maj', 3],
  [4, 'dom7', 6], [0, 'maj', 5],
];

export const IRISH_WASHERWOMAN: Tune = {
  id: 'irish-washerwoman', title: 'The Irish Washerwoman', composer: 'Traditional', origin: 'classic',
  difficulty: 4, pass: .67,
  teaches: 'A double jig in two groups of three, with pickups into each strain.',
  bpm: 132, beatsPerBar: 6, pickup: 1, root: G4, scaleId: 'ionian',
  ...melodyInstruments('irish-washerwoman'), accompaniment: 'compound',
  melody: line([...IRISH_A, ...IRISH_A, ...IRISH_B, ...IRISH_B]),
  // Each dotted-quarter pulse names its harmony, including repeated chords.
  chords: progression([...IRISH_A_HARMONY, ...IRISH_A_HARMONY, ...IRISH_B_HARMONY, ...IRISH_B_HARMONY]
    .flatMap(([degree, quality, len]): ChordStep[] => len > 3
      ? [[degree, quality, 3], [degree, quality, len - 3]]
      : [[degree, quality, len]])),
  rhythm: repeatRhythm({
    beatsPerBar: 6, barOrigin: 1, endBeat: 192,
    hits: [
      { beat: 0, voice: 'tomLo', gain: .24 },
      { beat: 2, voice: 'rim', gain: .07 },
      { beat: 3, voice: 'tomLo', gain: .17 },
      { beat: 5, voice: 'rim', gain: .07 },
    ],
  }),
};
// Harp motion follows the two dotted-quarter pulses, not three waltz accents.
// Written notes replace the fallback comp pattern in the actual arrangement.
// The last chord sustains across two identical G-major pulse entries.
IRISH_WASHERWOMAN.backingNotes = figure(IRISH_WASHERWOMAN, [
  [0, 'bass', 2], [1, 'third', 1], [2, 'top', 1],
  [3, 'fifth', 2], [4, 'third', 1], [5, 'top', 1],
], { cadence: 187 }).map(n => n.beat === 187 ? { ...n, len: 5 } : n);
export const IRISH_WASHERWOMAN_BACKING: ChartNote[] = figure(IRISH_WASHERWOMAN, [
  [0, 'bass', 2], [2, 'third', 1], [3, 'fifth', 2], [5, 'dyad', 1],
], { cadence: 187 }).map(n => n.beat === 187 ? { ...n, len: 5 } : n);

export const MARCHING_JIG_TUNES: Tune[] = [YANKEE_DOODLE, IRISH_WASHERWOMAN];



// Phrase expression changes only the performance, never source notes or rhythm.
YANKEE_DOODLE.melody = melodyPerformance(YANKEE_DOODLE.melody,
  [[0, .76], [9, .86], [25, .8], [33, .72], [49, .84], [61, .72], [65, .8], [81, .88], [93, .66]]);
YANKEE_DOODLE.backingNotes = melodyPerformance(YANKEE_DOODLE.backingNotes!,
  [[0, .42], [17, .48], [29, .4], [33, .44], [61, .4], [65, .46], [93, .38]], .9);
IRISH_WASHERWOMAN.melody = melodyPerformance(IRISH_WASHERWOMAN.melody,
  [[0, .76], [19, .84], [43, .68], [49, .78], [91, .7], [97, .86], [139, .72], [145, .88], [187, .65]]);
IRISH_WASHERWOMAN.backingNotes = melodyPerformance(IRISH_WASHERWOMAN.backingNotes!,
  [[0, .4], [25, .46], [43, .36], [49, .42], [91, .36], [97, .46], [139, .38], [145, .46], [187, .35]], .92);
