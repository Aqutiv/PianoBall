import { FRERE_JACQUES, DRUNKEN_SAILOR, CAN_CAN, BLUE_DANUBE, THE_ENTERTAINER } from './familiar';
import type { Tune } from '../chart';
import { progression, merge, shift } from './notation';
import { scorePart as part, phraseDynamics as dynamics, pedalBars } from './classicalNotation';

/** Source boundaries, units and editorial decisions: docs/classical-arrangements.md.
 * Automatic accompaniments are independently authored score parts. `chords` is
 * the harmonic map for the economical playable backing course, not the audio.
 */
const PIANO = { voiceId: 'felt-piano', bedVoiceId: 'bed-felt-piano' } as const;

/** Breitkopf 1888: pickup, first strain and its first ending; eighth-note units. */
export const FUR_ELISE: Tune = {
  id: 'fur-elise', title: 'Für Elise', composer: 'Beethoven', origin: 'classic', difficulty: 3,
  teaches: 'Alternating semitones, then leaving room for the other hand.',
  bpm: 84, beatsPerBar: 3, pickup: 1, root: 69, scaleId: 'aeolian',
  accompaniment: 'broken', ...PIANO, borrows: [6, 11], pass: 0.65,
  melody: dynamics(part(`
    E5/0.5 D#5/0.5 |
    E5/0.5 D#5/0.5 E5/0.5 B4/0.5 D5/0.5 C5/0.5 |
    A4/1 _/0.5 C4/0.5 E4/0.5 A4/0.5 |
    B4/1 _/0.5 E4/0.5 G#4/0.5 B4/0.5 |
    C5/1 _/0.5 E4/0.5 E5/0.5 D#5/0.5 |
    E5/0.5 D#5/0.5 E5/0.5 B4/0.5 D5/0.5 C5/0.5 |
    A4/1 _/0.5 C4/0.5 E4/0.5 A4/0.5 |
    B4/1 _/0.5 E4/0.5 C5/0.5 B4/0.5 | A4/2
  `, 0, 0.88), [[0, 0.9], [4, 0.76], [10, 0.98], [16, 0.8], [22, 0.72]]),
  backingNotes: dynamics(pedalBars(part(`
    _/1 | _/3 |
    A2/0.5 E3/0.5 A3/0.5 _/1.5 |
    E2/0.5 E3/0.5 G#3/0.5 _/1.5 |
    A2/0.5 E3/0.5 A3/0.5 _/1.5 | _/3 |
    A2/0.5 E3/0.5 A3/0.5 _/1.5 |
    E2/0.5 E3/0.5 G#3/0.5 _/1.5 |
    A2/0.5 E3/0.5 A3/0.5 _/0.5
  `, 0, 0.62), 3, 1, 24), [[4, 0.84], [10, 1], [16, 0.86], [22, 0.76]]),
  chords: progression([
    [0, 'min', 1], [0, 'min', 3], [0, 'min', 3], [4, 'maj', 3],
    [0, 'min', 3], [0, 'min', 3], [0, 'min', 3], [4, 'maj', 3], [0, 'min', 2],
  ]),
};

