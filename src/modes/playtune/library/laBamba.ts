import type { ChartNote, Tune } from '../chart';
import { figure } from './backingNotation';
import { line, merge, progression, shift, type Step } from './notation';
import { repeatRhythm } from './rhythmNotation';

/*
 * Traditional son jarocho melody, read from Voz 1 on printed p. 66 of the
 * SEP/ConArte songbook. The source is in G; these pitches transpose it to C.
 * Only the first complete copla and response are used, not the publication's
 * second voice, introduction, or accompaniment. See docs/traditional-la-bamba.md.
 */
const G3 = 55, A3 = 57, B3 = 59, C4 = 60, D4 = 62, E4 = 64, F4 = 65;
const PICKUP = 1.25;
const REPEAT = 36;
const END = REPEAT * 2;

const fivePickupNotes: Step[] = Array.from({ length: 5 }, () => [F4, 0.25]);
// Printed bars 10, 12 and 14. The tied D4 sixteenths are one key press.
const runningLine: Step[] = [
  [E4, 0.5], [C4, 0.25], [C4, 0.25], [C4, 0.25], [A3, 0.5],
  [D4, 0.5], [B3, 0.5], [D4, 0.25], [F4, 0.5], [E4, 0.25], [D4, 0.25],
];
// Printed bars 11, 13 and 15 retain the three triplet eighths.
const answeringLine: Step[] = [
  [E4, 0.5], [C4, 0.5], [null, 1], [null, 0.25], [F4, 0.5], [F4, 0.25],
  [F4, 1 / 3], [F4, 1 / 3], [F4, 1 / 3],
];

const copla = merge(
  line(fivePickupNotes), // bar 8, from its first vocal onset
  line([[E4, 0.5], [C4, 0.5], [null, 1.75], ...fivePickupNotes], PICKUP),
  line(runningLine, PICKUP + 4),
  line(answeringLine, PICKUP + 8),
  line(runningLine, PICKUP + 12),
  line(answeringLine, PICKUP + 16),
  line(runningLine, PICKUP + 20),
  line(answeringLine, PICKUP + 24),
  line([
    [E4, 0.5], [C4, 0.25], [C4, 0.25], [C4, 0.25], [A3, 0.5],
    [D4, 0.25], [null, 0.5], [B3, 0.5], [D4, 0.5], [F4, 0.5],
  ], PICKUP + 28),
  // Bar 17: stop at the response's cadence, before the next copla begins.
  line([[E4, 0.5], [E4, 0.5], [C4, 0.5], [A3, 0.5], [G3, 1 / 3]], PICKUP + 32),
);

// I–IV–V–V in each four-quarter compás. Keep the dominant through the pickup
// and both response cadences; the source's final melody note is the dominant.
const chords = progression([[4, 'maj', PICKUP]]);
for (let beat = PICKUP; beat < END; beat += 4) {
  for (const chord of progression([[0, 'maj', 1], [3, 'maj', 1], [4, 'maj', 2]], beat)) {
    if (chord.beat < END) chords.push({ ...chord, len: Math.min(chord.len, END - chord.beat) });
  }
}

const quarterNoteChart: Tune = {
  id: 'la-bamba',
  title: 'La Bamba',
  composer: 'Traditional · Veracruz, Mexico',
  origin: 'classic',
  difficulty: 3,
  teaches: 'Short pickups and triplets over a steady son jarocho pulse.',
  // Preserve all sixteenths while fitting the eight-note visual density limit.
  // At quarter = 60, the shortest input gaps are 250 ms.
  bpm: 60,
  beatsPerBar: 4,
  pickup: PICKUP,
  root: C4,
  scaleId: 'ionian',
  voiceId: 'felt-piano',
  bedVoiceId: 'nylon-guitar',
  accompaniment: 'pulse',
  pass: 0.65,
  // The sourced phrase lasts 35 7/12 beats. A 5/12-beat breath places its
  // repeat back on the same pickup phase, rather than stretching the melody.
  melody: merge(copla, shift(copla, REPEAT)),
  chords,
  // These are quiet editorial synthetic accents, not a tarima or a recording
  // of traditional footwork. The plucked accompaniment carries the rhythm.
  rhythm: repeatRhythm({
    beatsPerBar: 4, barOrigin: PICKUP, endBeat: END - 0.75,
    hits: [
      { beat: 0, voice: 'rim', gain: 0.10 },
      { beat: 2, voice: 'rim', gain: 0.08 },
      { beat: 0, voice: 'shaker', gain: 0.05 },
      { beat: 0.5, voice: 'shaker', gain: 0.035 },
      { beat: 1, voice: 'shaker', gain: 0.05 },
      { beat: 1.5, voice: 'shaker', gain: 0.035 },
      { beat: 2, voice: 'shaker', gain: 0.05 },
      { beat: 2.5, voice: 'shaker', gain: 0.035 },
      { beat: 3, voice: 'shaker', gain: 0.05 },
      { beat: 3.5, voice: 'shaker', gain: 0.035 },
    ],
  }),
};

/** Original plucked part: short bass notes and offbeat chord answers. */
quarterNoteChart.backingNotes = figure(quarterNoteChart, [
  [0, 'bass', 0.4], [0.5, 'dyad', 0.35],
  [1, 'bass', 0.4], [1.5, 'dyad', 0.35],
  [2, 'bass', 0.4], [2.5, 'dyad', 0.35], [3.5, 'dyad', 0.35],
], { start: PICKUP, cadence: END - 0.75 });

/** Accessible piano reduction: one attack per quarter, at the same harmonic phase. */
const pianoReduction = figure(quarterNoteChart, [
  [0, 'bass', 0.8], [1, 'dyad', 0.8],
  [2, 'bass', 0.8], [3, 'dyad', 0.8],
], { start: PICKUP, cadence: END - 0.75 });


// The source above stays in printed quarter-note units. Export equivalent
// eighth-note units so the fixed visual approach does not crowd the screen.
// Every time coordinate and BPM doubles; pitches and audible timing do not.
function eighthUnits<T extends { beat: number; len: number }>(events: readonly T[]): T[] {
  return events.map(event => ({ ...event, beat: event.beat * 2, len: event.len * 2 }));
}

export const LA_BAMBA: Tune = {
  ...quarterNoteChart,
  bpm: quarterNoteChart.bpm * 2,
  beatsPerBar: quarterNoteChart.beatsPerBar * 2,
  pickup: PICKUP * 2,
  melody: eighthUnits(quarterNoteChart.melody),
  chords: eighthUnits(quarterNoteChart.chords),
  backingNotes: eighthUnits(quarterNoteChart.backingNotes),
  rhythm: {
    sections: eighthUnits(quarterNoteChart.rhythm!.sections),
    hits: quarterNoteChart.rhythm!.hits!.map(hit => ({ ...hit, beat: hit.beat * 2 })),
  },
};

export const LA_BAMBA_BACKING: ChartNote[] = eighthUnits(pianoReduction);
