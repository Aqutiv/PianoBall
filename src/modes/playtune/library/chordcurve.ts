import type { Tune } from '../chart';
import type { ChordRole } from '../chords';
import {
  ODE_TO_JOY, TWINKLE, AMAZING_GRACE, SCARBOROUGH_FAIR, GREENSLEEVES,
  FUR_ELISE, LONDONDERRY_AIR, MINUET_IN_G, GYMNOPEDIE, CANON_IN_D, JESU_JOY,
} from './classics';
import { FIRST_LIGHT, DRIFT, TWO_HANDS } from './originals';
import { CHORD_GROUND, CHORD_THREE, CHORD_MARCH } from './studies';

export interface ChordEntry {
  tune: Tune;
  role: ChordRole;
}

/**
 * The chord curve, in the order it is unlocked.
 *
 * Its own order, because chord difficulty and melody difficulty come apart
 * badly. Canon in D is the hardest melody in the game and one of the easiest
 * progressions there is to play — an eight-bar ground, one triad to a bar — so
 * it sits seventh here and last in the melody chain. Gymnopédie goes the other
 * way: its melody is nearly nothing and its harmony is the only four-note
 * chords in the library.
 *
 * The curve climbs two ladders and they cross, which is deliberate and should
 * survive editing. Positions 4 to 14 climb the *strike rhythm* — block chord,
 * march, pulse, waltz, compound — on tunes whose harmony moves slowly enough to
 * afford it. Positions 15 to 17 drop back to block chords and climb the *rate
 * of change* instead, down to Jesu, Joy's third of a second. Asking for a comp
 * pattern on top of a harmony moving that fast would not be harder, it would be
 * unplayable.
 *
 * Nothing here uses `broken` or `arpeggio`: see `PLAYABLE_PATTERNS`. The five
 * tunes written with one, and Jesu, Joy's `compound` at 176 bpm, name something
 * else instead.
 */
export const CHORD_CURVE: ChordEntry[] = [
  {
    tune: CHORD_GROUND,
    role: {
      difficulty: 1, pass: 0.55, pattern: 'sustain',
      teaches: 'Two chords, one to a bar. Put it down and leave it there.',
    },
  },
  {
    tune: CHORD_THREE,
    role: {
      difficulty: 1, pass: 0.57, pattern: 'sustain',
      teaches: 'A third shape, and two chords to a bar.',
    },
  },
  {
    // The slowest harmony in the library, and the tune that grades holding.
    // Its two min7 bars are voiced as shells: three notes, so the first
    // seventh anyone meets is still a shape the hand already knows.
    tune: DRIFT,
    role: {
      difficulty: 2, pass: 0.57, pattern: 'sustain', voicing: 'shell',
      teaches: 'Four beats a chord, and a seventh among them.',
      keysVoiceId: 'glass-pad', melodyVoiceId: 'bed-music-box',
    },
  },
  {
    tune: CHORD_MARCH,
    role: {
      difficulty: 2, pass: 0.59, pattern: 'march',
      teaches: 'The strike is not the chord change.',
    },
  },
  {
    tune: ODE_TO_JOY,
    role: {
      difficulty: 2, pass: 0.6, pattern: 'march',
      teaches: 'The same march on two chords, with the cadences moving mid-bar.',
      keysVoiceId: 'strings', melodyVoiceId: 'bed-felt-piano',
    },
  },
  {
    tune: TWINKLE,
    role: {
      difficulty: 2, pass: 0.6, pattern: 'march',
      teaches: 'Three chords changing every half bar, and no rest in it.',
      keysVoiceId: 'warm', melodyVoiceId: 'bed-music-box',
    },
  },
  {
    // Melody difficulty 5, chord position 7: the biggest inversion there is.
    tune: CANON_IN_D,
    role: {
      difficulty: 3, pass: 0.63, pattern: 'march',
      teaches: 'An eight-bar ground, learned once and played twice.',
      keysVoiceId: 'strings', melodyVoiceId: 'bed-harp',
    },
  },
  {
    tune: LONDONDERRY_AIR,
    role: {
      difficulty: 3, pass: 0.63, pattern: 'march',
      teaches: 'A pickup chord that starts before the bar does.',
      keysVoiceId: 'bed-choir', melodyVoiceId: 'bed-harp',
    },
  },
  {
    tune: FIRST_LIGHT,
    role: {
      difficulty: 3, pass: 0.63, pattern: 'pulse',
      teaches: 'A chord on every beat, on only three shapes.',
    },
  },
  {
    tune: TWO_HANDS,
    role: {
      difficulty: 3, pass: 0.65, pattern: 'pulse',
      teaches: 'The same pulse on six shapes — the widest vocabulary here.',
    },
  },
  {
    tune: AMAZING_GRACE,
    role: {
      difficulty: 4, pass: 0.65, pattern: 'waltz',
      teaches: 'Three-four, a pickup, and cadence chords lasting one beat.',
      keysVoiceId: 'bed-organ', melodyVoiceId: 'bed-choir',
    },
  },
  {
    // The four-note chords, and three whole seconds to find each one. Slow
    // enough that the shape is the only new thing.
    tune: GYMNOPEDIE,
    role: {
      difficulty: 4, pass: 0.65, pattern: 'waltz',
      teaches: 'Sevenths: four notes at once, three seconds apart.',
      keysVoiceId: 'warm', melodyVoiceId: 'bed-felt-piano',
    },
  },
  {
    tune: SCARBOROUGH_FAIR,
    role: {
      difficulty: 4, pass: 0.67, pattern: 'waltz',
      teaches: 'Five shapes moving on the half bar of a waltz.',
      keysVoiceId: 'bed-choir', melodyVoiceId: 'nylon-guitar',
    },
  },
  {
    tune: GREENSLEEVES,
    role: {
      difficulty: 4, pass: 0.67, pattern: 'compound',
      teaches: 'Six-eight, and one finger turning the same chord major.',
      keysVoiceId: 'warm', melodyVoiceId: 'bed-harp',
    },
  },
  {
    // Back to block chords from here: these three climb the rate of change.
    tune: FUR_ELISE,
    role: {
      difficulty: 5, pass: 0.67, pattern: 'sustain',
      teaches: 'Blocks at a hundred and sixty-eight.',
      keysVoiceId: 'strings', melodyVoiceId: 'bed-felt-piano',
    },
  },
  {
    tune: MINUET_IN_G,
    role: {
      difficulty: 5, pass: 0.7, pattern: 'sustain',
      teaches: 'The quickest harmony in the library: three chords, two thirds of a second apart.',
      keysVoiceId: 'strings', melodyVoiceId: 'bed-harp',
    },
  },
  {
    tune: JESU_JOY,
    role: {
      difficulty: 5, pass: 0.7, pattern: 'sustain',
      teaches: 'Twenty-odd changes at a hundred and seventy-six, and then again.',
      keysVoiceId: 'bed-organ', melodyVoiceId: 'bed-choir',
    },
  },
];

export const CHORD_TUNES: Tune[] = CHORD_CURVE.map((e) => e.tune);
export const CHORD_ORDER: string[] = CHORD_CURVE.map((e) => e.tune.id);

const BY_ID = new Map(CHORD_CURVE.map((e) => [e.tune.id, e]));

export function findChordEntry(id: string): ChordEntry | undefined { return BY_ID.get(id); }