export const ODE_TO_JOY: Tune = {
  id: 'ode-to-joy', title: 'Ode to Joy', composer: 'Beethoven', origin: 'classic', difficulty: 1,
  teaches: 'Neighbouring keys, with a question and its answer.',
  bpm: 96, beatsPerBar: 4, root: 60, scaleId: 'ionian', accompaniment: 'march',
  ...PIANO, borrows: [6], pass: 0.6,
  melody: dynamics(part(`
    E4/1 E4/1 F4/1 G4/1 | G4/1 F4/1 E4/1 D4/1 |
    C4/1 C4/1 D4/1 E4/1 | E4/1.5 D4/0.5 D4/2 |
    E4/1 E4/1 F4/1 G4/1 | G4/1 F4/1 E4/1 D4/1 |
    C4/1 C4/1 D4/1 E4/1 | D4/1.5 C4/0.5 C4/2
  `), [[0, 0.88], [3, 1], [14, 0.82], [19, 1], [30, 0.76]]),
  backingNotes: merge(
    part(`C3/2 G2/2 | B2/2 C3/2 | A2/2 F2/2 | G2/4 |
      C3/2 G2/2 | B2/2 C3/2 | F2/2 F#2/2 | G2/1.5 C3/2.5`, 0, 0.6),
    part(`E3+G3/2 F3+G3/2 | D3+G3/2 E3+G3/2 |
      E3+A3/2 F3+A3/2 | C3+G3/2 B2+G3/2 |
      E3+G3/2 F3+G3/2 | D3+G3/2 E3+G3/2 |
      A3+C4/2 A3+C4/2 | B3+F4/1.5 E3+G3/2.5`, 0, 0.46, 0.94),
  ),
  chords: progression([
    [0, 'maj', 4], [4, 'dom7', 2], [0, 'maj', 2], [5, 'min', 2], [3, 'maj', 2],
    [4, 'sus4', 2], [4, 'maj', 2], [0, 'maj', 4], [4, 'dom7', 2], [0, 'maj', 2],
    [3, 'maj', 2], [1, 'dom7', 2], [4, 'dom7', 1.5], [0, 'maj', 2.5],
  ]),
};

export const TWINKLE: Tune = {
  id: 'twinkle', title: 'Twinkle, Twinkle', composer: 'Traditional', origin: 'classic', difficulty: 1,
  teaches: 'Jumping a fifth and shaping a complete tune.',
  bpm: 100, beatsPerBar: 4, root: 60, scaleId: 'ionian', accompaniment: 'march',
  ...PIANO, pass: 0.6,
  melody: dynamics(part(`
    C4/1 C4/1 G4/1 G4/1 | A4/1 A4/1 G4/2 |
    F4/1 F4/1 E4/1 E4/1 | D4/1 D4/1 C4/2 |
    G4/1 G4/1 F4/1 F4/1 | E4/1 E4/1 D4/2 |
    G4/1 G4/1 F4/1 F4/1 | E4/1 E4/1 D4/2 |
    C4/1 C4/1 G4/1 G4/1 | A4/1 A4/1 G4/2 |
    F4/1 F4/1 E4/1 E4/1 | D4/1 D4/1 C4/2
  `), [[0, 0.85], [4, 1], [14, 0.8], [24, 0.95], [32, 0.88], [46, 0.72]]),
  backingNotes: merge(
    part(`C3/4 | F2/2 E3/2 | D3/2 C3/2 | G2/2 C3/2 |
      E3/2 F3/2 | C3/2 B2/2 | E3/2 F3/2 | C3/2 B2/2 |
      C3/4 | F2/2 E3/2 | D3/2 C3/2 | G2/2 C3/2`, 0, 0.56),
    part(`E3+G3/4 | A3+C4/2 G3+C4/2 | A3+C4/2 G3+C4/2 | F3+B3/2 E3+G3/2 |
      G3+C4/2 A3+C4/2 | G3+C4/2 F3+G3/2 | G3+C4/2 A3+C4/2 | G3+C4/2 F3+G3/2 |
      E3+G3/4 | A3+C4/2 G3+C4/2 | A3+C4/2 G3+C4/2 | F3+B3/2 E3+G3/2`, 0, 0.44, 0.94),
  ),
  chords: progression([
    [0, 'maj', 4], [3, 'maj', 2], [0, 'maj', 2], [3, 'maj', 2], [0, 'maj', 2],
    [4, 'dom7', 2], [0, 'maj', 2], [0, 'maj', 2], [3, 'maj', 2], [0, 'maj', 2], [4, 'dom7', 2],
    [0, 'maj', 2], [3, 'maj', 2], [0, 'maj', 2], [4, 'dom7', 2],
    [0, 'maj', 4], [3, 'maj', 2], [0, 'maj', 2], [3, 'maj', 2], [0, 'maj', 2], [4, 'dom7', 2], [0, 'maj', 2],
  ]),
};

