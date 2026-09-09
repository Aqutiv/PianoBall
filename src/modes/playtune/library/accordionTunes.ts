import { chordNotes } from '../../../audio/music';
import type { ChartNote, Tune } from '../chart';
import { scorePart } from './classicalNotation';
import { melodyPerformance } from './performanceNotation';
import { progression } from './notation';
import { figure } from './backingNotation';

/** Historical source readings and editorial accompaniment: docs/accordion-tunes.md. */
export const LE_TEMPS_DES_CERISES: Tune = {
  id: 'le-temps-des-cerises', title: 'Le Temps des cerises', composer: 'Antoine Renard',
  origin: 'classic', difficulty: 3, pass: 0.65,
  teaches: 'Let the accordion sing through a long tie, then breathe between phrases.',
  bpm: 108, beatsPerBar: 3, pickup: 1, root: 60, scaleId: 'ionian',
  voiceId: 'accordion', bedVoiceId: 'bed-accordion', accompaniment: 'waltz',
  // Benoit E.B.3940, printed pp.1-2: first vocal stanza, Ab major -> C.
  // Each source eighth becomes one chart beat. Omit the two small ornaments.
  melody: melodyPerformance(scorePart(`
    G4/1 |
    C5/1 C5/1 C5/1 | C5/2 C5/1 | D5/1 D5/1 D5/1 | D5/1 D5/1 D5/1 |
    E5/1 E5/1 E5/1 | E5/1 _/1 E5/1 | F5/1 F5/1 F5/1 | F5/1 _/1 E5/1 |
    E5/1 E5/1 F5/1 | E5/7 _/1 E5/1 |
    F5/1 F5/1 F5/1 | F5/1 _/1 F5/1 | F5/1 A5/1 F5/1 |
    F5/1 E5/0.5 _/0.5 E5/1 | E5/1 E5/1 E5/1 | G5/2 E5/1 |
    E5/1 D5/1 C5/1 | D5/3 | _/2 G4/1 |
    C5/1 C5/1 C5/1 | C5/2 C5/1 | D5/1 D5/1 D5/1 | D5/1 D5/1 D5/1 |
    E5/1 E5/1 E5/1 | G5/2 E5/1 | E5/1 D5/1 C5/1 | C5/3
  `), [[0, .74], [16, .84], [28, .8], [35, .64], [43, .86], [58, .65], [64, .76], [79, .84], [87, .6]], .94, .04),
  chords: progression([
    [4, 'dom7', 1],
    [0, 'maj', 3], [0, 'maj', 3], [4, 'dom7', 3], [4, 'dom7', 3],
    [0, 'maj', 3], [0, 'maj', 3], [3, 'maj', 3], [3, 'maj', 3],
    [0, 'maj', 3], [0, 'maj', 3], [5, 'min', 3], [5, 'min', 3],
    [3, 'maj', 3], [1, 'min', 3], [1, 'min', 3], [4, 'dom7', 3],
    [5, 'min', 3], [0, 'maj', 3], [4, 'dom7', 3], [4, 'dom7', 3],
    [4, 'dom7', 3], [0, 'maj', 3], [0, 'maj', 3], [4, 'dom7', 3],
    [4, 'dom7', 3], [0, 'maj', 3], [0, 'maj', 3], [4, 'dom7', 3], [0, 'maj', 3],
  ]),
};

/** Bass and upper chord pitches explicitly voiced for each automatic bar. */
type AccompanimentBar = readonly [bass: number, upper: readonly number[]];
function waltz(bars: readonly AccompanimentBar[]): ChartNote[] {
  return bars.flatMap(([bass, upper], i) => {
    const beat = 1 + i * 3;
    const final = i === bars.length - 1;
    return [
      { beat, len: final ? 3 : .8, note: bass, gain: .024, attack: .04 },
      ...(final ? [0] : [1, 2]).flatMap(offset => upper.map(note => ({
        beat: beat + offset, len: final ? 3 : .65, note, gain: final ? .014 : .012, attack: .04,
      }))),
    ];
  }).sort((a, b) => a.beat - b.beat || a.note - b.note);
}
const C = [48, [60, 64, 67]] as const, G7 = [43, [59, 62, 65]] as const;
const F = [41, [60, 65, 69]] as const, Am = [45, [60, 64, 69]] as const;
const Dm = [50, [60, 65, 69]] as const;
LE_TEMPS_DES_CERISES.backingNotes = waltz([
  C, C, G7, G7, C, C, F, F, C, C, Am, Am,
  F, Dm, Dm, G7, Am, C, G7, G7, G7, C, C, G7, G7, C, C, G7, C,
]);
export const CERISES_BACKING = figure(LE_TEMPS_DES_CERISES,
  [[0, 'bass', .8], [1, 'dyad', .7], [2, 'dyad', .7]], { start: 1, cadence: 85 });

