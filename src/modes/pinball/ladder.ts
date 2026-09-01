import type { CompPart, CompPattern } from '../../audio/comp';
import type { Intensity } from '../../game/intensity';

/** What the bed plays at one intensity. */
export interface Rung {
  pattern: CompPattern;
  parts: readonly CompPart[];
}

/**
 * The accompaniment, rung by rung. Indexed by intensity.
 *
 * The bottom rung is exactly the bed the table has always had — a sustained
 * chord over its root — so a ball waiting at the serve sounds as it did. The
 * rungs above keep the same harmony and change only how it is played, which is
 * what lets a rally build without the key ever moving under the player.
 */
export const LADDER: readonly Rung[] = [
  { pattern: 'sustain', parts: ['chord', 'bass'] },
  { pattern: 'pulse', parts: ['chord', 'bass', 'wash'] },
  { pattern: 'broken', parts: ['chord', 'bass', 'wash'] },
  { pattern: 'arpeggio', parts: ['chord', 'bass', 'wash'] },
];

export const rungFor = (level: Intensity): Rung => LADDER[level] ?? LADDER[0];