/** NEW BRITAIN, complete verse, including the original tied final tonic. */
export const AMAZING_GRACE: Tune = {
  id: 'amazing-grace', title: 'Amazing Grace', composer: 'Traditional', origin: 'classic', difficulty: 2,
  teaches: 'A pickup and a hymn phrase that breathes in three.',
  bpm: 84, beatsPerBar: 3, pickup: 1, root: 67, scaleId: 'ionian', accompaniment: 'waltz',
  ...PIANO, pass: 0.6,
  melody: dynamics(part(`D4/1 |
    G4/2 B4/0.5 G4/0.5 | B4/2 A4/1 | G4/2 E4/1 | D4/2 D4/1 |
    G4/2 B4/0.5 G4/0.5 | B4/2 A4/1 | D5/3 |
    B4/1 D5/1.5 B4/0.5 | D5/0.5 B4/0.5 G4/2 |
    D4/1 E4/1.5 G4/0.5 | G4/0.5 E4/0.5 D4/2 |
    D4/1 G4/2 | B4/0.5 G4/0.5 B4/2 | A4/1 G4/4
  `), [[0, 0.78], [7, 0.95], [19, 1], [25, 0.94], [40, 0.78]]),
  backingNotes: merge(
    part(`G2/1 | G2/2 G2/0.5 B2/0.5 | D3/2 D3/1 | E3/2 C3/1 | G2/2 G2/1 |
      G2/2 G2/0.5 B2/0.5 | D3/2 C3/1 | B2/3 | G2/1 G3/2 |
      G3/1 B2/2 | B2/1 C3/1.5 B2/0.5 | C3/1 G2/2 |
      B2/1 E3/2 | D3/1 D3/2 | D3/1 G2/4`, 0, 0.58),
    part(`B3/1 | B3+D4/3 | D4+G4/2 C4+F#4/1 | B3+G4/2 C4+E4/1 | B3+G4/3 |
      B3+D4/3 | D4+G4/2 D4+F#4/1 | D4+G4/3 | D4+G4/3 |
      D4+G4/3 | G3+C4/3 | G3+C4/1 G3+B3/2 |
      G3+B3/1 G3+B3/2 | G3+B3/1 F#3+C4/2 | F#3+C4/1 G3+B3+D4/4`, 0, 0.42, 0.96),
  ),
  chords: progression([
    [0, 'maj', 1], [0, 'maj', 3], [0, 'maj', 2], [4, 'maj', 1], [5, 'min', 2], [3, 'maj', 1],
    [0, 'maj', 3], [0, 'maj', 3], [0, 'maj', 2], [4, 'dom7', 1], [0, 'maj', 3], [0, 'maj', 3],
    [0, 'maj', 3], [3, 'maj', 3], [3, 'maj', 1], [0, 'maj', 2], [0, 'maj', 1], [5, 'min', 2],
    [0, 'maj', 1], [4, 'dom7', 2], [4, 'dom7', 1], [0, 'maj', 4],
  ]),
};

