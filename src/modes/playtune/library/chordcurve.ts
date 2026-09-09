import { LE_TEMPS_DES_CERISES, HAVA_NAGILA, CERISES_BACKING, HAVA_BACKING } from './accordionTunes';
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
import { ELISE_TARGETS, GYMNO_TARGETS, MINUET_TARGETS, danubeTargets, jesuTargets } from './playableClassics';

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
  entry(FRERE_JACQUES, 1, 'Follow C and G in the bass, including the final return home.',
    harmonicBass(FRERE_JACQUES), 'bed-music-box'),
  entry(ODE_TO_JOY, 1, 'Follow the harmony in the bass, including changes inside the bar.',
    harmonicBass(ODE_TO_JOY)),
  entry(CHORD_GROUND, 1, 'Root and fifth: two bass notes to a bar.',
    figure(CHORD_GROUND, [[0, 'bass', 2], [2, 'fifth', 2]])),
  entry(TWINKLE, 2, 'A bass note, then a two-note chord answer.',
    figure(TWINKLE, [[0, 'bass', 0.9], [1, 'dyad', 0.9], [2, 'bass', 0.9], [3, 'dyad', 0.9]], { cadence: close(TWINKLE) })),
  entry(CHORD_MARCH, 2, 'Bass on one and three; chord answers on two and four.',
    figure(CHORD_MARCH, [[0, 'bass', 0.8], [1, 'dyad', 0.8], [2, 'bass', 0.8], [3, 'dyad', 0.8]], { cadence: close(CHORD_MARCH) })),
  entry(YANKEE_DOODLE, 2, 'Alternate marching bass notes, then settle into the final chord.',
    YANKEE_DOODLE_BACKING),
  entry(HOPSCOTCH, 2, 'Bass on one, a held chord on three: bounce through Dorian harmony.',
    HOPSCOTCH.backingNotes!, 'bed-electric-piano'),
  entry(DRUNKEN_SAILOR, 2, 'Keep the bass-and-chord march through D minor and C major.',
    figure(DRUNKEN_SAILOR, [[0, 'bass', 0.85], [1, 'dyad', 0.8], [2, 'bass', 0.85], [3, 'dyad', 0.8]], { cadence: close(DRUNKEN_SAILOR) }), 'nylon-guitar'),
  entry(CANON_IN_D, 3, 'Learn the repeating bass ground, with broken-chord answers.',
    figure(CANON_IN_D, [[0, 'bass', 0.45], [0.5, 'third', 0.45], [1, 'bass', 0.45], [1.5, 'third', 0.45],
      [2, 'bass', 0.45], [2.5, 'third', 0.45], [3, 'bass', 0.45], [3.5, 'third', 0.45]], { cadence: close(CANON_IN_D) })),
  entry(AMAZING_GRACE, 3, 'Bass on one, gentle chord answers in three, and a pickup.',
    figure(AMAZING_GRACE, [[0, 'bass', 0.9], [1, 'dyad', 0.9], [2, 'dyad', 0.9]], { cadence: close(AMAZING_GRACE) })),
  entry(SCARBOROUGH_FAIR, 3, 'A flowing three-note figure following the changing harmony.',
    figure(SCARBOROUGH_FAIR, [[0, 'bass', 0.9], [1, 'third', 0.9], [2, 'top', 0.9]], { cadence: close(SCARBOROUGH_FAIR) })),
  entry(LA_BAMBA, 3, 'Keep the plucked bass and chord answers steady beneath La Bamba’s short pickups.',
    LA_BAMBA_BACKING),
  { tune: LE_TEMPS_DES_CERISES, role: {
    difficulty: 3, pass: .63, teaches: 'Keep bass and two light chord answers beneath the accordion melody.',
    notes: CERISES_BACKING, keyVoicing: 'lead', keysVoiceId: 'accordion', melodyVoiceId: 'bed-accordion',
  } },
  { tune: HAVA_NAGILA, role: {
    difficulty: 3, pass: .63, teaches: 'Alternate plucked bass and chord answers through three contrasting sections.',
    notes: HAVA_BACKING, keyVoicing: 'bed', keysVoiceId: 'nylon-guitar', melodyVoiceId: 'bed-accordion',
  } },
  entry(GYMNOPEDIE, 3, 'Bass on one; the written upper chord on two, held through three.',
    GYMNO_TARGETS),
  entry(LONDONDERRY_AIR, 4, 'Flowing broken chords with breathing space at the cadence.',
    figure(LONDONDERRY_AIR, [[0, 'bass', 0.9], [1, 'third', 0.9], [2, 'top', 0.9], [3, 'third', 0.75]],
      { rests: [[close(LONDONDERRY_AIR) - 1, close(LONDONDERRY_AIR)]], cadence: close(LONDONDERRY_AIR) })),
  entry(GREENSLEEVES, 4, 'Two groups of three: let the bass anchor each lilting group.',
    figure(GREENSLEEVES, [[0, 'bass', 0.9], [1, 'third', 0.9], [2, 'top', 0.9], [3, 'bass', 0.9], [4, 'third', 0.9], [5, 'top', 0.9]], { cadence: close(GREENSLEEVES) })),
  entry(IRISH_WASHERWOMAN, 4, 'Keep two pulses in each jig bar, with picked notes and small chord answers.',
    IRISH_WASHERWOMAN_BACKING),
  entry(CAN_CAN, 4, 'Short bass-and-chord answers keep the dance moving.',
    figure(CAN_CAN, [[0, 'bass', 0.65], [1, 'dyad', 0.55], [2, 'fifth', 0.65], [3, 'dyad', 0.55]], { cadence: close(CAN_CAN) })),
  entry(BLUE_DANUBE, 4, 'Bass, chord, chord: a waltz with compact inversions and sevenths.',
    danubeTargets(BLUE_DANUBE)),
  entry(FUR_ELISE, 5, 'Broken-chord gestures: leave space for the melody to speak.',
    ELISE_TARGETS),
  entry(MINUET_IN_G, 5, 'A moving bass line with occasional two-note support.',
    MINUET_TARGETS),
  entry(JESU_JOY, 5, 'Anchor three compound pulses with bass and economical chord answers.',
    jesuTargets(JESU_JOY)),
  entry(THE_ENTERTAINER, 5, 'Keep a steady ragtime bass and chord beneath the syncopated melody.',
    figure(THE_ENTERTAINER, [[0, 'bass', 0.8], [1, 'shell', 0.65], [2, 'fifth', 0.8], [3, 'shell', 0.65]], { cadence: close(THE_ENTERTAINER) })),
];

export const CHORD_TUNES: Tune[] = CHORD_CURVE.map(e => e.tune);
export const CHORD_ORDER: string[] = CHORD_CURVE.map(e => e.tune.id);
const BY_ID = new Map(CHORD_CURVE.map(e => [e.tune.id, e]));
export function findChordEntry(id: string): ChordEntry | undefined { return BY_ID.get(id); }
