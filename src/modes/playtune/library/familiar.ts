import type { Tune } from '../chart';
import { line, progression, R, type Step, type ChordStep } from './notation';

/**
 * Short reductions of historical tunes. Sources, editions, beat units and
 * editorial choices are recorded in docs/tune-sources.md. These are authored
 * notes and harmony, played by the synth; no recordings or MIDI files ship.
 */
const C4 = 60, Cs4 = 61, D4 = 62, Ds4 = 63, E4 = 64, F4 = 65, Fs4 = 66;
const G3 = 55, G4 = 67, A4 = 69, B4 = 71;
const C5 = 72, D5 = 74, Ds5 = 75, E5 = 76, F5 = 77, Fs5 = 78;
const G5 = 79, A5 = 81, B5 = 83, C6 = 84;

// Eight bars, each short motif answered by an exact repetition.
const JACQUES: Step[] = [
  [C4, 1], [D4, 1], [E4, 1], [C4, 1],
  [C4, 1], [D4, 1], [E4, 1], [C4, 1],
  [E4, 1], [F4, 1], [G4, 2],
  [E4, 1], [F4, 1], [G4, 2],
  [G4, 0.5], [A4, 0.5], [G4, 0.5], [F4, 0.5], [E4, 1], [C4, 1],
  [G4, 0.5], [A4, 0.5], [G4, 0.5], [F4, 0.5], [E4, 1], [C4, 1],
  [C4, 1], [G3, 1], [C4, 2],
  [C4, 1], [G3, 1], [C4, 2],
];
const JACQUES_CHORDS: ChordStep[] = [
  [0, 'maj', 4], [0, 'maj', 4],
  [0, 'maj', 2], [4, 'maj', 2], [0, 'maj', 2], [4, 'maj', 2],
  [4, 'maj', 2], [0, 'maj', 2], [4, 'maj', 2], [0, 'maj', 2],
  [4, 'maj', 2], [0, 'maj', 2], [4, 'maj', 2], [0, 'maj', 2],
];

export const FRERE_JACQUES: Tune = {
  id: 'frere-jacques', title: 'Frère Jacques', composer: 'Traditional', origin: 'classic',
  difficulty: 1, teaches: 'Short phrases that answer themselves, and the ringing bells below.',
  bpm: 80, beatsPerBar: 4, root: C4, scaleId: 'ionian', pass: 0.6,
  accompaniment: 'march', voiceId: 'music-box', bedVoiceId: 'bed-harp',
  melody: line([...JACQUES, ...JACQUES]),
  chords: progression([...JACQUES_CHORDS, ...JACQUES_CHORDS]),
};

// Terry (1921), vocal line: eight-bar verse followed by its refrain.
// The printed 2/4 quavers become chart quarter beats at the practice tempo.
const SAILOR: Step[] = [
  [A4, 1], [A4, 0.5], [A4, 0.5], [A4, 1], [A4, 0.5], [A4, 0.5],
  [A4, 1], [D4, 1], [F4, 1], [A4, 1],
  [G4, 1], [G4, 0.5], [G4, 0.5], [G4, 1], [G4, 0.5], [G4, 0.5],
  [G4, 1], [C4, 1], [E4, 1], [G4, 1],
  [A4, 1], [A4, 0.5], [A4, 0.5], [A4, 1], [A4, 0.5], [A4, 0.5],
  [A4, 1], [B4, 1], [C5, 1], [D5, 1],
  [C5, 1], [A4, 1], [G4, 1], [E4, 1],
  [D4, 2], [D4, 2],

  [A4, 2], [A4, 1.5], [A4, 0.5],
  [A4, 1], [D4, 1], [F4, 1], [A4, 1],
  [G4, 2], [G4, 1.5], [G4, 0.5],
  [G4, 1], [C4, 1], [E4, 1], [G4, 1],
  [A4, 2], [A4, 1.5], [A4, 0.5],
  [A4, 1], [B4, 1], [C5, 1], [D5, 1],
  [C5, 1], [A4, 1], [G4, 1], [E4, 1],
  [D4, 2], [D4, 2],
];
const SAILOR_HARMONY: ChordStep[] = [
  [0, 'min', 4], [0, 'min', 4], [6, 'maj', 4], [6, 'maj', 4],
  [0, 'min', 4], [0, 'min', 4], [6, 'maj', 4], [0, 'min', 4],
];

export const DRUNKEN_SAILOR: Tune = {
  id: 'drunken-sailor', title: 'Drunken Sailor', composer: 'Traditional', origin: 'classic',
  difficulty: 2, teaches: 'Repeated notes and a minor tune, with a chorus to answer it.',
  bpm: 108, beatsPerBar: 4, root: D4, scaleId: 'dorian', pass: 0.63,
  accompaniment: 'march', voiceId: 'choir', bedVoiceId: 'nylon-guitar',
  melody: line([...SAILOR, ...SAILOR]),
  chords: progression([...SAILOR_HARMONY, ...SAILOR_HARMONY, ...SAILOR_HARMONY, ...SAILOR_HARMONY]),
};

