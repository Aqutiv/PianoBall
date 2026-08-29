import type { Tune } from '../chart';
import { line, bars, merge, harmonise, shift } from './notation';

/*
 * Public-domain melodies, encoded as beats and MIDI notes.
 *
 * Every composer here died well over a century ago, and these are the tunes
 * themselves rather than any particular modern edition of them. Each is written
 * where it reads most clearly; `fitToRange` moves the whole chart by octaves
 * onto whatever keyboard is plugged in.
 *
 * `scaleId` names the scale the *chord degrees* are resolved against, not a
 * constraint on the melody: PlayTune never snaps what the player presses, so a
 * chart is free to use notes from outside it (Für Elise leans on exactly that).
 * The major-key tunes use mixolydian, whose first six degrees are the major
 * scale's, because there is no plain ionian in the app's scale list.
 */

const E4 = 64, F4 = 65, Fs4 = 66, G4 = 67, Gs4 = 68, A4 = 69, B4 = 71;
const C4 = 60, D4 = 62;
const C5 = 72, Cs5 = 73, D5 = 74, Ds5 = 75, E5 = 76, F5 = 77, Fs5 = 78, G5 = 79;
const Gs5 = 80, A5 = 81, B5 = 83;

/** Stepwise, square, and everyone already knows how it goes. */
export const ODE_TO_JOY: Tune = {
  id: 'ode-to-joy',
  title: 'Ode to Joy',
  composer: 'Beethoven',
  origin: 'classic',
  difficulty: 1,
  teaches: 'Neighbouring keys, one step at a time.',
  bpm: 96,
  beatsPerBar: 4,
  root: C4,
  scaleId: 'mixolydian',
  pass: 0.65,
  melody: line([
    [E4, 1], [E4, 1], [F4, 1], [G4, 1],
    [G4, 1], [F4, 1], [E4, 1], [D4, 1],
    [C4, 1], [C4, 1], [D4, 1], [E4, 1],
    [E4, 1.5], [D4, 0.5], [D4, 2],

    [E4, 1], [E4, 1], [F4, 1], [G4, 1],
    [G4, 1], [F4, 1], [E4, 1], [D4, 1],
    [C4, 1], [C4, 1], [D4, 1], [E4, 1],
    [D4, 1.5], [C4, 0.5], [C4, 2],
  ]),
  chords: bars([
    [0, 'maj'], [4, 'maj'], [0, 'maj'], [4, 'maj'],
    [0, 'maj'], [4, 'maj'], [0, 'maj'], [0, 'maj'],
  ], 4),
};

/** The leap of a fifth, six times over. */
export const TWINKLE: Tune = {
  id: 'twinkle',
  title: 'Twinkle, Twinkle',
  composer: 'Traditional',
  origin: 'classic',
  difficulty: 1,
  teaches: 'Jumping a fifth and landing on it.',
  bpm: 100,
  beatsPerBar: 4,
  root: C4,
  scaleId: 'mixolydian',
  pass: 0.65,
  melody: line([
    [C4, 1], [C4, 1], [G4, 1], [G4, 1], [A4, 1], [A4, 1], [G4, 2],
    [F4, 1], [F4, 1], [E4, 1], [E4, 1], [D4, 1], [D4, 1], [C4, 2],
    [G4, 1], [G4, 1], [F4, 1], [F4, 1], [E4, 1], [E4, 1], [D4, 2],
    [G4, 1], [G4, 1], [F4, 1], [F4, 1], [E4, 1], [E4, 1], [D4, 2],
    [C4, 1], [C4, 1], [G4, 1], [G4, 1], [A4, 1], [A4, 1], [G4, 2],
    [F4, 1], [F4, 1], [E4, 1], [E4, 1], [D4, 1], [D4, 1], [C4, 2],
  ]),
  chords: bars([
    [0, 'maj'], [0, 'maj'], [3, 'maj'], [0, 'maj'],
    [3, 'maj'], [0, 'maj'], [4, 'maj'], [0, 'maj'],
    [0, 'maj'], [4, 'maj'], [0, 'maj'], [4, 'maj'],
    [0, 'maj'], [4, 'maj'], [0, 'maj'], [4, 'maj'],
    [0, 'maj'], [0, 'maj'], [3, 'maj'], [0, 'maj'],
    [3, 'maj'], [0, 'maj'], [4, 'maj'], [0, 'maj'],
  ], 2),
};

