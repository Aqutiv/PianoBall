import type { Tune } from '../chart';
import { line, progression, merge, harmonise, shift } from './notation';

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
 * scale's, because there is no plain ionian in the app's scale list — which is
 * why nearly all of them declare `borrows: [11]`. That is the leading note,
 * and it is what makes a dominant chord a dominant chord.
 *
 * The chords are written with `progression` rather than one to a bar. Harmony
 * moves where the tune moves, which is very often inside the bar and almost
 * always at a cadence, and a chord held for a whole bar of six or nine stops
 * sounding like accompaniment and starts sounding like a drone.
 *
 * `voiceId` and `bedVoiceId` are declared only where the piece itself names an
 * instrument. Für Elise is a piano and Twinkle is a music box; the Minuet gets
 * the clavinet because it is the nearest thing in the bank to a harpsichord,
 * and Amazing Grace gets the organ it is sung over. Where two tunes are the
 * same instrument they say the same thing — Für Elise and the Gymnopédie are
 * both solo piano, and inventing a difference between them would be dressing
 * them up rather than playing them.
 */

const E4 = 64, F4 = 65, Fs4 = 66, G4 = 67, Gs4 = 68, A4 = 69, B4 = 71;
const C4 = 60, D4 = 62;
const C5 = 72, Cs5 = 73, D5 = 74, Ds5 = 75, E5 = 76, F5 = 77, Fs5 = 78, G5 = 79;
const Gs5 = 80, A5 = 81, B5 = 83;