// Galop refrain: eighth-note beats, four to each 2/4 bar. Transposed from
// D to C. Grace notes are omitted; the third bar keeps its rising F-A-C
// arpeggio. Use the score's closed second ending at each repeat boundary.
const GALOP: Step[] = [
  [G4, 1], [C5, 1], [C5, 1], [D5, 1],
  [E5, 1], [C5, 1], [C5, 1], [E5, 1],
  [F5, 1], [A5, 1], [C6, 1], [A5, 1],
  [A5, 1], [G5, 1], [G5, 2],
  [A5, 1], [C5, 1], [C5, 1], [A5, 1],
  [G5, 1], [D5, 1], [D5, 1], [F5, 1],
  [F5, 1], [E5, 1], [F5, 1], [E5, 1],
  [F5, 1], [E5, 1], [E5, 2],
];
const GALOP_CHORDS: ChordStep[] = [
  [0, 'maj', 4], [0, 'maj', 4], [3, 'maj', 4], [4, 'maj', 4],
  [3, 'maj', 4], [4, 'maj', 4], [0, 'maj', 4], [0, 'maj', 4],
];

export const CAN_CAN: Tune = {
  id: 'can-can', title: 'Can-Can', composer: 'Offenbach', origin: 'classic',
  difficulty: 3, teaches: 'Repeated notes, a leap, and a running dance refrain.',
  bpm: 112, beatsPerBar: 4, root: C4, scaleId: 'ionian', pass: 0.65,
  accompaniment: 'march', voiceId: 'grand', bedVoiceId: 'strings',
  // Four complete eight-bar refrains, each resolving onto the tonic harmony.
  melody: line([...GALOP, ...GALOP, ...GALOP, ...GALOP]),
  chords: progression([...GALOP_CHORDS, ...GALOP_CHORDS, ...GALOP_CHORDS, ...GALOP_CHORDS]),
};

// First waltz, both phrases. Keep the three-note lead-in as a full bar (as in
// Spina's piano score), and omit the grace notes and octave/chord doublings.
const DANUBE: Step[] = [
  [D4, 1], [Fs4, 1], [A4, 1], [A4, 1], [R, 1], [A5, 1],
  [A5, 1], [R, 1], [Fs5, 1], [Fs5, 1], [R, 1], [D4, 1],
  [D4, 1], [Fs4, 1], [A4, 1], [A4, 1], [R, 1], [B5, 1],
  [B5, 1], [R, 1], [G5, 1], [G5, 1], [R, 1], [Cs4, 1],
  [Cs4, 1], [E4, 1], [A4, 1], [A4, 1], [R, 1], [G5, 1],
  [G5, 1], [R, 1], [E5, 1], [E5, 1], [R, 1], [Cs4, 1],
  [Cs4, 1], [E4, 1], [A4, 1], [A4, 1], [R, 1], [Fs5, 1],
  [Fs5, 1], [R, 1], [D5, 1], [D5, 1], [R, 1], [D4, 1],

  [D4, 1], [Fs4, 1], [A4, 1], [B4, 1], [R, 1], [B5, 1],
  [B5, 1], [R, 1], [Fs5, 1], [Fs5, 1], [R, 1], [D4, 1],
  [D4, 1], [Fs4, 1], [A4, 1], [B4, 1], [R, 1], [A5, 1],
  [A5, 1], [R, 1], [E5, 1], [E5, 1], [R, 1], [B4, 1],
  [B4, 1], [D5, 1], [Fs5, 0.5], [R, 0.5], [G5, 4],
  [E5, 1], [Fs5, 1], [B5, 4], [G5, 1], [B4, 1],
  [B4, 2], [A4, 1], [E5, 2], [D5, 1], [D5, 3],
];
const DANUBE_CHORDS: ChordStep[] = [
  [0, 'maj', 3], [0, 'maj', 3], [0, 'maj', 3], [0, 'maj', 3],
  [0, 'maj', 3], [4, 'dom7', 3], [4, 'dom7', 3], [4, 'dom7', 3],
  [4, 'dom7', 3], [4, 'dom7', 3], [4, 'dom7', 3], [4, 'dom7', 3],
  [4, 'dom7', 3], [0, 'maj', 3], [0, 'maj', 3], [0, 'maj', 3],
  [0, 'maj', 3], [2, 'min', 3], [2, 'min', 3], [5, 'min', 3],
  [5, 'min', 3], [1, 'min', 3], [1, 'min', 3], [4, 'dom7', 3],
  [4, 'dom7', 3], [3, 'maj', 3], [4, 'dom7', 3], [2, 'min', 3],
  [0, 'maj', 3], [4, 'dom7', 3], [4, 'dom7', 3], [0, 'maj', 3],
];