/** Familiar Dorian verse; note lengths include its phrase-spanning ties. */
export const SCARBOROUGH_FAIR: Tune = {
  id: 'scarborough-fair', title: 'Scarborough Fair', composer: 'Traditional', origin: 'classic', difficulty: 2,
  teaches: 'A Dorian melody, with held notes across the bar line.',
  bpm: 92, beatsPerBar: 3, root: 69, scaleId: 'dorian', accompaniment: 'arpeggio',
  ...PIANO, pass: 0.63,
  melody: dynamics(part(`
    A4/2 A4/1 | E5/2 E5/1 | B4/1.5 C5/0.5 B4/1 | A4/4 E5/1 G5/1 |
    A5/2 G5/1 | E5/1 F#5/1 D5/1 | E5/5 A5/1 |
    A5/2 A5/1 | G5/2 E5/1 | E5/1 D5/1 C5/1 | B4/6 |
    A4/2 E5/1 | D5/2 C5/1 | B4/1 A4/1 G4/1 | A4/12
  `), [[0, 0.78], [15, 1], [27, 0.94], [42, 0.9], [51, 0.7]]),
  backingNotes: merge(
    part(`A2/3 | A2/3 | G2/3 | A2/3 | A2/3 | A2/3 | D3/3 | E3/3 | E3/3 |
      A2/3 | G2/3 | C3/3 | E3/3 | E3/3 | A2/3 | G2/3 | G2/3 |
      A2/3 | A2/3 | A2/3 | A2/3`, 0, 0.56),
    part(`E3/1 A3/1 C4/1 | E3/1 A3/1 C4/1 | D3/1 G3/1 B3/1 |
      E3/1 A3/1 C4/1 | E3/1 A3/1 C4/1 | E3/1 A3/1 C4/1 |
      A3/1 D4/1 F#4/1 | G3/1 B3/1 E4/1 | G3/1 B3/1 E4/1 |
      E3/1 A3/1 C4/1 | D3/1 G3/1 B3/1 | G3/1 C4/1 E4/1 |
      G3/1 B3/1 E4/1 | G3/1 B3/1 E4/1 | E3/1 A3/1 C4/1 |
      D3/1 G3/1 B3/1 | D3/1 G3/1 B3/1 |
      E3+A3+C4/3 | E3/1 A3/1 C4/1 | E3/1 A3/1 C4/1 | E3+A3+C4/3`, 0, 0.42, 0.98),
  ),
  chords: progression([
    [0, 'min', 3], [0, 'min', 3], [6, 'maj', 3], [0, 'min', 3], [0, 'min', 3], [0, 'min', 3],
    [3, 'maj', 3], [4, 'min', 3], [4, 'min', 3], [0, 'min', 3], [6, 'maj', 3], [2, 'maj', 3],
    [4, 'min', 3], [4, 'min', 3], [0, 'min', 3], [6, 'maj', 3], [6, 'maj', 3],
    [0, 'min', 3], [0, 'min', 3], [0, 'min', 3], [0, 'min', 3],
  ]),
};

/** Complete verse in eighth-note units; dotted figures are never evened out. */
export const GREENSLEEVES: Tune = {
  id: 'greensleeves', title: 'Greensleeves', composer: 'Traditional', origin: 'classic', difficulty: 3,
  teaches: 'Two lilting pulses, dotted notes, and minor-key cadences.',
  bpm: 112, beatsPerBar: 6, pickup: 1, root: 69, scaleId: 'aeolian', accompaniment: 'compound',
  ...PIANO, borrows: [9, 11], pass: 0.65,
  melody: dynamics(part(`A4/1 |
    C5/2 D5/1 E5/1.5 F5/0.5 E5/1 | D5/2 B4/1 G4/1.5 A4/0.5 B4/1 |
    C5/2 A4/1 A4/1.5 G#4/0.5 A4/1 | B4/3 E4/2 A4/1 |
    C5/2 D5/1 E5/1.5 F5/0.5 E5/1 | D5/2 B4/1 G4/1.5 A4/0.5 B4/1 |
    C5/1.5 B4/0.5 A4/1 G#4/1.5 F#4/0.5 G#4/1 | A4/3 A4/2 _/1
  `), [[0, 0.76], [5, 1], [19, 0.78], [29, 1], [43, 0.74]]),
  backingNotes: merge(
    part(`A2/1 | A2/2 B2/1 C3/3 | G2/6 | A2/3 F2/3 | E2/6 |
      A2/2 B2/1 C3/3 | G2/6 | A2/3 E2/3 | A2/5 _/1`, 0, 0.58),
    part(`E3/1 | E3/1 A3/1 C4/1 E3/1 G3/1 C4/1 |
      D3/1 G3/1 B3/1 D3/1 G3/1 B3/1 | E3/1 A3/1 C4/1 F3/1 A3/1 C4/1 |
      E3/1 G#3/1 B3/1 E3/1 G#3/1 B3/1 |
      E3/1 A3/1 C4/1 E3/1 G3/1 C4/1 | D3/1 G3/1 B3/1 D3/1 G3/1 B3/1 |
      E3/1 A3/1 C4/1 E3/1 G#3/1 B3/1 | E3+A3+C4/3 E3+A3+C4/2 _/1`, 0, 0.42, 0.97),
  ),
  chords: progression([
    [0, 'min', 1], [0, 'min', 3], [2, 'maj', 3], [6, 'maj', 3], [6, 'maj', 3],
    [0, 'min', 3], [5, 'maj', 3], [4, 'maj', 3], [4, 'maj', 3],
    [0, 'min', 3], [2, 'maj', 3], [6, 'maj', 3], [6, 'maj', 3],
    [0, 'min', 3], [4, 'maj', 3], [0, 'min', 3], [0, 'min', 3],
  ]),
};

