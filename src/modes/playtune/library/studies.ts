import type { Tune } from '../chart';
import { line, progression, type Step } from './notation';
import { GROUND_BACKING, OFFBEAT_BACKING } from './originalBacking';

/**
 * Ground and Off the Beat remain accompaniment studies. Their backing note
 * charts live in chordcurve.ts; these definitions retain their melodies and
 * harmony. Three Ways Home is archived below and is not an active course entry.
 */

// Written in C major so every shape is white keys.
const B3 = 59;
const C4 = 60, D4 = 62, E4 = 64, F4 = 65, G4 = 67, A4 = 69;
// These annotations shape the automatic tune in Backing mode, while the
// player's target onsets and hold lengths remain the authored line.
function studyMelody(steps: readonly Step[]) {
  return line(steps).map(n => ({ ...n,
    gain: n.beat >= 28 ? 0.036 : n.beat >= 16 ? 0.045 : 0.04,
    soundingLen: n.len * (n.beat >= 28 ? 1 : 0.92),
  }));
}

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
  scaleId: 'ionian',
  // What the game plays underneath while the player takes the chords: a bass
  // note on the strong beats, and nothing else.
  accompaniment: 'march',
  pass: 0.55,
  melody: studyMelody([
    [E4, 2], [G4, 2],
    [G4, 4],
    [D4, 2], [B3, 2],
    [D4, 4],
    [E4, 2], [G4, 2],
    [F4, 2], [D4, 2],
    [B3, 2], [D4, 2],
    [C4, 4],
  ]),
  // A clear tonic/dominant sentence follows the tune. Repeated harmony is
  // allowed: the authored Backing chart still supplies each bar's bass attacks.
  chords: progression([
    [0, 'maj', 4], [0, 'maj', 4],
    [4, 'dom7', 4], [4, 'dom7', 4],
    [0, 'maj', 4], [4, 'dom7', 4],
    [4, 'dom7', 4], [0, 'maj', 4],
  ]),
  backingNotes: GROUND_BACKING,
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
  scaleId: 'ionian',
  accompaniment: 'march',
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
  scaleId: 'ionian',
  accompaniment: 'march',
  pass: 0.57,
  melody: studyMelody([
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
    [0, 'maj', 4], [3, 'maj', 4],
    [4, 'maj', 4], [0, 'maj', 4],
  ]),
  backingNotes: OFFBEAT_BACKING,
};

export const STUDIES: Tune[] = [CHORD_GROUND, CHORD_MARCH];