/** Three-four, with a pickup, and a dotted figure that has to swing. */
export const AMAZING_GRACE: Tune = {
  id: 'amazing-grace',
  title: 'Amazing Grace',
  composer: 'Traditional',
  origin: 'classic',
  difficulty: 2,
  teaches: 'Counting in three, and starting before the bar.',
  bpm: 84,
  beatsPerBar: 3,
  root: G4,
  scaleId: 'mixolydian',
  pass: 0.65,
  melody: line([
    [D4, 1],
    [G4, 2], [B4, 0.5], [G4, 0.5],
    [B4, 2], [A4, 1],
    [G4, 2], [E4, 1],
    [D4, 2], [D4, 1],
    [G4, 2], [B4, 0.5], [G4, 0.5],
    [B4, 2], [A4, 1],
    [D5, 3],
    [D5, 2], [B4, 1],
    [D5, 1], [D5, 1], [B4, 1],
    [G4, 2], [E4, 1],
    [D4, 2], [D4, 1],
    [G4, 2], [B4, 0.5], [G4, 0.5],
    [B4, 2], [A4, 1],
    [G4, 3],
  ]),
  chords: [
    { beat: 0, len: 1, degree: 0, quality: 'maj' },
    ...bars([
      [0, 'maj'], [0, 'maj'], [3, 'maj'], [0, 'maj'],
      [0, 'maj'], [0, 'maj'], [4, 'maj'], [0, 'maj'],
      [0, 'maj'], [3, 'maj'], [0, 'maj'], [0, 'maj'],
      [0, 'maj'], [4, 'maj'], [0, 'maj'],
    ], 3, 1),
  ],
};

/** Dorian, in three, with the flattened seventh doing all the work. */
export const SCARBOROUGH_FAIR: Tune = {
  id: 'scarborough-fair',
  title: 'Scarborough Fair',
  composer: 'Traditional',
  origin: 'classic',
  difficulty: 2,
  teaches: 'A minor mode that is not quite minor.',
  bpm: 92,
  beatsPerBar: 3,
  root: A4,
  scaleId: 'dorian',
  pass: 0.68,
  melody: line([
    [A4, 1], [A4, 1], [E5, 1],
    [E5, 2], [E5, 1],
    [B4, 1], [C5, 1], [B4, 1],
    [A4, 3],
    [A4, 1], [C5, 1], [D5, 1],
    [E5, 2], [C5, 1],
    [A4, 1], [B4, 1], [A4, 1],
    [G4, 3],
    [A4, 1], [A4, 1], [E5, 1],
    [E5, 2], [Fs5, 1],
    [E5, 1], [D5, 1], [C5, 1],
    [B4, 3],
    [A4, 1], [B4, 1], [C5, 1],
    [B4, 2], [A4, 1],
    [A4, 3],
  ]),
  chords: bars([
    [0, 'min'], [0, 'min'], [6, 'maj'], [0, 'min'],
    [0, 'min'], [2, 'maj'], [6, 'maj'], [0, 'min'],
    [0, 'min'], [2, 'maj'], [6, 'maj'], [0, 'min'],
    [0, 'min'], [6, 'maj'], [0, 'min'],
  ], 3),
};

/** Six-eight, counted as six, with a raised seventh at every cadence. */
export const GREENSLEEVES: Tune = {
  id: 'greensleeves',
  title: 'Greensleeves',
  composer: 'Traditional',
  origin: 'classic',
  difficulty: 3,
  teaches: 'A lilting six, and a note from outside the key.',
  bpm: 168,
  beatsPerBar: 6,
  root: A4,
  scaleId: 'aeolian',
  pass: 0.7,
  melody: line([
    [A4, 1],
    [C5, 2], [D5, 1], [E5, 1.5], [F5, 0.5], [E5, 1],
    [D5, 2], [B4, 1], [G4, 1.5], [A4, 0.5], [B4, 1],
    [C5, 2], [A4, 1], [A4, 1.5], [Gs4, 0.5], [A4, 1],
    [B4, 2], [Gs4, 1], [E4, 3],
    [C5, 2], [D5, 1], [E5, 1.5], [F5, 0.5], [E5, 1],
    [D5, 2], [B4, 1], [G4, 1.5], [A4, 0.5], [B4, 1],
    [C5, 2], [B4, 1], [A4, 1.5], [Gs4, 0.5], [A4, 1],
    [B4, 2], [Gs4, 1], [A4, 3],
  ]),
  chords: [
    { beat: 0, len: 1, degree: 0, quality: 'min' },
    ...bars([
      [0, 'min'], [6, 'maj'], [0, 'min'], [4, 'maj'],
      [0, 'min'], [6, 'maj'], [0, 'min'], [4, 'maj'],
    ], 6, 1),
  ],
};

