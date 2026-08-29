import { pitchClass } from '../midi/notes';
import type { ChordQuality } from '../game/table/schema';

export const SCALES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
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
    id: 'ionian',
    label: 'major',
    scale: [...SCALES.ionian],
    progression: [
      { degree: 0, quality: 'maj' },
      { degree: 4, quality: 'maj' },
      { degree: 5, quality: 'min' },
      { degree: 3, quality: 'maj' },
      { degree: 0, quality: 'maj' },
      { degree: 3, quality: 'maj' },
      { degree: 1, quality: 'min' },
      { degree: 4, quality: 'dom7' },
    ],
  },
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

/** A chord shape, written as intervals above its own root. */
interface ChordShape {
  /** Printed after the root name. Major is bare, as musicians write it. */
  name: string;
  /** Core tones, including the root at 0. */
  intervals: number[];
  /**
   * Whether extensions may stack on it.
   *
   * Extended harmony is built on a seventh: a triad can take one added note —
   * that is what `add9` and `6/9` are — but a triad carrying two or more
   * tensions is a handful of notes with a name forced onto it.
   */
  stackable: boolean;
  /** Nudge for the shape that should win an otherwise exact tie. */
  weight: number;
}

/**
 * The vocabulary.
 *
 * Ordered loosely by how often each turns up, though `weight` rather than
 * position is what settles a tie. Everything beyond these is reached by adding
 * tensions to one of them rather than by adding another entry: a thirteenth is
 * a dominant seventh with two notes on top, not a shape of its own.
 */
const SHAPES: ChordShape[] = [
  { name: '', intervals: [0, 4, 7], stackable: false, weight: 3 },
  { name: 'min', intervals: [0, 3, 7], stackable: false, weight: 3 },
  { name: 'maj7', intervals: [0, 4, 7, 11], stackable: true, weight: 3 },
  { name: 'min7', intervals: [0, 3, 7, 10], stackable: true, weight: 3 },
  { name: '7', intervals: [0, 4, 7, 10], stackable: true, weight: 3 },
  { name: 'sus4', intervals: [0, 5, 7], stackable: false, weight: 2 },
  { name: 'sus2', intervals: [0, 2, 7], stackable: false, weight: 1 },
  { name: '6', intervals: [0, 4, 7, 9], stackable: false, weight: 2 },
  { name: 'min6', intervals: [0, 3, 7, 9], stackable: false, weight: 2 },
  { name: '7sus4', intervals: [0, 5, 7, 10], stackable: true, weight: 2 },
  { name: 'min7b5', intervals: [0, 3, 6, 10], stackable: true, weight: 2 },
  { name: 'dim', intervals: [0, 3, 6], stackable: false, weight: 1 },
  { name: 'dim7', intervals: [0, 3, 6, 9], stackable: true, weight: 1 },
  { name: 'minMaj7', intervals: [0, 3, 7, 11], stackable: true, weight: 1 },
  { name: '7#5', intervals: [0, 4, 8, 10], stackable: true, weight: 1 },
  { name: 'aug', intervals: [0, 4, 8], stackable: false, weight: 0 },
  { name: 'maj7#5', intervals: [0, 4, 8, 11], stackable: true, weight: 0 },
];

/**
 * Notes that colour a chord rather than change which chord it is.
 *
 * Anything outside this list appearing on top of a shape means the shape is
 * simply the wrong one, so the match is thrown away rather than explained.
 */
const TENSIONS: Record<number, string> = {
  1: 'b9', 2: '9', 3: '#9', 5: '11', 6: '#11', 8: 'b13', 9: '13',
};

/**
 * Most notes a shape may carry on top of itself.
 *
 * Three, because a full thirteenth chord is a seventh with a ninth, an
 * eleventh and a thirteenth stacked above it. What keeps that from also
 * admitting clusters is the adjacency rule below rather than the count.
 */
const MAX_TENSIONS = 3;

/** The natural stack. A chord is named for the highest step it reaches. */
const NATURAL_STACK = ['9', '11', '13'];