// Warsaw, Hashomer Hatzair circular 20 (1923), early printed melody in E.
// Transposed down a whole tone. Cadential turns are reduced to their main
// notes; all three sections remain, with the first two repeated.
const HAVA_A = `
  D4/1 D4/1 _/0.5 F#4/0.5 Eb4/0.5 D4/0.5 |
  F#4/1 F#4/1 _/0.5 A4/0.5 G4/0.5 F#4/0.5 |
  G4/1 G4/1 _/0.5 Bb4/0.5 A4/0.5 G4/0.5 |
  F#4/1 Eb4/0.5 Eb4/0.5 D4/2
`;
const HAVA_B = `
  F#4/0.5 F#4/1 Eb4/0.5 D4/0.5 D4/0.5 D4/1 |
  G4/0.5 G4/1 F4/0.5 Eb4/0.5 Eb4/0.5 Eb4/1 |
  Eb4/1 G4/0.5 F4/0.5 Eb4/0.5 Eb4/0.5 Bb4/1 |
  F#4/1 Eb4/0.5 Eb4/0.5 D4/2
`;
const HAVA_C = `
  A4/4 | A4/1 A4/1 A4/1 A4/1 |
  A4/0.5 A4/0.5 C5/0.5 Bb4/0.5 A4/0.5 C5/0.5 Bb4/0.5 A4/0.5 |
  A4/0.5 A4/0.5 C5/0.5 Bb4/0.5 A4/0.5 C5/0.5 Bb4/0.5 A4/0.5 |
  Bb4/0.5 Bb4/0.5 D5/0.5 C5/0.5 Bb4/0.5 D5/0.5 C5/0.5 Bb4/0.5 |
  Bb4/0.5 Bb4/0.5 D5/0.5 C5/0.5 Bb4/0.5 D5/0.5 C5/0.5 Bb4/0.5 |
  Bb4/0.5 Bb4/0.5 D5/1 Bb4/0.5 Bb4/0.5 D5/0.5 D4/0.5 |
  D4/0.5 D4/0.5 A4/0.5 F#4/0.5 D4/2
`;
export const HAVA_NAGILA: Tune = {
  id: 'hava-nagila', title: 'Hava Nagila', composer: 'Traditional / A. Z. Idelsohn',
  origin: 'classic', difficulty: 3, pass: 0.65,
  teaches: 'Hear the distinctive modal steps and build a three-part celebration.',
  bpm: 108, beatsPerBar: 4, root: 62, scaleId: 'aeolian', borrows: [1, 4],
  voiceId: 'accordion', bedVoiceId: 'nylon-guitar', accompaniment: 'march',
  melody: melodyPerformance(scorePart([HAVA_A, HAVA_A, HAVA_B, HAVA_B, HAVA_C].join(' | ')),
    [[0, .78], [16, .84], [32, .78], [48, .84], [64, .65], [72, .78], [80, .87], [88, .9], [95, .62]], .9, .035),
  // D major is the modal tonic; G minor and C minor support the upper phrases.
  chords: progression([
    ...Array.from({ length: 2 }, () => [[0, 'maj', 4], [0, 'maj', 4], [3, 'min', 4], [0, 'maj', 4]] as const).flat(),
    ...Array.from({ length: 2 }, () => [[0, 'maj', 4], [6, 'min', 4], [6, 'min', 4], [0, 'maj', 4]] as const).flat(),
    [0, 'maj', 4], [0, 'maj', 4], [3, 'min', 4], [3, 'min', 4],
    [3, 'min', 4], [3, 'min', 4], [3, 'min', 4], [0, 'maj', 4],
  ]),
};

// Original plucked accompaniment. Bass alternates root/fifth; upper voicings
// are authored separately from the compact notes graded in the Backing role.
const havaVoicings: readonly AccompanimentBar[] = [
  [38, [57, 62, 66]], [38, [57, 62, 66]], [43, [58, 62, 67]], [38, [57, 62, 66]],
  [38, [57, 62, 66]], [38, [57, 62, 66]], [43, [58, 62, 67]], [38, [57, 62, 66]],
  [38, [57, 62, 66]], [48, [55, 60, 63]], [48, [55, 60, 63]], [38, [57, 62, 66]],
  [38, [57, 62, 66]], [48, [55, 60, 63]], [48, [55, 60, 63]], [38, [57, 62, 66]],
  [38, [57, 62, 66]], [38, [57, 62, 66]], [43, [58, 62, 67]], [43, [58, 62, 67]],
  [43, [58, 62, 67]], [43, [58, 62, 67]], [43, [58, 62, 67]], [38, [57, 62, 66]],
];
HAVA_NAGILA.backingNotes = havaVoicings.flatMap(([bass, upper], bar) => {
  const beat = bar * 4;
  return [
    ...[0, 2].map(offset => ({ beat: beat + offset, len: .8, note: bass + (offset === 2 ? 7 : 0), gain: .045, attack: .012 })),
    ...[1, 3].flatMap(offset => upper.map(note => ({ beat: beat + offset, len: .65, note, gain: .027, attack: .012 }))),
  ];
}).filter(n => n.beat < 94).concat(chordNotes(50, 'maj').map(note => ({ beat: 94, len: 2, note, gain: .033, attack: .012 })))
  .sort((a, b) => a.beat - b.beat || a.note - b.note);
export const HAVA_BACKING = figure(HAVA_NAGILA,
  [[0, 'bass', .8], [1, 'dyad', .7], [2, 'fifth', .8], [3, 'dyad', .7]], { cadence: 94 });