/** Fast alternation on two adjacent keys, one of them a black one. */
export const FUR_ELISE: Tune = {
  id: 'fur-elise',
  title: 'Für Elise',
  composer: 'Beethoven',
  origin: 'classic',
  difficulty: 3,
  teaches: 'Alternating semitones at speed.',
  bpm: 168,
  beatsPerBar: 3,
  root: A4,
  scaleId: 'aeolian',
  pass: 0.7,
  melody: line([
    [E5, 1], [Ds5, 1], [E5, 1],
    [Ds5, 1], [E5, 1], [B4, 1],
    [D5, 1], [C5, 1], [A4, 1],
    [A4, 3],
    [C4, 1], [E4, 1], [A4, 1],
    [B4, 3],
    [E4, 1], [Gs4, 1], [B4, 1],
    [C5, 3],
    [E4, 1], [E5, 1], [Ds5, 1],
    [E5, 1], [Ds5, 1], [E5, 1],
    [B4, 1], [D5, 1], [C5, 1],
    [A4, 3],
  ]),
  chords: bars([
    [0, 'min'], [0, 'min'], [0, 'min'], [0, 'min'],
    [0, 'min'], [4, 'maj'], [4, 'maj'], [2, 'maj'],
    [4, 'maj'], [0, 'min'], [0, 'min'], [0, 'min'],
  ], 3),
};

/** A wide, slow phrase that has to be shaped rather than merely hit. */
export const LONDONDERRY_AIR: Tune = {
  id: 'londonderry-air',
  title: 'Londonderry Air',
  composer: 'Traditional',
  origin: 'classic',
  difficulty: 3,
  teaches: 'A phrase that spans more than an octave.',
  bpm: 76,
  beatsPerBar: 4,
  root: C4,
  scaleId: 'mixolydian',
  pass: 0.7,
  melody: line([
    [G4, 1],
    [C5, 2], [E5, 1], [G5, 1],
    [A5, 2], [G5, 2],
    [E5, 2], [C5, 1], [D5, 1],
    [E5, 4],
    [D5, 2], [C5, 1], [A4, 1],
    [G4, 2], [A4, 1], [C5, 1],
    [C5, 2], [A4, 2],
    [G4, 4],
  ]),
  chords: [
    { beat: 0, len: 1, degree: 0, quality: 'maj' },
    ...bars([
      [0, 'maj'], [3, 'maj'], [0, 'maj'], [4, 'maj'],
      [3, 'maj'], [0, 'maj'], [4, 'maj'], [0, 'maj'],
    ], 4, 1),
  ],
};

/** Quicker, and it never stops moving. */
export const MINUET_IN_G: Tune = {
  id: 'minuet-in-g',
  title: 'Minuet in G',
  composer: 'Petzold',
  origin: 'classic',
  difficulty: 4,
  teaches: 'Running quavers between the beats.',
  bpm: 132,
  beatsPerBar: 3,
  root: G4,
  scaleId: 'mixolydian',
  pass: 0.72,
  melody: line([
    [D5, 1], [G4, 0.5], [A4, 0.5], [B4, 0.5], [C5, 0.5],
    [D5, 1], [G4, 1], [G4, 1],
    [E5, 1], [C5, 0.5], [D5, 0.5], [E5, 0.5], [Fs5, 0.5],
    [G5, 1], [G4, 1], [G4, 1],
    [C5, 1], [D5, 0.5], [C5, 0.5], [B4, 0.5], [A4, 0.5],
    [B4, 1], [C5, 0.5], [B4, 0.5], [A4, 0.5], [G4, 0.5],
    [Fs4, 1], [G4, 0.5], [A4, 0.5], [B4, 0.5], [G4, 0.5],
    [A4, 3],
  ]),
  chords: bars([
    [0, 'maj'], [0, 'maj'], [3, 'maj'], [0, 'maj'],
    [3, 'maj'], [0, 'maj'], [4, 'maj'], [4, 'maj'],
  ], 3),
};

/** Almost nothing happens, very slowly, and every entry is exposed. */
export const GYMNOPEDIE: Tune = {
  id: 'gymnopedie',
  title: 'Gymnopédie No. 1',
  composer: 'Satie',
  origin: 'classic',
  difficulty: 4,
  teaches: 'Waiting, and coming in exactly on time.',
  bpm: 60,
  beatsPerBar: 3,
  root: D4,
  scaleId: 'mixolydian',
  pass: 0.72,
  melody: line([
    [Fs5, 3],
    [A5, 3],
    [Gs5, 2], [Fs5, 1],
    [E5, 3],
    [Fs5, 3],
    [D5, 3],
    [Cs5, 2], [B4, 1],
    [A4, 3],
    [B4, 3],
    [Cs5, 3],
    [D5, 2], [E5, 1],
    [Fs5, 3],
    [E5, 2], [D5, 1],
    [Cs5, 3],
    [B4, 2], [A4, 1],
    [A4, 3],
  ]),
  chords: bars([
    [3, 'maj7'], [0, 'maj7'], [3, 'maj7'], [0, 'maj7'],
    [3, 'maj7'], [0, 'maj7'], [4, 'min7'], [0, 'maj7'],
    [3, 'maj7'], [0, 'maj7'], [3, 'maj7'], [0, 'maj7'],
    [4, 'min7'], [3, 'maj7'], [4, 'min7'], [0, 'maj7'],
  ], 3),
};

