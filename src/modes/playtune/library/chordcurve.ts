import { FRERE_JACQUES, DRUNKEN_SAILOR, CAN_CAN, BLUE_DANUBE, THE_ENTERTAINER } from './familiar';
import type { Tune } from '../chart';
import type { ChordRole } from '../chords';
import {
  ODE_TO_JOY, TWINKLE, AMAZING_GRACE, SCARBOROUGH_FAIR, GREENSLEEVES,
  FUR_ELISE, LONDONDERRY_AIR, MINUET_IN_G, GYMNOPEDIE, CANON_IN_D, JESU_JOY,
} from './classics';
import { HOPSCOTCH } from './hopscotch';
import { YANKEE_DOODLE, YANKEE_DOODLE_BACKING, IRISH_WASHERWOMAN, IRISH_WASHERWOMAN_BACKING } from './marchingJig';
import { LA_BAMBA, LA_BAMBA_BACKING } from './laBamba';
import { CHORD_GROUND, CHORD_MARCH } from './studies';
import { figure, harmonicBass } from './backingNotation';

export interface ChordEntry { tune: Tune; role: ChordRole }
const pass = [0, 0.55, 0.60, 0.63, 0.67, 0.70];
const close = (tune: Tune) => tune.chords.at(-1)!.beat;
function entry(tune: Tune, difficulty: ChordRole['difficulty'], teaches: string,
  notes: ChordRole['notes'], melodyVoiceId = 'bed-felt-piano', sustained = false): ChordEntry {
  return { tune, role: { difficulty, teaches, pass: pass[difficulty], notes,
    keyVoicing: sustained ? 'bed' : 'lead', keysVoiceId: sustained ? 'glass-pad' : 'felt-piano', melodyVoiceId } };
}