/** Petrie 1855, first eight-bar strain, transposed from E-flat to C. */
export const LONDONDERRY_AIR: Tune = {
  id: 'londonderry-air', title: 'Londonderry Air', composer: 'Traditional', origin: 'classic', difficulty: 3,
  teaches: 'A three-note pickup and a singing, continuous phrase.',
  bpm: 72, beatsPerBar: 4, pickup: 1.5, root: 60, scaleId: 'ionian', accompaniment: 'arpeggio',
  ...PIANO, borrows: [8], pass: 0.65,
  melody: dynamics(part(`B4/0.5 C5/0.5 D5/0.5 |
    E5/1.5 D5/0.5 E5/0.5 A5/0.5 G5/0.5 E5/0.5 |
    D5/0.5 C5/0.5 A4/1 _/0.5 C5/0.5 E5/0.5 F5/0.5 |
    G5/1.5 A5/0.5 G5/0.5 E5/0.5 C5/0.5 E5/0.5 |
    D5/2 _/0.5 B4/0.5 C5/0.5 D5/0.5 |
    E5/1.5 D5/0.5 E5/0.5 A5/0.5 G5/0.5 E5/0.5 |
    D5/0.5 C5/0.5 A4/0.5 G#4/0.5 A4/0.5 B4/0.5 C5/0.5 D5/0.5 |
    E5/1.5 F5/0.5 E5/0.5 D5/0.5 C5/0.5 D5/0.5 | C5/2 _/0.5
  `), [[0, 0.72], [6, 0.86], [10, 1], [14, 0.82], [19, 0.94], [29.5, 0.7]]),
  backingNotes: merge(
    part(`G2/1.5 | C3/2 A2/2 | A2/2 F2/1 G2/1 | E3/2 F3/1 E3/1 |
      G2/4 | C3/2 A2/2 | A2/1.5 E2/0.5 A2/1 G2/1 | F2/1.5 D3/0.5 G2/2 | C3/2.5`, 0, 0.56),
    part(`B3+D4/1.5 | E3/0.5 G3/0.5 C4/1 E3/0.5 A3/0.5 C4/1 |
      E3/0.5 A3/0.5 C4/1 A3+C4/1 B3+F4/1 |
      G3/0.5 C4/0.5 E4/1 A3+C4/1 G3+C4/1 |
      D3/0.5 G3/0.5 B3/1 D3/0.5 G3/0.5 B3/1 |
      E3/0.5 G3/0.5 C4/1 E3/0.5 A3/0.5 C4/1 |
      E3/0.5 A3/0.5 C4/0.5 G#3+B3/0.5 E3+A3/1 F3+B3/1 |
      A3+C4/1.5 A3+D4/0.5 B3+F4/2 | E3+G3+C4/2.5`, 0, 0.42, 0.98),
  ),
  chords: progression([
    [4, 'dom7', 1.5], [0, 'maj', 2], [5, 'min', 2], [5, 'min', 2], [3, 'maj', 1], [4, 'dom7', 1],
    [0, 'maj', 2], [3, 'maj', 1], [0, 'maj', 1], [4, 'maj', 4], [0, 'maj', 2], [5, 'min', 2],
    [5, 'min', 1.5], [2, 'maj', 0.5], [5, 'min', 1], [4, 'dom7', 1],
    [3, 'maj', 1.5], [1, 'min', 0.5], [4, 'dom7', 2], [0, 'maj', 2.5],
  ]),
};

