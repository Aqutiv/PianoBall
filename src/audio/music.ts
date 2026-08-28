import { pitchClass } from '../midi/notes';
import type { ChordQuality } from '../game/table/schema';

export const SCALES = {
  minorPentatonic: [0, 3, 5, 7, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
} as const;

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
