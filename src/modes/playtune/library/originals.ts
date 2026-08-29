import type { Tune } from '../chart';
import { line, bars, merge, harmonise, shift } from './notation';

// Middle C is 60. These are written where they read best; `fitToRange` moves
// each chart by whole octaves onto whatever keyboard is actually plugged in.
const D4 = 62, E4 = 64, F4 = 65, G4 = 67, A4 = 69, Bb4 = 70, C5 = 72;
const D5 = 74, E5 = 76, F5 = 77, A5 = 81;

/**
 * Three notes, four square bars, nothing syncopated.
 *
 * The first tune has one job: teach that the aura lands on the beat and the key
 * goes down when it arrives. Everything else is deliberately absent.
 */
export const FIRST_LIGHT: Tune = {
  id: 'first-light',
  title: 'First Light',
  composer: 'PianoBall',
  origin: 'original',
  difficulty: 1,
  teaches: 'Three notes, one to a beat.',
  bpm: 76,
  beatsPerBar: 4,
  root: D4,
  scaleId: 'minorPentatonic',
  pass: 0.6,
  melody: line([
    [D4, 1], [F4, 1], [A4, 1], [F4, 1],
    [D4, 4],
    [F4, 1], [A4, 1], [C5, 1], [A4, 1],
    [F4, 4],
    [A4, 1], [C5, 1], [D5, 1], [C5, 1],
    [A4, 4],
    [F4, 1], [A4, 1], [F4, 1], [D4, 1],
    [D4, 4],
  ]),
  chords: bars([[0, 'min'], [0, 'min'], [1, 'maj'], [1, 'maj'],
    [3, 'min'], [3, 'min'], [0, 'min'], [0, 'min']], 4),
};

/**
 * Long notes on a five-note scale, where the only difficulty is patience.
 *
 * Everything before this rewards hitting; this one rewards holding, so the
 * sustain tail has somewhere to be learned before a tune depends on it.
 */
export const DRIFT: Tune = {
  id: 'drift',
  title: 'Drift',
  composer: 'PianoBall',
  origin: 'original',
  difficulty: 2,
  teaches: 'Hold the key for the whole tail.',
  bpm: 64,
  beatsPerBar: 4,
  root: D4,
  scaleId: 'kumoi',
  pass: 0.65,
  melody: line([
    [A4, 4], [E4, 4],
    [D5, 8],
    [F5, 4], [E5, 4],
    [D5, 8],
    [A5, 4], [F5, 4],
    [E5, 8],
    [D5, 4], [A4, 4],
    [D4, 8],
  ]),
  chords: bars([[0, 'min'], [0, 'min'], [2, 'maj'], [2, 'maj'],
    [1, 'sus4'], [1, 'sus4'], [3, 'min7'], [3, 'min7'],
    [4, 'maj'], [4, 'maj'], [2, 'maj'], [2, 'maj'],
    [1, 'sus4'], [1, 'sus4'], [0, 'min'], [0, 'min']], 4),
};

const TUNE_A = line([
  [D4, 1], [E4, 1], [F4, 2],
  [G4, 1], [F4, 1], [E4, 2],
  [D4, 1], [F4, 1], [A4, 2],
  [G4, 2], [F4, 2],
]);

const TUNE_B = line([
  [A4, 1], [Bb4, 1], [C5, 2],
  [D5, 1], [C5, 1], [Bb4, 2],
  [A4, 1], [G4, 1], [F4, 2],
  [E4, 2], [D4, 2],
], 16);

/**
 * The same eight bars twice: once alone, once in thirds.
 *
 * This is where two auras start arriving together. Splitting it this way means
 * the player already knows the tune by the time they have to play two of it.
 */
export const TWO_HANDS: Tune = {
  id: 'two-hands',
  title: 'Two Hands',
  composer: 'PianoBall',
  origin: 'original',
  difficulty: 4,
  teaches: 'Two notes at once, on a melody you already know.',
  bpm: 88,
  beatsPerBar: 4,
  root: D4,
  scaleId: 'aeolian',
  pass: 0.7,
  melody: merge(
    TUNE_A,
    TUNE_B,
    // Third time through, a third below rides along with it.
    shift(TUNE_A, 32),
    harmonise(shift(TUNE_A, 32), -3),
    shift(TUNE_B, 32),
    harmonise(shift(TUNE_B, 32), -4),
  ),
  chords: bars([
    [0, 'min'], [3, 'min'], [5, 'maj'], [0, 'min'],
    [2, 'maj'], [6, 'maj'], [4, 'min'], [0, 'min'],
    [0, 'min'], [3, 'min'], [5, 'maj'], [0, 'min'],
    [2, 'maj'], [6, 'maj'], [4, 'min'], [0, 'min'],
  ], 4),
};

export const ORIGINALS: Tune[] = [FIRST_LIGHT, DRIFT, TWO_HANDS];
