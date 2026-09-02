import type { CompPart, CompPattern } from '../../audio/comp';
import type { Intensity } from '../../game/intensity';

/** What the bed and the rhythm box play at one intensity. */
export interface Rung {
  pattern: CompPattern;
  parts: readonly CompPart[];
  /** A `PATTERNS` id, or null for no drums at all. */
  drums: string | null;
  /** The rhythm box's level, faded to rather than switched. */
  level: number;
}

/**
 * The accompaniment, rung by rung. Indexed by intensity.
 *
 * The bottom rung is exactly the bed the table has always had — a sustained
 * chord over its root, and no drums — so a ball waiting at the serve sounds as
 * it did. The rungs above keep the same harmony and change only how it is
 * played, which is what lets a rally build without the key ever moving under
 * the player. The drums come in the same way: a kick alone under the pulse,
 * the gentlest backbeat under the broken chords, a plain full kit at the top.
 * All three are sixteen steps of four, so the grid never has to be retaken.
 */
export const LADDER: readonly Rung[] = [
  { pattern: 'sustain', parts: ['chord', 'bass'], drums: null, level: 0 },
  { pattern: 'pulse', parts: ['chord', 'bass', 'wash'], drums: 'heartbeat', level: 0.35 },
  { pattern: 'broken', parts: ['chord', 'bass', 'wash'], drums: 'ballad', level: 0.5 },
  { pattern: 'arpeggio', parts: ['chord', 'bass', 'wash'], drums: 'rock', level: 0.7 },
];

export const rungFor = (level: Intensity): Rung => LADDER[level] ?? LADDER[0];