/** Complete sixteen-bar A section; the left hand is the score, not a comp pattern. */
export const MINUET_IN_G: Tune = {
  id: 'minuet-in-g', title: 'Minuet in G', composer: 'Petzold', origin: 'classic', difficulty: 4,
  teaches: 'Running quavers and a complete question-and-answer section.',
  bpm: 100, beatsPerBar: 3, root: 67, scaleId: 'ionian', accompaniment: 'broken',
  ...PIANO, pass: 0.67,
  melody: dynamics(part(`
    D5/1 G4/0.5 A4/0.5 B4/0.5 C5/0.5 | D5/1 G4/1 G4/1 |
    E5/1 C5/0.5 D5/0.5 E5/0.5 F#5/0.5 | G5/1 G4/1 G4/1 |
    C5/1 D5/0.5 C5/0.5 B4/0.5 A4/0.5 | B4/1 C5/0.5 B4/0.5 A4/0.5 G4/0.5 |
    F#4/1 G4/0.5 A4/0.5 B4/0.5 G4/0.5 | A4/3 |
    D5/1 G4/0.5 A4/0.5 B4/0.5 C5/0.5 | D5/1 G4/1 G4/1 |
    E5/1 C5/0.5 D5/0.5 E5/0.5 F#5/0.5 | G5/1 G4/1 G4/1 |
    C5/1 D5/0.5 C5/0.5 B4/0.5 A4/0.5 | B4/1 C5/0.5 B4/0.5 A4/0.5 G4/0.5 |
    A4/1 B4/0.5 A4/0.5 G4/0.5 F#4/0.5 | G4/3
  `, 0, 0.85, 0.9), [[0, 0.88], [9, 1], [21, 0.8], [33, 1], [45, 0.76]]),
  backingNotes: dynamics(part(`
    G3+B3+D4/2 A3/1 | B3/3 | C4/3 | B3/3 | A3/3 | G3/3 |
    D4/1 B3/1 G3/1 | D4/1 D3/0.5 C4/0.5 B3/0.5 A3/0.5 |
    B3/2 A3/1 | G3/1 B3/1 G3/1 | C4/3 | B3/1 C4/0.5 B3/0.5 A3/0.5 G3/0.5 |
    A3/2 F#3/1 | G3/2 B3/1 | C4/1 D4/1 D3/1 | G3/2 G2/1
  `, 0, 0.64, 0.92), [[0, 0.86], [9, 1], [21, 0.8], [33, 1], [45, 0.74]]),
  chords: progression([
    [0, 'maj', 3], [0, 'maj', 3], [3, 'maj', 3], [0, 'maj', 3], [1, 'min7', 3], [0, 'maj', 3],
    [4, 'maj', 3], [4, 'dom7', 3], [0, 'maj', 3], [0, 'maj', 3], [3, 'maj', 3], [0, 'maj', 3],
    [1, 'min7', 3], [0, 'maj', 3], [4, 'dom7', 3], [0, 'maj', 3],
  ]),
};

/** Source bars 3–12: two introduction bars, then the first complete statement. */
export const GYMNOPEDIE: Tune = {
  id: 'gymnopedie', title: 'Gymnopédie No. 1', composer: 'Satie', origin: 'classic', difficulty: 4,
  teaches: 'Entering after the bass and carrying a note across four bars.',
  bpm: 60, beatsPerBar: 3, root: 62, scaleId: 'ionian', accompaniment: 'waltz',
  ...PIANO, pass: 0.67,
  melody: dynamics(part(`_/7 F#5/1 A5/1 | G5/1 F#5/1 C#5/1 | B4/1 C#5/1 D5/1 | A4/3 | F#4/12`, 0, 0.83),
    [[7, 0.76], [12, 1], [18, 0.64], [30, 0.5]]),
  backingNotes: merge(
    part(`G2/3 D2/3 G2/3 D2/3 G2/3 D2/3 G2/3 D2/3 G2/3 D2/3`, 0, 0.55),
    dynamics(part(`_/1 B3+D4+F#4/2 | _/1 A3+C#4+F#4/2 |
      _/1 B3+D4+F#4/2 | _/1 A3+C#4+F#4/2 |
      _/1 B3+D4+F#4/2 | _/1 A3+C#4+F#4/2 |
      _/1 B3+D4+F#4/2 | _/1 A3+C#4+F#4/2 |
      _/1 B3+D4+F#4/2 | _/1 A3+C#4+F#4/2`, 0, 0.5),
      [[0, 0.74], [12, 0.88], [18, 1], [28, 0.65]]),
  ),
  chords: progression([
    [3, 'maj7', 3], [0, 'maj7', 3], [3, 'maj7', 3], [0, 'maj7', 3], [3, 'maj7', 3],
    [0, 'maj7', 3], [3, 'maj7', 3], [0, 'maj7', 3], [3, 'maj7', 3], [0, 'maj7', 3],
  ]),
};