/** Authored accompaniment course. The wire role remains `chords` for native v1. */
export const CHORD_CURVE: ChordEntry[] = [
  entry(FRERE_JACQUES, 1, 'Bass on the bar line: hear C and G support the melody.',
    figure(FRERE_JACQUES, [[0, 'bass', 4]]), 'bed-music-box'),
  entry(ODE_TO_JOY, 1, 'Follow the harmony in the bass, including changes inside the bar.',
    harmonicBass(ODE_TO_JOY)),
  entry(CHORD_GROUND, 1, 'Root and fifth: two bass notes to a bar.',
    figure(CHORD_GROUND, [[0, 'bass', 2], [2, 'fifth', 2]])),
  entry(TWINKLE, 2, 'A bass note, then a two-note chord answer.',
    figure(TWINKLE, [[0, 'bass', 0.9], [1, 'dyad', 0.9], [2, 'bass', 0.9], [3, 'dyad', 0.9]], { cadence: close(TWINKLE) }), 'bed-music-box'),
  entry(CHORD_MARCH, 2, 'Bass on one and three; chord answers on two and four.',
    figure(CHORD_MARCH, [[0, 'bass', 0.8], [1, 'dyad', 0.8], [2, 'bass', 0.8], [3, 'dyad', 0.8]], { cadence: close(CHORD_MARCH) })),
  entry(YANKEE_DOODLE, 2, 'Alternate marching bass notes, then settle into the final chord.',
    YANKEE_DOODLE_BACKING),
  entry(HOPSCOTCH, 2, 'Bass on one, a held chord on three: bounce through Dorian harmony.',
    HOPSCOTCH.backingNotes!, 'bed-electric-piano'),
  entry(DRUNKEN_SAILOR, 2, 'Keep the bass-and-chord march through D minor and C major.',
    figure(DRUNKEN_SAILOR, [[0, 'bass', 0.85], [1, 'dyad', 0.8], [2, 'bass', 0.85], [3, 'dyad', 0.8]], { cadence: close(DRUNKEN_SAILOR) }), 'nylon-guitar'),
  entry(CANON_IN_D, 3, 'Learn the repeating bass ground, with broken-chord answers.',
    figure(CANON_IN_D, [[0, 'bass', 0.9], [1, 'third', 0.9], [2, 'top', 0.9], [3, 'third', 0.9]], { cadence: close(CANON_IN_D) }), 'bed-harp'),
  entry(AMAZING_GRACE, 3, 'Bass on one, gentle chord answers in three, and a pickup.',
    figure(AMAZING_GRACE, [[0, 'bass', 0.9], [1, 'dyad', 0.9], [2, 'dyad', 0.9]], { cadence: close(AMAZING_GRACE) }), 'bed-choir'),
  entry(SCARBOROUGH_FAIR, 3, 'A flowing three-note figure following the changing harmony.',
    figure(SCARBOROUGH_FAIR, [[0, 'bass', 0.9], [1, 'third', 0.9], [2, 'top', 0.9]], { cadence: close(SCARBOROUGH_FAIR) }), 'nylon-guitar'),
  entry(LA_BAMBA, 3, 'Keep the plucked bass and chord answers steady beneath La Bamba’s short pickups.',
    LA_BAMBA_BACKING),
  entry(GYMNOPEDIE, 3, 'Bass on one; a seventh shell on two, held through three.',
    figure(GYMNOPEDIE, [[0, 'bass', 0.9], [1, 'shell', 2]])),
  entry(LONDONDERRY_AIR, 4, 'Flowing broken chords with breathing space at the cadence.',
    figure(LONDONDERRY_AIR, [[0, 'bass', 0.9], [1, 'third', 0.9], [2, 'top', 0.9], [3, 'third', 0.75]],
      { rests: [[close(LONDONDERRY_AIR) - 1, close(LONDONDERRY_AIR)]], cadence: close(LONDONDERRY_AIR) }), 'bed-harp'),
  entry(GREENSLEEVES, 4, 'Two groups of three: let the bass anchor each lilting group.',
    figure(GREENSLEEVES, [[0, 'bass', 0.9], [1, 'third', 0.9], [2, 'top', 0.9], [3, 'bass', 0.9], [4, 'third', 0.9], [5, 'top', 0.9]], { cadence: close(GREENSLEEVES) }), 'bed-harp'),
  entry(IRISH_WASHERWOMAN, 4, 'Keep two pulses in each jig bar, with picked notes and small chord answers.',
    IRISH_WASHERWOMAN_BACKING),
  entry(CAN_CAN, 4, 'Short bass-and-chord answers keep the dance moving.',
    figure(CAN_CAN, [[0, 'bass', 0.65], [1, 'dyad', 0.55], [2, 'fifth', 0.65], [3, 'dyad', 0.55]], { cadence: close(CAN_CAN) })),
  entry(BLUE_DANUBE, 4, 'Bass, chord, chord: a waltz with compact inversions and sevenths.',
    figure(BLUE_DANUBE, [[0, 'bass', 0.8], [1, 'shell', 0.7], [2, 'shell', 0.7]], { cadence: close(BLUE_DANUBE) })),
  entry(FUR_ELISE, 5, 'Broken-chord gestures: leave space for the melody to speak.',
    figure(FUR_ELISE, [[0, 'bass', 0.9], [1, 'third', 0.9], [2, 'top', 0.9]],
      { rests: [[0, 8], [23, 32]], cadence: close(FUR_ELISE) })),
  entry(MINUET_IN_G, 5, 'A moving bass line with occasional two-note support.',
    figure(MINUET_IN_G, [[0, 'bass', 0.9], [1, 'third', 0.9], [2, 'dyad', 0.8]], { cadence: close(MINUET_IN_G) }), 'bed-harp'),
  entry(JESU_JOY, 5, 'Anchor three compound pulses with bass and economical chord answers.',
    figure(JESU_JOY, [[0, 'bass', 1.8], [2, 'dyad', 0.8], [3, 'bass', 1.8], [5, 'dyad', 0.8], [6, 'bass', 1.8], [8, 'dyad', 0.8]], { cadence: close(JESU_JOY) }), 'bed-choir'),
  entry(THE_ENTERTAINER, 5, 'Keep a steady ragtime bass and chord beneath the syncopated melody.',
    figure(THE_ENTERTAINER, [[0, 'bass', 0.8], [1, 'shell', 0.65], [2, 'fifth', 0.8], [3, 'shell', 0.65]], { cadence: close(THE_ENTERTAINER) })),
];

export const CHORD_TUNES: Tune[] = CHORD_CURVE.map(e => e.tune);
export const CHORD_ORDER: string[] = CHORD_CURVE.map(e => e.tune.id);
const BY_ID = new Map(CHORD_CURVE.map(e => [e.tune.id, e]));
export function findChordEntry(id: string): ChordEntry | undefined { return BY_ID.get(id); }
