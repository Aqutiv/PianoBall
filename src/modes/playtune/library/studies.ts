import type { Tune } from '../chart';
import { line, progression } from './notation';

/**
 * The three tunes the chord curve opens on.
 *
 * They are here rather than in `originals.ts` because they are not the same
 * kind of thing. The originals are tunes with a mechanic to teach; these are
 * exercises with a tune attached — the melody exists so the game has something
 * to play back while the player takes the chords, and it is deliberately plain.
 * They never appear in the melody song list.
 *
 * Nothing already in the library could open the curve. Ode to Joy has the
 * simplest harmony there is and still changes chord twice a bar; Canon in D is
 * slower but has five shapes; Drift is slower still but opens with a sus4 and a
 * seventh. There was no tune anywhere that was two triads on whole bars, which
 * is where learning to play chords has to start.
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
  // What the game plays underneath while the player takes the chords: a bass
  // note on the strong beats, and nothing else.
  accompaniment: 'march',
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

export const STUDIES: Tune[] = [CHORD_GROUND, CHORD_THREE, CHORD_MARCH];