/** The leading note, which mixolydian does not have and a dominant needs. */
const LEADING = [11];

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
  accompaniment: 'march',
  bedVoiceId: 'strings',
  borrows: LEADING,
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
  // Each phrase is C for a bar, then answers itself with G. The fourth bar is
  // a half cadence and the eighth a full one, which is the whole shape of the
  // tune and the reason both of those bars change chord halfway through.
  chords: progression([
    [0, 'maj', 4],
    [4, 'maj', 2], [0, 'maj', 2],
    [0, 'maj', 4],
    [0, 'maj', 2], [4, 'maj', 2],

    [0, 'maj', 4],
    [4, 'maj', 2], [0, 'maj', 2],
    [0, 'maj', 4],
    [4, 'maj', 2], [0, 'maj', 2],
  ]),
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
  accompaniment: 'march',
  voiceId: 'music-box',
  bedVoiceId: 'bed-harp',
  borrows: LEADING,
  pass: 0.65,
  melody: line([
    [C4, 1], [C4, 1], [G4, 1], [G4, 1], [A4, 1], [A4, 1], [G4, 2],
    [F4, 1], [F4, 1], [E4, 1], [E4, 1], [D4, 1], [D4, 1], [C4, 2],
    [G4, 1], [G4, 1], [F4, 1], [F4, 1], [E4, 1], [E4, 1], [D4, 2],
    [G4, 1], [G4, 1], [F4, 1], [F4, 1], [E4, 1], [E4, 1], [D4, 2],
    [C4, 1], [C4, 1], [G4, 1], [G4, 1], [A4, 1], [A4, 1], [G4, 2],
    [F4, 1], [F4, 1], [E4, 1], [E4, 1], [D4, 1], [D4, 1], [C4, 2],
  ]),
  // Two chords a bar, each following the pair of notes above it. This is the
  // harmonisation everybody has heard, and the first place in the library
  // where the bed audibly moves with the melody rather than under it.
  chords: progression([
    [0, 'maj', 4],
    [3, 'maj', 2], [0, 'maj', 2],
    [3, 'maj', 2], [0, 'maj', 2],
    [4, 'maj', 2], [0, 'maj', 2],
    [0, 'maj', 2], [3, 'maj', 2],
    [0, 'maj', 2], [4, 'maj', 2],
    [0, 'maj', 2], [3, 'maj', 2],
    [0, 'maj', 2], [4, 'maj', 2],
    [0, 'maj', 4],
    [3, 'maj', 2], [0, 'maj', 2],
    [3, 'maj', 2], [0, 'maj', 2],
    [4, 'maj', 2], [0, 'maj', 2],
  ]),
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
  pickup: 1,
  root: G4,
  scaleId: 'mixolydian',
  accompaniment: 'waltz',
  voiceId: 'pipe-organ',
  bedVoiceId: 'bed-choir',
  borrows: LEADING,
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
  chords: progression([
    [4, 'maj', 1],                            // the pickup leans on the dominant
    [0, 'maj', 3],
    [0, 'maj', 2], [4, 'maj', 1],
    [3, 'maj', 3],                            // "how sweet" — the subdominant
    [0, 'maj', 3],
    [0, 'maj', 3],
    [0, 'maj', 2], [4, 'maj', 1],
    [0, 'maj', 3],
    [0, 'maj', 3],
    [3, 'maj', 1.5], [0, 'maj', 1.5],
    [3, 'maj', 3],
    [0, 'maj', 1.5], [4, 'maj', 1.5],
    [0, 'maj', 3],
    [0, 'maj', 2], [4, 'maj', 1],
    [4, 'maj', 1], [0, 'maj', 2],             // and home
  ]),
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
  accompaniment: 'waltz',
  voiceId: 'breath-flute',
  bedVoiceId: 'nylon-guitar',
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
  // Entirely diatonic, and deliberately so: the whole character of the tune is
  // the D major that dorian allows and the natural minor does not, answered by
  // the flat seventh at every cadence.
  chords: progression([
    [0, 'min', 3],
    [0, 'min', 1.5], [6, 'maj', 1.5],
    [2, 'maj', 1.5], [4, 'min', 1.5],
    [0, 'min', 3],
    [0, 'min', 1.5], [2, 'maj', 1.5],
    [2, 'maj', 3],
    [0, 'min', 3],
    [6, 'maj', 3],
    [0, 'min', 3],
    [0, 'min', 1.5], [3, 'maj', 1.5],         // the raised sixth, the dorian chord
    [4, 'min', 1.5], [2, 'maj', 1.5],
    [4, 'min', 3],
    [0, 'min', 1.5], [2, 'maj', 1.5],
    [6, 'maj', 1.5], [0, 'min', 1.5],
    [0, 'min', 3],
  ]),
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
  pickup: 1,
  root: A4,
  scaleId: 'aeolian',
  accompaniment: 'compound',
  voiceId: 'harp',
  bedVoiceId: 'nylon-guitar',
  // The raised seventh. Greensleeves is the standard example of a minor tune
  // that borrows a major dominant, and it does it at the end of every phrase.
  borrows: LEADING,
  pass: 0.7,
  // The upper neighbour in each group — the F, the A, the G sharp — is
  // traditionally a snap: a dotted eighth answered by a sixteenth. Here the
  // beat already *is* the eighth, so writing that literally as 1.5 and 0.5 put
  // two notes 179ms apart in the seventh tune of the chain, tighter than
  // anything in the Canon or the Bach and inside the perfect window's own
  // width. Evened out, it is three notes to the group and 357ms, which is what
  // Für Elise asks two tunes later. The library flattens ornaments elsewhere
  // for the same reason; this was the one that kept one.
  melody: line([
    [A4, 1],
    [C5, 2], [D5, 1], [E5, 1], [F5, 1], [E5, 1],
    [D5, 2], [B4, 1], [G4, 1], [A4, 1], [B4, 1],
    [C5, 2], [A4, 1], [A4, 1], [Gs4, 1], [A4, 1],
    [B4, 2], [Gs4, 1], [E4, 3],
    [C5, 2], [D5, 1], [E5, 1], [F5, 1], [E5, 1],
    [D5, 2], [B4, 1], [G4, 1], [A4, 1], [B4, 1],
    [C5, 2], [B4, 1], [A4, 1], [Gs4, 1], [A4, 1],
    [B4, 2], [Gs4, 1], [A4, 3],
  ]),
  // Two chords to a bar of six, which is what six-eight actually is: two
  // groups of three, each with its own bass note.
  chords: progression([
    [0, 'min', 1],
    [0, 'min', 3], [2, 'maj', 3],
    [6, 'maj', 3], [4, 'min', 3],
    [0, 'min', 3], [4, 'maj', 3],
    [4, 'maj', 3], [0, 'min', 3],
    [0, 'min', 3], [2, 'maj', 3],
    [6, 'maj', 3], [4, 'min', 3],
    [0, 'min', 3], [4, 'maj', 3],
    [4, 'maj', 3], [0, 'min', 3],
  ]),
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
  // The left hand of the piece is a broken chord and nothing else, which is
  // why this is the tune the pattern exists for.
  accompaniment: 'broken',
  voiceId: 'felt-piano',
  bedVoiceId: 'bed-felt-piano',
  borrows: LEADING,
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
  chords: progression([
    [0, 'min', 3],
    [4, 'maj', 3],
    [0, 'min', 3],
    [0, 'min', 3],
    [0, 'min', 3],
    [4, 'maj', 3],
    [4, 'maj', 3],                            // E, G sharp, B — the melody spells it
    [2, 'maj', 3],
    [4, 'maj', 3],
    [4, 'maj', 3],
    [4, 'maj', 1.5], [0, 'min', 1.5],
    [0, 'min', 3],
  ]),
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
  pickup: 1,
  root: C4,
  scaleId: 'mixolydian',
  accompaniment: 'arpeggio',
  voiceId: 'choir',
  bedVoiceId: 'bed-harp',
  borrows: LEADING,
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
  chords: progression([
    [0, 'maj', 1],
    [0, 'maj', 4],
    [3, 'maj', 2], [0, 'maj', 2],
    [0, 'maj', 2], [4, 'maj', 2],
    [0, 'maj', 2], [5, 'min', 2],
    [4, 'maj', 2], [3, 'maj', 2],
    [0, 'maj', 2], [3, 'maj', 2],
    [3, 'maj', 2], [4, 'maj', 2],
    [4, 'maj', 2], [0, 'maj', 2],
  ]),
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
  accompaniment: 'broken',
  voiceId: 'clavinet',
  bedVoiceId: 'bed-harp',
  borrows: LEADING,
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
  chords: progression([
    [0, 'maj', 3],
    [0, 'maj', 3],
    [3, 'maj', 1.5], [4, 'maj', 1.5],
    [0, 'maj', 3],
    [3, 'maj', 1.5], [0, 'maj', 1.5],
    [0, 'maj', 3],
    [4, 'maj', 3],                            // the F sharp in the tune is its third
    [4, 'maj', 1.5], [0, 'maj', 1.5],
  ]),
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
  // Bass on one, chord on two and three, once a bar and never hurried. That is
  // not an arrangement of the piece; it *is* the piece's left hand.
  accompaniment: 'waltz',
  voiceId: 'felt-piano',
  bedVoiceId: 'bed-felt-piano',
  borrows: LEADING,
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
  chords: progression([
    [3, 'maj7', 3], [0, 'maj7', 3], [3, 'maj7', 3], [0, 'maj7', 3],
    [3, 'maj7', 3], [0, 'maj7', 3], [4, 'min7', 3], [0, 'maj7', 3],
    [3, 'maj7', 3], [0, 'maj7', 3], [3, 'maj7', 3], [0, 'maj7', 3],
    [4, 'min7', 3], [3, 'maj7', 3], [4, 'min7', 3], [0, 'maj7', 3],
  ]),
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