/** Violin I, first eight bars after its entrance; the last tonic is held to close the excerpt. */
const CANON_LINE = part(`
  F#5/1 E5/1 D5/1 C#5/1 | B4/1 A4/1 B4/1 C#5/1 |
  D5/1 C#5/1 B4/1 A4/1 | G4/1 F#4/1 G4/1 E4/1 |
  D4/0.5 F#4/0.5 A4/0.5 G4/0.5 F#4/0.5 D4/0.5 F#4/0.5 E4/0.5 |
  D4/0.5 B3/0.5 D4/0.5 A4/0.5 G4/0.5 B4/0.5 A4/0.5 G4/0.5 |
  F#4/0.5 D4/0.5 E4/0.5 C#5/0.5 D5/0.5 F#5/0.5 A5/0.5 A4/0.5 |
  B4/0.5 G4/0.5 A4/0.5 F#4/0.5 D4/0.5 D5/0.5 D5/0.75 C#5/0.25
`, 0, 0.84, 0.96);
const CANON_GROUND = part(`D3/1 A2/1 B2/1 F#2/1 | G2/1 D2/1 G2/1 A2/1`, 0, 0.58);
const CANON_HARMONY = [
  [0, 'maj', 1], [4, 'maj', 1], [5, 'min', 1], [2, 'min', 1],
  [3, 'maj', 1], [0, 'maj', 1], [3, 'maj', 1], [4, 'maj', 1],
] as const;
export const CANON_IN_D: Tune = {
  id: 'canon-in-d', title: 'Canon in D', composer: 'Pachelbel', origin: 'classic', difficulty: 5,
  teaches: 'Hear the canonic entrances as the lead changes from quarters to quavers.',
  bpm: 56, beatsPerBar: 4, root: 62, scaleId: 'ionian', accompaniment: 'arpeggio',
  ...PIANO, pass: 0.7,
  melody: dynamics(merge(CANON_LINE, part('D5/4', 32, 0.74)), [[0, 0.85], [16, 0.94], [28, 1], [32, 0.76]]),
  backingNotes: merge(
    ...[0, 8, 16, 24].map(beat => shift(CANON_GROUND, beat)),
    shift(CANON_LINE.filter(n => n.beat < 24).map(n => ({ ...n, gain: 0.43 * 0.05 })), 8),
    shift(CANON_LINE.filter(n => n.beat < 16).map(n => ({ ...n, gain: 0.37 * 0.05 })), 16),
    part('D2+A2+D3+F#4/4', 32, 0.44),
  ),
  chords: progression([...CANON_HARMONY, ...CANON_HARMONY, ...CANON_HARMONY, ...CANON_HARMONY, [0, 'maj', 4]]),
};

