import type { ChordQuality } from '../../../game/table/schema';
import type { ChartChord, ChartNote } from '../chart';

/** A rest, in a `line`. */
export const R = null;

/** `[note or rest, length in beats]`, laid end to end. */
export type Step = readonly [number | null, number];

/**
 * Write a melody as durations rather than as beat numbers.
 *
 * Hand-computing every onset is exactly the kind of arithmetic that produces a
 * chart which is subtly wrong in bar nine, so the beats are derived instead.
 */
export function line(steps: readonly Step[], start = 0): ChartNote[] {
  const out: ChartNote[] = [];
  let beat = start;
  for (const [note, len] of steps) {
    if (note !== null) out.push({ beat, len, note });
    beat += len;
  }
  return out;
}

/**
 * `[degree, quality, length in beats]`, laid end to end.
 *
 * Lengths rather than bars, and deliberately so. There used to be a `bars`
 * helper that laid one chord per bar, and every tune in the library used it —
 * which meant no tune ever changed harmony inside a bar, and the ones in six
 * and nine changed it once every few seconds. Writing the length out forces the
 * question of where the harmony actually moves.
 */
export type ChordStep = readonly [number, ChordQuality, number];

export function progression(steps: readonly ChordStep[], start = 0): ChartChord[] {
  const out: ChartChord[] = [];
  let beat = start;
  for (const [degree, quality, len] of steps) {
    out.push({ beat, len, degree, quality });
    beat += len;
  }
  return out;
}

/** Everything moved later by `beats`. */
export function shift<T extends { beat: number }>(items: readonly T[], beats: number): T[] {
  return items.map((n) => ({ ...n, beat: n.beat + beats }));
}

/** Melodies sounding together, merged into one sorted chart. */
export function merge(...groups: readonly ChartNote[][]): ChartNote[] {
  return groups.flat().sort((a, b) => a.beat - b.beat || a.note - b.note);
}

/** A second voice a fixed interval under (or over) the given notes. */
export function harmonise(notes: readonly ChartNote[], semitones: number): ChartNote[] {
  return notes.map((n) => ({ ...n, note: n.note + semitones }));
}
