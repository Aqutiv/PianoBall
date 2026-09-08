import type { Tune } from '../chart';
import { melodyPerformance as perform } from './performanceNotation';
import { line, progression, R, type Step, type ChordStep } from './notation';
import { JACQUES_BACKING, SAILOR_BACKING, GALOP_BACKING, DANUBE_BACKING, RAG_BACKING } from './familiarBacking';

/**
 * Short reductions of historical tunes. Sources, editions, beat units and
 * editorial choices are recorded in docs/tune-sources.md. These are authored
 * notes and harmony, played by the synth; no recordings or MIDI files ship.
 */
const C4 = 60, Cs4 = 61, D4 = 62, Ds4 = 63, E4 = 64, F4 = 65, Fs4 = 66;
const G3 = 55, G4 = 67, A4 = 69, B4 = 71;
const C5 = 72, D5 = 74, Ds5 = 75, E5 = 76, F5 = 77, Fs5 = 78;
const G5 = 79, A5 = 81, B5 = 83, C6 = 84;
const Gs5 = 80, D6 = 86, Fs6 = 90;

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
  melody: perform(line([...JACQUES, ...JACQUES]),
    [[0, .82], [8, .94], [16, 1], [30, .7], [32, .86], [48, .98], [62, .68]]),
  chords: progression([...JACQUES_CHORDS, ...JACQUES_CHORDS]),
  backingNotes: JACQUES_BACKING,
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
  melody: perform(line([...SAILOR, ...SAILOR]),
    [[0, .85], [20, .96], [30, .74], [32, .96], [52, 1], [62, .78], [64, .86], [84, .98], [94, .74], [96, .98], [116, 1], [126, .72]], .9)
    // The Backing role uses a fast-decaying nylon melody; balance it locally.
    .map(n => ({ ...n, gain: n.gain! * 2 })),
  chords: progression([...SAILOR_HARMONY, ...SAILOR_HARMONY, ...SAILOR_HARMONY, ...SAILOR_HARMONY]),
  backingNotes: SAILOR_BACKING,
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
  accompaniment: 'march', voiceId: 'grand', bedVoiceId: 'bed-felt-piano',
  // Four complete eight-bar refrains, each resolving onto the tonic harmony.
  melody: perform(line([...GALOP, ...GALOP, ...GALOP, ...GALOP]),
    [[0, .8], [8, .94], [30, .74], [32, .9], [40, 1], [62, .8], [64, .84], [72, .96], [94, .76], [96, .94], [104, 1], [126, .78]], .78),
  chords: progression([...GALOP_CHORDS, ...GALOP_CHORDS, ...GALOP_CHORDS, ...GALOP_CHORDS]),
  backingNotes: GALOP_BACKING,
};

