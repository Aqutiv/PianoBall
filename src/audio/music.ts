import { pitchClass } from '../midi/notes';
import type { ChordQuality } from '../game/table/schema';

export const SCALES = {
  minorPentatonic: [0, 3, 5, 7, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  blues: [0, 3, 5, 6, 7, 10],
  kumoi: [0, 2, 3, 7, 9],
} as const;

export type ScaleName = keyof typeof SCALES;

/** A scale plus a chord loop written in that scale's own degrees. */
export interface MusicMode {
  id: ScaleName;
  /** Bare mode name. The HUD prefixes the root: "D minor pentatonic". */
  label: string;
  scale: number[];
  progression: { degree: number; quality: ChordQuality }[];
}

/**
 * The characters a table can be played in.
 *
 * Degrees index each mode's own scale, so a progression written here follows
 * the mode wherever its root goes. Qualities are deliberately not all diatonic
 * — the colour of a chord tone from just outside the scale is the point.
 */
export const MODES: MusicMode[] = [
  {
    id: 'minorPentatonic',
    label: 'minor pentatonic',
    scale: [...SCALES.minorPentatonic],
    progression: [
      { degree: 0, quality: 'min' },
      { degree: 4, quality: 'maj' },
      { degree: 1, quality: 'maj' },
      { degree: 3, quality: 'min7' },
      { degree: 0, quality: 'min' },
      { degree: 2, quality: 'sus4' },
      { degree: 1, quality: 'maj' },
      { degree: 3, quality: 'min' },
    ],
  },
  {
    id: 'majorPentatonic',
    label: 'major pentatonic',
    scale: [...SCALES.majorPentatonic],
    progression: [
      { degree: 0, quality: 'maj' },
      { degree: 3, quality: 'maj' },
      { degree: 4, quality: 'min' },
      { degree: 2, quality: 'min' },
      { degree: 0, quality: 'maj' },
      { degree: 1, quality: 'sus4' },
      { degree: 3, quality: 'maj' },
      { degree: 4, quality: 'min7' },
    ],
  },
  {
    id: 'dorian',
    label: 'dorian',
    scale: [...SCALES.dorian],
    progression: [
      { degree: 0, quality: 'min' },
      { degree: 3, quality: 'maj' },
      { degree: 0, quality: 'min' },
      { degree: 6, quality: 'maj' },
      { degree: 2, quality: 'maj' },
      { degree: 3, quality: 'maj' },
      { degree: 4, quality: 'min7' },
      { degree: 6, quality: 'maj' },
    ],
  },
  {
    id: 'aeolian',
    label: 'natural minor',
    scale: [...SCALES.aeolian],
    progression: [
      { degree: 0, quality: 'min' },
      { degree: 5, quality: 'maj' },
      { degree: 2, quality: 'maj' },
      { degree: 6, quality: 'maj' },
      { degree: 3, quality: 'min' },
      { degree: 0, quality: 'min' },
      { degree: 5, quality: 'maj' },
      { degree: 4, quality: 'min' },
    ],
  },
  {
    id: 'lydian',
    label: 'lydian',
    scale: [...SCALES.lydian],
    progression: [
      { degree: 0, quality: 'maj7' },
      { degree: 1, quality: 'maj' },
      { degree: 0, quality: 'maj7' },
      { degree: 5, quality: 'min' },
      { degree: 4, quality: 'maj' },
      { degree: 1, quality: 'maj' },
      { degree: 2, quality: 'min' },
      { degree: 0, quality: 'maj7' },
    ],
  },
  {
    id: 'mixolydian',
    label: 'mixolydian',
    scale: [...SCALES.mixolydian],
    progression: [
      { degree: 0, quality: 'maj' },
      { degree: 6, quality: 'maj' },
      { degree: 3, quality: 'maj' },
      { degree: 0, quality: 'maj' },
      { degree: 4, quality: 'min' },
      { degree: 6, quality: 'maj' },
      { degree: 3, quality: 'maj' },
      { degree: 0, quality: 'dom7' },
    ],
  },
  {
    id: 'blues',
    label: 'blues',
    scale: [...SCALES.blues],
    progression: [
      { degree: 0, quality: 'min7' },
      { degree: 2, quality: 'min7' },
      { degree: 0, quality: 'min7' },
      { degree: 5, quality: 'maj' },
      { degree: 0, quality: 'min7' },
      { degree: 2, quality: 'min7' },
      { degree: 4, quality: 'dom7' },
      { degree: 0, quality: 'min7' },
    ],
  },
  {
    id: 'kumoi',
    label: 'kumoi',
    scale: [...SCALES.kumoi],
    progression: [
      { degree: 0, quality: 'min' },
      { degree: 1, quality: 'sus4' },
      { degree: 3, quality: 'min7' },
      { degree: 4, quality: 'dim' },
      { degree: 0, quality: 'min' },
      { degree: 2, quality: 'maj' },
      { degree: 1, quality: 'sus4' },
      { degree: 0, quality: 'min' },
    ],
  },
];

/** The mode a table or a saved preference names, or undefined if unknown. */
export function findMode(id: string): MusicMode | undefined {
  return MODES.find((m) => m.id === id);
}

/** The music a game is currently playing in: a mode placed at a root and tempo. */
export interface ActiveMusic {
  root: number;
  bpm: number;
  id: string;
  label: string;
  scale: number[];
  progression: { degree: number; quality: ChordQuality }[];
}

const CHORD_INTERVALS: Record<ChordQuality, number[]> = {
  min: [0, 3, 7],
  maj: [0, 4, 7],
  min7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  dom7: [0, 4, 7, 10],
  dim: [0, 3, 6],
};

/** Notes of a chord built on `root`, voiced upward from it. */
export function chordNotes(root: number, quality: ChordQuality): number[] {
  return CHORD_INTERVALS[quality].map((i) => root + i);
}

/**
 * Snap a note to the nearest scale tone, preserving its octave.
 * Assist mode runs every incoming note through this, which is why a beginner
 * mashing keys still produces something that sits in the table's key.
 */
export function snapToScale(note: number, root: number, scale: readonly number[]): number {
  // Search the neighbouring octaves as well as the note's own: comparing pitch
  // classes alone can pick a tone that is nearest by interval but an octave
  // away in absolute pitch.
  const baseOct = Math.floor((note - root) / 12);
  let best = note;
  let bestD = Infinity;
  for (let o = baseOct - 1; o <= baseOct + 1; o++) {
    for (const s of scale) {
      const cand = root + o * 12 + s;
      const d = Math.abs(cand - note);
      // Ties resolve downward: a quantiser that flattens surprises less than
      // one that sharpens.
      if (d < bestD || (d === bestD && cand < best)) { bestD = d; best = cand; }
    }
  }
  return best;
}

export function inScale(note: number, root: number, scale: readonly number[]): boolean {
  const rel = ((note - root) % 12 + 12) % 12;
  return scale.includes(rel);
}

/** Degree of the scale a note sits on, or -1. */
export function scaleDegree(note: number, root: number, scale: readonly number[]): number {
  return scale.indexOf(((note - root) % 12 + 12) % 12);
}

/** Nth scale tone above the root, wrapping into higher octaves. */
export function degreeToNote(degree: number, root: number, scale: readonly number[]): number {
  const n = scale.length;
  const oct = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return root + oct * 12 + scale[idx];
}

/**
 * Move a note from one scale into another, keeping its register rather than
 * its pitch.
 *
 * A table's features are tuned by hand as a contour — low slings, a rising
 * target bank, high rollovers — and that shape is the design, not the exact
 * semitones. So the note is read as a scale degree and the degree is rescaled
 * by the two scales' sizes, which keeps five targets five distinct pitches
 * even when a five-note scale becomes a seven-note one.
 */
export function retuneNote(
  note: number,
  fromRoot: number, fromScale: readonly number[],
  toRoot: number, toScale: readonly number[],
): number {
  const rel = note - fromRoot;
  const oct = Math.floor(rel / 12);
  const deg = fromScale.indexOf(rel - oct * 12);
  // A note the table tuned outside its own scale has no degree to carry over.
  if (deg < 0) return snapToScale(note - fromRoot + toRoot, toRoot, toScale);
  const abs = oct * fromScale.length + deg;
  return degreeToNote(Math.round(abs * (toScale.length / fromScale.length)), toRoot, toScale);
}

/**
 * Re-voice a chord to sit where the last one sat.
 *
 * The bed changes chord every couple of bars; in root position that is a leap
 * every time the progression moves by more than a step. Dropping each chord
 * tone into the octave nearest the previous voicing turns those leaps into
 * the small movements a keyboard player would actually make.
 */
export function voiceLead(prev: readonly number[], notes: readonly number[]): number[] {
  if (!prev.length || !notes.length) return [...notes];
  const centre = prev.reduce((a, b) => a + b, 0) / prev.length;
  // Folding by octave keeps the pitch classes exactly, so the chord is the
  // same chord — never further than a tritone from where the last one sat.
  return notes
    .map((n) => n + Math.round((centre - n) / 12) * 12)
    .sort((a, b) => a - b);
}

const TRIADS: { name: string; intervals: number[] }[] = [
  { name: 'maj', intervals: [0, 4, 7] },
  { name: 'min', intervals: [0, 3, 7] },
  { name: 'dim', intervals: [0, 3, 6] },
  { name: 'aug', intervals: [0, 4, 8] },
  { name: 'sus4', intervals: [0, 5, 7] },
  { name: 'sus2', intervals: [0, 2, 7] },
  { name: 'min7', intervals: [0, 3, 7, 10] },
  { name: 'maj7', intervals: [0, 4, 7, 11] },
  { name: 'dom7', intervals: [0, 4, 7, 10] },
];

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Name a set of simultaneously held notes, trying every inversion.
 * Returns null when the notes do not form a recognised chord.
 */
export function identifyChord(notes: readonly number[]): string | null {
  const pcs = [...new Set(notes.map(pitchClass))].sort((a, b) => a - b);
  if (pcs.length < 3) return null;
  for (let inv = 0; inv < pcs.length; inv++) {
    const root = pcs[inv];
    const rel = pcs.map((p) => ((p - root) % 12 + 12) % 12).sort((a, b) => a - b);
    for (const t of TRIADS) {
      if (t.intervals.length !== rel.length) continue;
      if (t.intervals.every((v, i) => v === rel[i])) return `${NAMES[root]}${t.name === 'maj' ? '' : t.name}`;
    }
  }
  return null;
}

/**
 * The beat grid.
 *
 * Impacts are never delayed to fit it — only the *bonus* is judged against it,
 * so the sound stays locked to what is on screen while still rewarding
 * playing in time.
 */
export class Groove {
  bpm: number;
  /** Subdivisions per beat that count as on-time. */
  division = 2;
  /** Half-width of the on-beat window, in seconds. */
  window = 0.08;
  /** Consecutive on-beat hits. */
  streak = 0;
  best = 0;

  constructor(bpm = 96) { this.bpm = bpm; }

  get beatSeconds(): number { return 60 / this.bpm; }
  get stepSeconds(): number { return this.beatSeconds / this.division; }

  /** Distance from `time` to the nearest subdivision, in seconds. */
  offsetAt(time: number): number {
    const step = this.stepSeconds;
    const phase = time / step;
    return (phase - Math.round(phase)) * step;
  }

  /** Judge a hit. Returns true when it landed on the grid. */
  judge(time: number): boolean {
    const on = Math.abs(this.offsetAt(time)) <= this.window;
    if (on) {
      this.streak++;
      if (this.streak > this.best) this.best = this.streak;
    } else {
      this.streak = 0;
    }
    return on;
  }

  /** Multiplier earned by the current streak. */
  get multiplier(): number {
    return 1 + Math.min(5, Math.floor(this.streak / 4));
  }

  reset(): void { this.streak = 0; }
}
