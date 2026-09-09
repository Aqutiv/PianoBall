import { melodyInstruments } from '../fixedPairings';
import { HOPSCOTCH } from './hopscotch';
import type { Tune } from '../chart';
import { melodyPerformance } from './performanceNotation';
import { line, progression, merge, shift } from './notation';
import { LIGHT_BACKING, DRIFT_BACKING, HANDS_BACKING } from './originalBacking';
import { repeatRhythm } from './rhythmNotation';

// Middle C is 60. These are written where they read best; `fitToRange` moves
// each chart by whole octaves onto whatever keyboard is actually plugged in.
const D4 = 62, E4 = 64, F4 = 65, G4 = 67, A4 = 69, Bb4 = 70, C5 = 72;
const D5 = 74, E5 = 76, F5 = 77, A5 = 81;

/**
 * A small three-note opening, answered by held notes across eight bars.
 *
 * The first tune has one job: teach that the aura lands on the beat and the key
 * goes down when it arrives. A quiet rim follows the same quarter-note pulse
 * as the bed, giving the held bars a clear beat without adding subdivisions.
 */
export const FIRST_LIGHT: Tune = {
  id: 'first-light',
  title: 'First Light',
  composer: 'PianoBall',
  origin: 'original',
  difficulty: 1,
  teaches: 'A small phrase, then a long held answer.',
  bpm: 76,
  beatsPerBar: 4,
  root: D4,
  scaleId: 'minorPentatonic',
  accompaniment: 'pulse',
  ...melodyInstruments('first-light'),
  rhythm: repeatRhythm({
    beatsPerBar: 4, endBeat: 32,
    hits: [
      { beat: 0, voice: 'rim', gain: 0.19 },
      { beat: 1, voice: 'rim', gain: 0.14 },
      { beat: 2, voice: 'rim', gain: 0.16 },
      { beat: 3, voice: 'rim', gain: 0.14 },
    ],
  }),
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
  // D and A can carry the move to F major. Keep F major through the held F;
  // the following A-minor phrase starts when that melody note has finished.
  chords: progression([
    [0, 'min', 4],
    [0, 'min', 2], [1, 'maj', 2],
    [1, 'maj', 4],
    [1, 'maj', 4],
    [3, 'min', 4],
    [3, 'min', 2], [1, 'maj', 2],
    [0, 'min', 4],
    [0, 'min', 4],
  ]),
  backingNotes: LIGHT_BACKING,
};

/**
 * Historical arrangement retained for source regression; Hopscotch replaces it
 * in both published courses and ORIGINALS.
 * Long notes on a five-note scale, where the only difficulty is patience.
 *
 * Everything before this rewards hitting; this one rewards holding, so the
 * sustain tail has somewhere to be learned before a tune depends on it. The bed
 * is the one place in the library that stays a slow swell: a chord comping
 * along in time would be counting the note for the player.
 *
 * Glass is chosen because it still rings while the key is down. A mallet voice would decay
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
  melody: melodyPerformance(line([
    [A4, 4], [E4, 4],
    [D5, 8],
    [F5, 4], [E5, 4],
    [D5, 8],
    [A5, 4], [F5, 4],
    [E5, 8],
    [D5, 4], [A4, 4],
    [D4, 8],
  ]), [[0, .72], [8, .84], [16, .9], [24, .78], [32, .94], [40, .82], [48, .74], [56, .66]], 1, .25),
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
  backingNotes: DRIFT_BACKING,
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

/** Eight bars of harmony, played twice: once alone, then with a second voice. */
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

// A written lower voice follows the harmony, using thirds, fourths and sixths.
// Fixed semitone offsets would introduce B natural/C#/F# and Db/Eb/Ab into
// this D-Aeolian sentence. Every pitch here is intentional and in the mode.
const LOWER_A = line([
  [57, 1], [60, 1], [62, 2],
  [58, 1], [62, 1], [60, 2],
  [58, 1], [62, 1], [65, 2],
  [62, 2], [62, 2],
], 32);
const LOWER_B = line([
  [65, 1], [67, 1], [65, 2],
  [70, 1], [65, 1], [67, 2],
  [64, 1], [64, 1], [60, 2],
  [60, 2], [57, 2],
], 48);

/**
 * The same eight bars twice: once alone, then with a composed lower voice.
 *
 * This is where two auras start arriving together. Splitting it this way means
 * the player already knows the tune when the second voice arrives.
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
  ...melodyInstruments('two-hands'),
  rhythm: repeatRhythm({
    beatsPerBar: 4, endBeat: 64,
    hits: [
      { beat: 0, voice: 'kick', gain: 0.24 },
      { beat: 2, voice: 'kick', gain: 0.20 },
      { beat: 1, voice: 'rim', gain: 0.16 },
      { beat: 3, voice: 'rim', gain: 0.18 },
      ...Array.from({ length: 8 }, (_, step) => ({
        beat: step / 2, voice: 'hat' as const, gain: step % 2 ? 0.055 : 0.09,
      })),
    ],
  }),
  pass: 0.65,
  melody: merge(
    TUNE_A,
    TUNE_B,
    shift(TUNE_A, 32), LOWER_A,
    shift(TUNE_B, 32), LOWER_B,
  ),
  chords: [...TWO_HANDS_CHORDS, ...shift(TWO_HANDS_CHORDS, 32)],
  backingNotes: HANDS_BACKING,
};

export const ORIGINALS: Tune[] = [FIRST_LIGHT, HOPSCOTCH, TWO_HANDS];
