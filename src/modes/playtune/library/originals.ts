import type { Tune } from '../chart';
import { line, progression, merge, harmonise, shift } from './notation';

// Middle C is 60. These are written where they read best; `fitToRange` moves
// each chart by whole octaves onto whatever keyboard is actually plugged in.
const D4 = 62, E4 = 64, F4 = 65, G4 = 67, A4 = 69, Bb4 = 70, C5 = 72;
const D5 = 74, E5 = 76, F5 = 77, A5 = 81;

/**
 * Three notes, four square bars, nothing syncopated.
 *
 * The first tune has one job: teach that the aura lands on the beat and the key
 * goes down when it arrives. Everything else is deliberately absent — which is
 * also why the bed plays a chord on every single beat here and nowhere else.
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
  accompaniment: 'pulse',
  // The second degree. A pentatonic melody leaves it out; the harmony under it
  // cannot, because the A minor chord that answers the F major needs it.
  borrows: [2],
  pass: 0.55,
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
  // Every held note is where the harmony moves, so the long bars are the ones
  // that pull the tune into its next phrase rather than the ones where it waits.
  chords: progression([
    [0, 'min', 4],
    [0, 'min', 2], [1, 'maj', 2],
    [1, 'maj', 4],
    [1, 'maj', 2], [3, 'min', 2],
    [3, 'min', 4],
    [3, 'min', 2], [1, 'maj', 2],
    [0, 'min', 4],
    [0, 'min', 4],
  ]),
};

/**
 * Long notes on a five-note scale, where the only difficulty is patience.
 *
 * Everything before this rewards hitting; this one rewards holding, so the
 * sustain tail has somewhere to be learned before a tune depends on it. The bed
 * is the one place in the library that stays a slow swell: a chord comping
 * along in time would be counting the note for the player.
 *
 * The only original that names an instrument, and it names one for the same
 * reason: glass still rings while the key is down. A mallet voice would decay
 * to nothing inside the first bar and the tune would be teaching a hold the
 * player cannot hear themselves holding.
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
  accompaniment: 'sustain',
  voiceId: 'glass',
  bedVoiceId: 'glass-pad',
  // Kumoi is D E F A B: no C at all. The harmony wants one — it is what makes
  // an F major an F major and a D minor seventh a seventh — and nothing else
  // from outside the scale is allowed in.
  borrows: [10],
  pass: 0.6,
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
  chords: progression([
    [0, 'min', 4], [0, 'min', 4],
    [2, 'maj', 4], [2, 'maj', 4],
    [1, 'sus4', 4], [1, 'sus4', 4],
    [0, 'min7', 4], [0, 'min7', 4],
    [3, 'min', 4], [2, 'maj', 4],
    [1, 'sus4', 4], [1, 'sus4', 4],
    [0, 'min', 4], [3, 'min', 4],
    [0, 'min', 4], [0, 'min', 4],
  ]),
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

/** Eight bars of harmony, played twice: once alone, once in thirds. */
const TWO_HANDS_CHORDS = progression([
  [0, 'min', 4],
  [3, 'min', 2], [6, 'maj', 2],
  [5, 'maj', 2], [2, 'maj', 2],
  [3, 'min', 2], [0, 'min', 2],
  [0, 'min', 2], [5, 'maj', 2],
  [5, 'maj', 2], [3, 'min', 2],
  [4, 'min', 2], [2, 'maj', 2],
  [4, 'min', 2], [0, 'min', 2],
]);

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
  accompaniment: 'arpeggio',
  pass: 0.65,
  melody: merge(
    TUNE_A,
    TUNE_B,
    // Third time through, a third below rides along with it.
    shift(TUNE_A, 32),
    harmonise(shift(TUNE_A, 32), -3),
    shift(TUNE_B, 32),
    harmonise(shift(TUNE_B, 32), -4),
  ),
  chords: [...TWO_HANDS_CHORDS, ...shift(TWO_HANDS_CHORDS, 32)],
};

export const ORIGINALS: Tune[] = [FIRST_LIGHT, DRIFT, TWO_HANDS];