const CANON_LONG = line([
  [Fs5, 2], [E5, 2],
  [D5, 2], [Cs5, 2],
  [B4, 2], [A4, 2],
  [B4, 2], [Cs5, 2],
  [D5, 2], [Cs5, 2],
  [B4, 2], [A4, 2],
  [G4, 2], [Fs4, 2],
  [G4, 2], [E4, 2],
]);

const CANON_RUN = line([
  [D5, 0.5], [E5, 0.5], [Fs5, 0.5], [G5, 0.5], [A5, 0.5], [G5, 0.5], [Fs5, 0.5], [E5, 0.5],
  [D5, 0.5], [Cs5, 0.5], [B4, 0.5], [Cs5, 0.5], [D5, 0.5], [Cs5, 0.5], [B4, 0.5], [A4, 0.5],
  [B4, 0.5], [A4, 0.5], [G4, 0.5], [A4, 0.5], [B4, 0.5], [Cs5, 0.5], [D5, 0.5], [E5, 0.5],
  [Fs5, 0.5], [E5, 0.5], [D5, 0.5], [E5, 0.5], [Fs5, 0.5], [G5, 0.5], [A5, 0.5], [B5, 0.5],
], 32);

/** Long form: the same eight-bar ground twice, the second time in quavers. */
export const CANON_IN_D: Tune = {
  id: 'canon-in-d',
  title: 'Canon in D',
  composer: 'Pachelbel',
  origin: 'classic',
  difficulty: 5,
  teaches: 'Holding a long form together as it doubles in speed.',
  bpm: 100,
  beatsPerBar: 4,
  root: D4,
  scaleId: 'mixolydian',
  pass: 0.75,
  melody: merge(CANON_LONG, CANON_RUN),
  chords: bars([
    [0, 'maj'], [4, 'maj'], [5, 'min'], [2, 'min'],
    [3, 'maj'], [0, 'maj'], [3, 'maj'], [4, 'maj'],
    [0, 'maj'], [4, 'maj'], [5, 'min'], [2, 'min'],
    [3, 'maj'], [0, 'maj'], [3, 'maj'], [4, 'maj'],
  ], 4),
};

const JESU_LINE = line([
  [G4, 1], [A4, 1], [B4, 1], [D5, 1], [C5, 1], [B4, 1], [D5, 1], [C5, 1], [B4, 1],
  [A4, 1], [B4, 1], [C5, 1], [B4, 1], [A4, 1], [G4, 1], [Fs4, 1], [G4, 1], [A4, 1],
  [D4, 1], [G4, 1], [A4, 1], [B4, 1], [C5, 1], [D5, 1], [E5, 1], [D5, 1], [C5, 1],
  [B4, 1], [D5, 1], [C5, 1], [B4, 1], [A4, 1], [G4, 1], [Fs4, 1], [G4, 1], [G4, 1],
]);

/** Continuous quavers, and the last phrase adds a second voice under them. */
export const JESU_JOY: Tune = {
  id: 'jesu-joy',
  title: 'Jesu, Joy of Man’s Desiring',
  composer: 'Bach',
  origin: 'classic',
  difficulty: 5,
  teaches: 'A line that never stops, with a voice underneath it.',
  bpm: 176,
  beatsPerBar: 9,
  root: G4,
  scaleId: 'mixolydian',
  pass: 0.75,
  melody: merge(
    JESU_LINE,
    shift(JESU_LINE, 36),
    // Only the reprise is harmonised: the tune has to be known first.
    harmonise(shift(JESU_LINE, 36).filter((n) => n.beat % 3 === 0), -4),
  ),
  chords: bars([
    [0, 'maj'], [4, 'maj'], [3, 'maj'], [0, 'maj'],
    [0, 'maj'], [4, 'maj'], [3, 'maj'], [0, 'maj'],
  ], 9),
};

/** Ordered by difficulty: this is also the unlock chain. */
export const CLASSICS: Tune[] = [
  ODE_TO_JOY, TWINKLE, AMAZING_GRACE, SCARBOROUGH_FAIR, GREENSLEEVES,
  FUR_ELISE, LONDONDERRY_AIR, MINUET_IN_G, GYMNOPEDIE, CANON_IN_D, JESU_JOY,
];