// Spina 1867, printed p.4: first waltz, both phrases. The lead-in is a
// complete bar; grace notes and chord/octave doublings are omitted. Preserve
// the upper melody's pitch classes and phrase contour. The final held tonic alone
// is an editorial close, in place of continuing into the second waltz.
const DANUBE: Step[] = [
  [D4, 1], [Fs4, 1], [A4, 1], [A4, 1], [R, 1], [A5, 1],
  [A5, 1], [R, 1], [Fs5, 1], [Fs5, 1], [R, 1], [D4, 1],
  [D4, 1], [Fs4, 1], [A4, 1], [A4, 1], [R, 1], [A5, 1],
  [A5, 1], [R, 1], [G5, 1], [G5, 1], [R, 1], [Cs4, 1],
  [Cs4, 1], [E4, 1], [B4, 1], [B4, 1], [R, 1], [B5, 1],
  [B5, 1], [R, 1], [G5, 1], [G5, 1], [R, 1], [Cs4, 1],
  [Cs4, 1], [E4, 1], [B4, 1], [B4, 1], [R, 1], [B5, 1],
  [B5, 1], [R, 1], [Fs5, 1], [Fs5, 1], [R, 1], [D4, 1],

  [D4, 1], [Fs4, 1], [A4, 1], [D5, 1], [R, 1], [D6, 1],
  [D6, 1], [R, 1], [A5, 1], [A5, 1], [R, 1], [D4, 1],
  [D4, 1], [Fs4, 1], [A4, 1], [D5, 1], [R, 1], [D6, 1],
  [D6, 1], [R, 1], [B5, 1], [B5, 1], [R, 1], [E5, 1],
  [E5, 1], [G5, 1], [B5, 0.5], [R, 0.5], [B5, 4],
  [Gs5, 1], [A5, 1], [Fs6, 4], [D6, 1], [Fs5, 1],
  [Fs5, 2], [E5, 1], [B5, 2], [A5, 1], [D5, 3],
];
const DANUBE_CHORDS: ChordStep[] = [
  [0, 'maj', 3], [0, 'maj', 3], [0, 'maj', 3], [0, 'maj', 3],
  [0, 'maj', 3], [4, 'dom7', 3], [4, 'dom7', 3], [4, 'dom7', 3],
  [4, 'dom7', 3], [4, 'dom7', 3], [4, 'dom7', 3], [4, 'dom7', 3],
  [4, 'dom7', 3], [0, 'maj', 3], [0, 'maj', 3], [0, 'maj', 3],
  [0, 'maj', 3], [0, 'maj', 3], [0, 'maj', 3], [0, 'maj', 3],
  [0, 'maj', 3], [1, 'min7', 3], [1, 'min7', 3], [1, 'min7', 3],
  [1, 'min7', 3], [4, 'dom7', 3], [4, 'dom7', 3], [0, 'maj', 3],
  [0, 'maj', 3], [1, 'min7', 3], [4, 'dom7', 3], [0, 'maj', 3],
];

export const BLUE_DANUBE: Tune = {
  id: 'blue-danube', title: 'The Blue Danube', composer: 'Strauss II', origin: 'classic',
  difficulty: 4, teaches: 'Wide arpeggios, a waltz, and the space between phrases.',
  bpm: 120, beatsPerBar: 3, root: D4, scaleId: 'ionian', borrows: [6], pass: 0.67,
  accompaniment: 'waltz', voiceId: 'felt-piano', bedVoiceId: 'bed-felt-piano',
  // Lower complete upper responses/cadence by an octave, rather than folding
  // individual peaks: their internal contour stays intact on a 25-key board.
  // The two D-F#-A lead-ins at beats48 and60 retain their original register.
  melody: perform(line(DANUBE).map(n => (n.beat >= 51 && n.beat < 59) || n.beat >= 63
    ? { ...n, note: n.note - 12 } : n),
    [[0, .72], [5, .88], [17, .84], [29, .94], [45, .72], [48, .8], [56, .92], [65, .96], [75, 1], [87, .88], [93, .7]], .82),
  chords: progression(DANUBE_CHORDS),
  backingNotes: DANUBE_BACKING,
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
  // C7, D7 and F minor, plus E-flat in the source's descending bass.
  borrows: [10, 6, 8, 3],
  accompaniment: 'march', voiceId: 'felt-piano', bedVoiceId: 'bed-felt-piano',
  melody: perform(line([
    [D4, 0.5], [Ds4, 0.5],
    ...RAG_OPEN, ...RAG_MIDDLE, ...RAG_RETURN, ...RAG_RUN,
    [C5, 3], [D4, 0.5], [Ds4, 0.5],
    ...RAG_OPEN, ...RAG_MIDDLE, ...RAG_RETURN, ...RAG_RUN, [C5, 4],
  ]), [[0, .76], [9, .94], [17, .84], [29, 1], [45, .92], [61, .74], [65, .84], [81, .94], [93, 1], [113, .9], [125, .72]], .88),
  chords: progression([[4, 'dom7', 1], ...RAG_CHORDS, ...RAG_CHORDS]),
  backingNotes: RAG_BACKING,
};

export const FAMILIAR_TUNES: Tune[] = [FRERE_JACQUES, DRUNKEN_SAILOR, CAN_CAN, BLUE_DANUBE, THE_ENTERTAINER];