export const BLUE_DANUBE: Tune = {
  id: 'blue-danube', title: 'The Blue Danube', composer: 'Strauss II', origin: 'classic',
  difficulty: 4, teaches: 'Wide arpeggios, a waltz, and the space between phrases.',
  bpm: 120, beatsPerBar: 3, root: D4, scaleId: 'ionian', pass: 0.67,
  accompaniment: 'waltz', voiceId: 'solo-string', bedVoiceId: 'strings',
  melody: line(DANUBE), chords: progression(DANUBE_CHORDS),
};

// First strain, original bars 5–20, in eighth-note beats. The last two
// sixteenths of the introduction supply a one-eighth pickup. Ties are single
// targets spanning the bar, never artificial re-strikes. Upper doublings are
// folded down an octave; this preserves the chromatic line in a 15-key span.
const RAG_OPEN: Step[] = [
  [E4, 0.5], [C5, 1], [E4, 0.5], [C5, 1], [E4, 0.5], [C5, 3],
  [C5, 0.5], [D5, 0.5], [Ds5, 0.5],
  [E5, 0.5], [C5, 0.5], [D5, 0.5], [E5, 1], [B4, 0.5], [D5, 1],
  [C5, 3], [D4, 0.5], [Ds4, 0.5],
];
const RAG_MIDDLE: Step[] = [
  [E4, 0.5], [C5, 1], [E4, 0.5], [C5, 1], [E4, 0.5], [C5, 3.5],
  [A4, 0.5], [G4, 0.5],
  [Fs4, 0.5], [A4, 0.5], [C5, 0.5], [E5, 1], [D5, 0.5], [C5, 0.5], [A4, 0.5],
  [D5, 3], [D4, 0.5], [Ds4, 0.5],
];
const RAG_RETURN: Step[] = [
  ...RAG_OPEN.slice(0, -3), [C5, 3], [C5, 0.5], [D5, 0.5],
];
const RAG_RUN: Step[] = [
  [E5, 0.5], [C5, 0.5], [D5, 0.5], [E5, 1], [C5, 0.5], [D5, 0.5], [C5, 0.5],
  [E5, 0.5], [C5, 0.5], [D5, 0.5], [E5, 1], [C5, 0.5], [D5, 0.5], [C5, 0.5],
  [E5, 0.5], [C5, 0.5], [D5, 0.5], [E5, 1], [B4, 0.5], [D5, 1],
];
const RAG_CHORDS: ChordStep[] = [
  [0, 'maj', 3], [0, 'dom7', 1], [3, 'maj', 2], [0, 'maj', 2],
  [0, 'maj', 2], [4, 'dom7', 2], [0, 'maj', 3], [4, 'dom7', 1],
  [0, 'maj', 3], [0, 'dom7', 1], [3, 'maj', 2], [0, 'maj', 2],
  [1, 'dom7', 4], [4, 'dom7', 4],
  [0, 'maj', 3], [0, 'dom7', 1], [3, 'maj', 2], [0, 'maj', 2],
  [0, 'maj', 2], [4, 'dom7', 2], [0, 'maj', 4],
  [0, 'dom7', 4], [3, 'maj', 2], [3, 'min', 2],
  [0, 'maj', 2], [4, 'dom7', 2], [0, 'maj', 4],
];

export const THE_ENTERTAINER: Tune = {
  id: 'the-entertainer', title: 'The Entertainer', composer: 'Joplin', origin: 'classic',
  difficulty: 5, teaches: 'Chromatic pickups and syncopated notes tied across the beat.',
  bpm: 120, beatsPerBar: 4, pickup: 1, root: C4, scaleId: 'ionian', pass: 0.7,
  // C7, D7 and F minor introduce B-flat, F-sharp and A-flat respectively.
  borrows: [10, 6, 8],
  accompaniment: 'march', voiceId: 'felt-piano', bedVoiceId: 'bed-felt-piano',
  melody: line([
    [D4, 0.5], [Ds4, 0.5],
    ...RAG_OPEN, ...RAG_MIDDLE, ...RAG_RETURN, ...RAG_RUN,
    [C5, 3], [D4, 0.5], [Ds4, 0.5],
    ...RAG_OPEN, ...RAG_MIDDLE, ...RAG_RETURN, ...RAG_RUN, [C5, 4],
  ]),
  chords: progression([[4, 'dom7', 1], ...RAG_CHORDS, ...RAG_CHORDS]),
};

export const FAMILIAR_TUNES: Tune[] = [FRERE_JACQUES, DRUNKEN_SAILOR, CAN_CAN, BLUE_DANUBE, THE_ENTERTAINER];
