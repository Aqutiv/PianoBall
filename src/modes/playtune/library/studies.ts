import type { Tune } from '../chart';
import { line, progression } from './notation';
import { repeatRhythm } from './rhythmNotation';

/**
 * Ground and Off the Beat remain accompaniment studies. Their backing note
 * charts live in chordcurve.ts; these definitions retain their melodies and
 * harmony. Three Ways Home is archived below and is not an active course entry.
 */

// Written in C so every shape is white keys. There is no plain major scale in
// the app, so it is mixolydian with the leading note declared — the same thing
// every major-key tune in the library does.
const B3 = 59;
const C4 = 60, D4 = 62, E4 = 64, F4 = 65, G4 = 67, A4 = 69;
const LEADING = [11];

/** Two chords, one to a bar, and that is the whole of it. */
export const CHORD_GROUND: Tune = {
  id: 'chord-ground',
  title: 'Ground',
  composer: 'PianoBall',
  origin: 'original',
  difficulty: 1,
  teaches: 'Two chords, one to a bar.',
  bpm: 72,
  beatsPerBar: 4,
  root: C4,
  scaleId: 'mixolydian',
  accompaniment: 'march',
  // Two soft bass-drum anchors support the player's root and fifth; the hat
  // leaves a quiet quarter-note reference between those attacks.
  rhythm: repeatRhythm({
    beatsPerBar: 4, endBeat: 32,
    hits: [
      { beat: 0, voice: 'kick', gain: 0.21 },
      { beat: 2, voice: 'kick', gain: 0.17 },
      { beat: 0, voice: 'hat', gain: 0.07 },
      { beat: 1, voice: 'hat', gain: 0.055 },
      { beat: 2, voice: 'hat', gain: 0.065 },
      { beat: 3, voice: 'hat', gain: 0.055 },
    ],
  }),
  borrows: LEADING,
  pass: 0.55,
  melody: line([
    [E4, 2], [G4, 2],
    [G4, 4],
    [D4, 2], [B3, 2],
    [D4, 4],
    [E4, 2], [G4, 2],
    [F4, 2], [D4, 2],
    [B3, 2], [D4, 2],
    [C4, 4],
  ]),
  // Six bars of strict alternation and then two of home. Nothing here repeats
  // a chord from one bar into the next except that ending, because
  // `mergedChords` would run the two together and the tune would stop being
  // one chord to a bar in the one place it says it is.
  chords: progression([
    [0, 'maj', 4], [4, 'maj', 4],
    [0, 'maj', 4], [4, 'maj', 4],
    [0, 'maj', 4], [4, 'maj', 4],
    [0, 'maj', 4], [0, 'maj', 4],
  ]),
};

/** A third shape, and the first time the harmony moves inside a bar. */
export const CHORD_THREE: Tune = {
  id: 'chord-three',
  title: 'Three Ways Home',
  composer: 'PianoBall',
  origin: 'original',
  difficulty: 1,
  teaches: 'A third shape, and two chords to a bar.',
  bpm: 80,
  beatsPerBar: 4,
  root: C4,
  scaleId: 'mixolydian',
  accompaniment: 'march',
  borrows: LEADING,
  pass: 0.57,
  melody: line([
    [G4, 2], [E4, 2],
    [F4, 2], [A4, 2],
    [G4, 2], [E4, 2],
    [D4, 2], [B3, 2],
    [C4, 2], [A4, 2], [G4, 2], [B3, 2],
    [A4, 2], [D4, 2],
    [E4, 2], [C4, 2],
  ]),
  // Whole bars first, then the same three shapes arriving twice as often, so
  // the faster half is something already known coming sooner rather than new.
  chords: progression([
    [0, 'maj', 4],
    [3, 'maj', 4],
    [0, 'maj', 4],
    [4, 'maj', 4],
    [0, 'maj', 2], [3, 'maj', 2],
    [0, 'maj', 2], [4, 'maj', 2],
    [3, 'maj', 2], [4, 'maj', 2],
    [0, 'maj', 4],
  ]),
};

/**
 * The first comp pattern: the chord is struck where the harmony is not.
 *
 * Everything before this puts the chord down at the moment it changes, so the
 * two rhythms are the same rhythm and there is no reason to notice there are
 * two. A march strikes on the second and fourth beats while the harmony moves
 * on the bar line, and every pattern after this one depends on that coming
 * apart. So the harmony here is one chord a bar and utterly plain: the rhythm
 * is the only thing being asked for.
 */
export const CHORD_MARCH: Tune = {
  id: 'chord-march',
  title: 'Off the Beat',
  composer: 'PianoBall',
  origin: 'original',
  difficulty: 2,
  teaches: 'The strike is not the chord change.',
  bpm: 80,
  beatsPerBar: 4,
  root: C4,
  scaleId: 'mixolydian',
  accompaniment: 'march',
  rhythm: repeatRhythm({
    beatsPerBar: 4, endBeat: 32,
    hits: [
      { beat: 0, voice: 'kick', gain: 0.23 },
      { beat: 2, voice: 'kick', gain: 0.19 },
      { beat: 1, voice: 'rim', gain: 0.17 },
      { beat: 3, voice: 'rim', gain: 0.19 },
      ...Array.from({ length: 4 }, (_, beat) => ({
        beat, voice: 'hat' as const, gain: 0.065,
      })),
    ],
  }),
  borrows: LEADING,
  pass: 0.57,
  melody: line([
    [C4, 2], [E4, 2],
    [F4, 2], [A4, 2],
    [G4, 2], [D4, 2],
    [E4, 2], [C4, 2],
    [C4, 2], [E4, 2],
    [A4, 2], [F4, 2],
    [D4, 2], [B3, 2],
    [C4, 4],
  ]),
  chords: progression([
    [0, 'maj', 4], [3, 'maj', 4],
    [4, 'maj', 4], [0, 'maj', 4],
    [3, 'maj', 4], [0, 'maj', 4],
    [4, 'maj', 4], [0, 'maj', 4],
  ]),
};

export const STUDIES: Tune[] = [CHORD_GROUND, CHORD_MARCH];