/**
 * The quaver variation, one bar of eight to each chord of the ground.
 *
 * Eight bars of it rather than four: the ground is eight chords long, and a
 * variation that stops halfway leaves the harmony playing on alone.
 */
const CANON_RUN = line([
  [D5, 0.5], [E5, 0.5], [Fs5, 0.5], [G5, 0.5], [A5, 0.5], [G5, 0.5], [Fs5, 0.5], [E5, 0.5],
  [D5, 0.5], [Cs5, 0.5], [B4, 0.5], [Cs5, 0.5], [D5, 0.5], [Cs5, 0.5], [B4, 0.5], [A4, 0.5],
  [B4, 0.5], [A4, 0.5], [G4, 0.5], [A4, 0.5], [B4, 0.5], [Cs5, 0.5], [D5, 0.5], [E5, 0.5],
  [Fs5, 0.5], [E5, 0.5], [D5, 0.5], [E5, 0.5], [Fs5, 0.5], [G5, 0.5], [A5, 0.5], [B5, 0.5],
  [G5, 0.5], [A5, 0.5], [B5, 0.5], [A5, 0.5], [G5, 0.5], [Fs5, 0.5], [E5, 0.5], [D5, 0.5],
  [Fs5, 0.5], [G5, 0.5], [A5, 0.5], [G5, 0.5], [Fs5, 0.5], [E5, 0.5], [D5, 0.5], [Cs5, 0.5],
  [B4, 0.5], [Cs5, 0.5], [D5, 0.5], [E5, 0.5], [G5, 0.5], [A5, 0.5], [B5, 0.5], [A5, 0.5],
  [E5, 0.5], [D5, 0.5], [Cs5, 0.5], [B4, 0.5], [A4, 0.5], [B4, 0.5], [Cs5, 0.5], [D5, 0.5],
], 32);