/** BGA 1884, p.229: the first complete ritornello and its cadence; 9/8 units. */
export const JESU_JOY: Tune = {
  id: 'jesu-joy', title: 'Jesu, Joy of Man’s Desiring', composer: 'Bach', origin: 'classic', difficulty: 5,
  teaches: 'Three compound pulses and a melody carried by independent voices.',
  bpm: 176, beatsPerBar: 9, root: 67, scaleId: 'ionian', accompaniment: 'compound',
  ...PIANO, borrows: [6], pass: 0.7,
  melody: dynamics(part(`
    _/1 G4/1 A4/1 B4/1 D5/1 C5/1 C5/1 E5/1 D5/1 |
    D5/1 G5/1 F#5/1 G5/1 D5/1 B4/1 G4/1 A4/1 B4/1 |
    C5/1 D5/1 E5/1 D5/1 C5/1 B4/1 A4/1 B4/1 G4/1 |
    F#4/1 G4/1 A4/1 D4/1 F#4/1 A4/1 C5/1 B4/1 A4/1 |
    B4/1 G4/1 A4/1 B4/1 D5/1 C5/1 C5/1 E5/1 D5/1 |
    D5/1 G5/1 F#5/1 G5/1 D5/1 B4/1 G4/1 A4/1 B4/1 |
    E4/1 D5/1 C5/1 B4/1 A4/1 G4/1 D4/1 G4/1 F#4/1 |
    G4/1 B4/1 D5/1 G5/1 D5/1 B4/1 G4/1 B4/1 D5/1 | G5/3
  `, 0, 0.84, 0.96), [[0, 0.82], [12, 0.95], [27, 0.8], [48, 0.96], [66, 1], [72, 0.74]]),
  backingNotes: merge(
    // Continuo, quarter notes against the triplet violin figure.
    part(`G2/3 G3/3 E3/3 | B2/3 E3/3 E2/3 | A2/3 B2/3 C3/3 |
      D3/3 F#3/3 D3/3 | G3/3 E3/3 C3/3 | B2/3 E3/3 D3/3 |
      C3/3 C#3/3 D3/3 | G2/3 _/2.25 G3/0.75 D3/2.25 B2/0.75 | G2/3`, 0, 0.56, 0.94),
    // Violin II's dotted eighth/sixteenth figures are not the lead's triplets.
    part(`_/3 G4/2.25 F#4/0.75 G4/2.25 A4/0.75 |
      B4/2.25 A4/0.75 B4/2.25 G4/0.75 E4/2.25 D4/0.75 |
      E4/2.25 F#4/0.75 G4/2.25 D4/0.75 E4/2.25 C4/0.75 |
      B3/2.25 D4/0.75 A4/2.25 G4/0.75 A4/2.25 F#4/0.75 |
      D4/2.25 F#4/0.75 G4/2.25 F#4/0.75 G4/2.25 A4/0.75 |
      B4/2.25 A4/0.75 B4/2.25 G4/0.75 E4/2.25 G4/0.75 |
      A4/2.25 F#4/0.75 G4/2.25 E4/0.75 A3/2.25 C4/0.75 |
      B3/2.25 G4/0.75 B4/2.25 D5/0.75 G5/2.25 D5/0.75 | B4/3`, 0, 0.39, 0.93),
    part(`_/3 D4/3 E4/3 | G4/3 E4/3 B3/3 | A3/3 D4/3 C4/6 A3/3 E4/3 |
      G4/3 G3/3 E4/3 | G4/3 E4/3 B3/3 | C4/3 E4/3 D4/3 |
      D4/3 _/2.25 D4/0.75 B3/2.25 G4/0.75 | D4/3`, 0, 0.38, 0.97),
  ),
  chords: progression([
    [0, 'maj', 6], [3, 'maj', 3], [5, 'min', 6], [5, 'min', 3],
    [1, 'min', 3], [0, 'maj', 3], [3, 'maj', 3], [4, 'maj', 3], [4, 'dom7', 3], [4, 'dom7', 3],
    [0, 'maj', 3], [5, 'min', 3], [3, 'maj', 3], [0, 'maj', 3], [5, 'min', 3], [5, 'min7', 3],
    [1, 'min', 3], [1, 'dom7', 3], [4, 'maj', 3], [0, 'maj', 3], [0, 'maj', 3], [0, 'maj', 3], [0, 'maj', 3],
  ]),
};

export const CLASSICS: Tune[] = [
  ODE_TO_JOY, TWINKLE, FRERE_JACQUES,
  AMAZING_GRACE, SCARBOROUGH_FAIR, DRUNKEN_SAILOR,
  GREENSLEEVES, FUR_ELISE, LONDONDERRY_AIR, CAN_CAN,
  MINUET_IN_G, GYMNOPEDIE, BLUE_DANUBE,
  CANON_IN_D, JESU_JOY, THE_ENTERTAINER,
];
