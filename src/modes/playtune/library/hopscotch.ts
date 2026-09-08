import type { ChartNote, Tune } from '../chart';
import { line, progression, R } from './notation';

const D = 62, E = 64, F = 65, G = 67, A = 69, B = 71, C = 72;

/**
 * A small Dorian dance: a three-note call, a held answer, then a brighter lift.
 * The hands stay on whole beats; the drummer supplies the offbeats. Repeated
 * calls and a one-octave range leave room to learn the two- and three-beat tails.
 */
export const HOPSCOTCH: Tune = {
  id: 'hopscotch',
  title: 'Hopscotch',
  composer: 'PianoBall',
  origin: 'original',
  difficulty: 2,
  teaches: 'A playful hook: hold the answers while the beat keeps bouncing.',
  bpm: 84,
  beatsPerBar: 4,
  root: D,
  scaleId: 'dorian',
  accompaniment: 'pulse',
  voiceId: 'electric-piano',
  bedVoiceId: 'bed-felt-piano',
  pass: 0.6,
  melody: line([
    // A: the D-F-A call; B natural opens the minor colour into Dorian.
    [D, 2], [F, 1], [A, 1],
    [F, 2], [R, 1], [E, 1],
    [G, 2], [B, 2],
    [A, 2], [G, 1], [R, 1],
    // A': the same call gets a warmer answer and comes home for a breath.
    [D, 2], [F, 1], [A, 1],
    [A, 2], [R, 1], [F, 1],
    [B, 2], [A, 1], [G, 1],
    [E, 2], [D, 1], [R, 1],
    // B: one high C is the summit; longer pairs give the hook some space.
    [C, 2], [A, 2],
    [G, 3], [E, 1],
    [B, 2], [A, 2],
    [E, 2], [G, 1], [R, 1],
    // A returns with a short-short-long echo, then a descending goodbye.
    [D, 1], [F, 1], [A, 2],
    [B, 3], [A, 1],
    [G, 2], [E, 2],
    [D, 4],
  ]),
  chords: progression([
    [0, 'min7', 4], [0, 'min7', 4], [3, 'dom7', 4], [6, 'maj', 4],
    [0, 'min7', 4], [2, 'maj', 4], [3, 'dom7', 4], [0, 'min7', 4],
    [2, 'maj', 4], [6, 'maj', 4], [3, 'maj', 4], [4, 'min7', 4],
    [0, 'min7', 4], [3, 'maj', 4], [6, 'maj', 4], [0, 'min7', 4],
  ]),
  rhythm: {
    sections: [
      { beat: 0, len: 28, patternId: 'pop', gain: 0.28 },
      { beat: 32, len: 16, patternId: 'offbeat', gain: 0.25 },
      { beat: 48, len: 12, patternId: 'pop', gain: 0.3 },
    ],
    hits: [
      // Light replies occupy the held-answer rests, below the melody.
      { beat: 6, voice: 'rim', gain: 0.2 },
      { beat: 22, voice: 'rim', gain: 0.2 },
      { beat: 28, voice: 'kick', gain: 0.3 },
      { beat: 29, voice: 'rim', gain: 0.23 },
      { beat: 30, voice: 'snare', gain: 0.24 },
      { beat: 30.5, voice: 'tomHi', gain: 0.2 },
      { beat: 31, voice: 'tomLo', gain: 0.25 },
      { beat: 60, voice: 'kick', gain: 0.34 },
      { beat: 60, voice: 'clap', gain: 0.22 },
      { beat: 60, voice: 'hat', gain: 0.16 },
    ],
  },
};

// Bass on one, compact chord on three or a cheeky delayed answer on four. The exact same notes are played by the
// game in PlayTune and learned by the player in Play Backing. Explicit voicings
// retain Dorian's B and the sevenths without asking a hand to span an octave.
const VOICINGS: readonly (readonly [bass: number, answer: readonly number[]])[] = [
  [50, [53, 57, 60]], [50, [53, 57, 60]], [55, [53, 59, 62]], [48, [52, 55, 60]],
  [50, [53, 57, 60]], [53, [57, 60, 65]], [55, [53, 59, 62]], [50, [50, 53, 60]],
  [53, [57, 60, 65]], [48, [52, 55, 60]], [55, [55, 59, 62]], [57, [57, 60, 67]],
  [50, [53, 57, 60]], [55, [55, 59, 62]], [48, [52, 55, 60]], [50, [50, 53, 60]],
];

HOPSCOTCH.backingNotes = VOICINGS.flatMap(([bass, answer], bar): ChartNote[] => {
  const beat = bar * 4;
  // Let the drummer answer at the halfway breath, then land the last chord
  // together with the melody. Neither cadence asks for a late extra attack.
  if (bar === 7 || bar === 15) {
    return answer.map(note => ({ beat, len: bar === 15 ? 4 : 3, note }));
  }
  const delayed = bar === 1 || bar === 5 || bar === 13;
  return [
    { beat, len: 1.75, note: bass },
    ...answer.map(note => ({ beat: beat + (delayed ? 3 : 2), len: delayed ? 0.85 : 1.75, note })),
  ];
});