/** The ground: eight bars that come round twice. */
const CANON_GROUND: [number, 'maj' | 'min'][] = [
  [0, 'maj'], [4, 'maj'], [5, 'min'], [2, 'min'],
  [3, 'maj'], [0, 'maj'], [3, 'maj'], [4, 'maj'],
];

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
  accompaniment: 'arpeggio',
  voiceId: 'choir',
  bedVoiceId: 'strings',
  borrows: LEADING,
  pass: 0.75,
  melody: merge(CANON_LONG, CANON_RUN),
  chords: progression([
    ...CANON_GROUND.map(([d, q]) => [d, q, 4] as const),
    ...CANON_GROUND.slice(0, 7).map(([d, q]) => [d, q, 4] as const),
    // The ground ends on the dominant so it can turn round again. This one has
    // nowhere left to turn, so it resolves instead of hanging.
    [4, 'maj', 2], [0, 'maj', 2],
  ]),
};

const JESU_LINE = line([
  [G4, 1], [A4, 1], [B4, 1], [D5, 1], [C5, 1], [B4, 1], [D5, 1], [C5, 1], [B4, 1],
  [A4, 1], [B4, 1], [C5, 1], [B4, 1], [A4, 1], [G4, 1], [Fs4, 1], [G4, 1], [A4, 1],
  [D4, 1], [G4, 1], [A4, 1], [B4, 1], [C5, 1], [D5, 1], [E5, 1], [D5, 1], [C5, 1],
  [B4, 1], [D5, 1], [C5, 1], [B4, 1], [A4, 1], [G4, 1], [Fs4, 1], [G4, 1], [G4, 1],
]);

/**
 * The chorale harmony, one chord to each group of three quavers.
 *
 * Nine-eight counted as nine is three groups to a bar, and a chorale changes
 * chord about that often. Held a whole bar instead, this tune changed harmony
 * once every three seconds and stopped sounding like Bach at all.
 */
const JESU_CHORDS: [number, 'maj' | 'min', number][] = [
  [0, 'maj', 3], [0, 'maj', 3], [0, 'maj', 3],
  [5, 'min', 3], [0, 'maj', 3], [4, 'maj', 3],
  [0, 'maj', 3], [3, 'maj', 3], [3, 'maj', 3],
  [0, 'maj', 3], [5, 'min', 3], [4, 'maj', 1], [0, 'maj', 2],
];

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
  accompaniment: 'compound',
  voiceId: 'pipe-organ',
  bedVoiceId: 'bed-organ',
  borrows: LEADING,
  pass: 0.75,
  melody: merge(
    JESU_LINE,
    shift(JESU_LINE, 36),
    // Only the reprise is harmonised: the tune has to be known first.
    harmonise(shift(JESU_LINE, 36).filter((n) => n.beat % 3 === 0), -4),
  ),
  chords: [
    ...progression(JESU_CHORDS),
    ...progression(JESU_CHORDS, 36),
  ],
};

/** Ordered by difficulty: this is also the unlock chain. */
export const CLASSICS: Tune[] = [
  ODE_TO_JOY, TWINKLE, AMAZING_GRACE, SCARBOROUGH_FAIR, GREENSLEEVES,
  FUR_ELISE, LONDONDERRY_AIR, MINUET_IN_G, GYMNOPEDIE, CANON_IN_D, JESU_JOY,
];