/**
 * Weakest explanation worth asserting.
 *
 * A reading that is missing a chord tone *and* carrying tensions *and* does not
 * own the bass is a guess, and it will still win if it is the only match — so
 * there has to be a point below which no name beats a bad one. Twelve sits
 * between such a guess (nine, for a gapped shape with two tensions and no bass)
 * and the thinnest real voicing (fifteen, for a ninth chord with the fifth left
 * out and the third in the bass).
 */
const MIN_SCORE = 12;

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Conventional single names for a shape once a ninth is stacked on it. */
function withNinth(shape: string): string {
  switch (shape) {
    case '7': return '9';
    case 'min7': return 'min9';
    case 'maj7': return 'maj9';
    case '6': return '6/9';
    case '': return 'add9';
    default: return `${shape}(add9)`;
  }
}

function suffixFor(shape: string, tensions: readonly string[]): string {
  if (!tensions.length) return shape;
  if (shape === 'maj7' && tensions.join(' ') === '9 #11') return 'maj9#11';
  // A ninth, an eleventh and a thirteenth stack: reaching the thirteenth is
  // called a thirteenth chord, not a seventh with three things bolted on. The
  // stack has to start at the ninth — a lone eleventh is an added note.
  if (tensions[0] === '9' && tensions.every((t) => NATURAL_STACK.includes(t))) {
    const top = tensions[tensions.length - 1];
    if (top === '9') return withNinth(shape);
    if (shape === '7') return top;
    if (shape === 'min7') return `min${top}`;
    if (shape === 'maj7') return `maj${top}`;
  }
  return `${shape}(${tensions.join(',')})`;
}

/**
 * Name a set of simultaneously held notes.
 *
 * Every sounding pitch class is tried as the root against every shape, and the
 * best explanation wins rather than the first one found. Three things decide
 * "best": how much of the shape is actually present, how much is left over, and
 * whether the root is the note in the bass — which is what separates C6 from
 * Amin7, and which of a diminished seventh's four identical faces is the one
 * being played.
 *
 * A fifth may be missing, because leaving it out is a voicing rather than a
 * different chord; nothing else may be. Notes above the shape are named as
 * tensions, so a ninth or a sharp eleventh colours the name instead of
 * defeating it.
 *
 * Returns null when the notes do not form a recognised chord.
 */
export function identifyChord(notes: readonly number[]): string | null {
  const pcs = [...new Set(notes.map(pitchClass))].sort((a, b) => a - b);
  if (pcs.length < 3) return null;
  const bass = pitchClass(Math.min(...notes));

  let best: { score: number; root: number; shape: string; tensions: string[] } | null = null;
  for (const root of pcs) {
    const rel = new Set(pcs.map((p) => ((p - root) % 12 + 12) % 12));
    for (const shape of SHAPES) {
      const missing = shape.intervals.filter((i) => !rel.has(i));
      // The perfect fifth is the only tone a voicing may drop. An altered fifth
      // is what makes the chord what it is, and is never optional.
      if (missing.length > 1 || (missing.length === 1 && missing[0] !== 7)) continue;
      const matched = shape.intervals.length - missing.length;
      if (matched < 3) continue;

      const extras = [...rel].filter((i) => !shape.intervals.includes(i)).sort((a, b) => a - b);
      if (extras.length > MAX_TENSIONS) continue;
      if (extras.some((i) => TENSIONS[i] === undefined)) continue;
      // Two tensions a semitone apart are a cluster, not a stack: a chord has
      // a flat ninth or a natural ninth, never both.
      if (extras.some((i, k) => k > 0 && i - extras[k - 1] === 1)) continue;
      if (extras.length > 1 && !shape.stackable) continue;

      // Order of precedence, and the reason for these numbers: a complete
      // shape beats an incomplete one even when the incomplete one owns the
      // bass, so the missing-tone penalty has to outweigh the bass bonus.
      // Between two complete readings, the bass decides.
      const score = matched * 10
        - missing.length * 14
        - extras.length * 4
        + (root === bass ? 12 : 0)
        + shape.weight;
      if (score < MIN_SCORE) continue;
      if (!best || score > best.score) {
        best = { score, root, shape: shape.name, tensions: extras.map((i) => TENSIONS[i]) };
      }
    }
  }
  if (!best) return null;
  return NAMES[best.root] + suffixFor(best.shape, best.tensions);
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
