import type { BassStyle } from '../../audio/bed';
import type { CompPart, CompPattern } from '../../audio/comp';
import type { VoicingStyle } from '../../audio/music';
import type { Intensity } from '../../game/intensity';

/** What the bed and the rhythm box play at one intensity. */
export interface Rung {
  pattern: CompPattern;
  parts: readonly CompPart[];
  /** A `PATTERNS` id, or null for no drums at all. */
  drums: string | null;
  /** The rhythm box's level, faded to rather than switched. */
  level: number;
  /** How the chords are laid out, how much colour they take from the key, and how the bass moves. */
  voicing: VoicingStyle;
  colour: number;
  bass: BassStyle;
}

/**
 * The accompaniment, rung by rung. Indexed by intensity.
 *
 * The bottom rung is exactly the bed the table has always had — a sustained
 * chord over its root, close-voiced, no colour, and no drums — so a ball
 * waiting at the serve sounds as it did. The rungs above keep the same
 * harmony and change only how it is played, which is what lets a rally build
 * without the key ever moving under the player: the chords are led, then
 * opened, then spread like a left hand; a seventh arrives, then a ninth; the
 * bass starts to walk. The drums come in the same way: a kick alone under
 * the pulse, the gentlest backbeat under the broken chords, a plain full kit
 * at the top. All three are sixteen steps of four, so the grid never has to
 * be retaken.
 */
export const LADDER: readonly Rung[] = [
  {
    pattern: 'sustain', parts: ['chord', 'bass'], drums: null, level: 0,
    voicing: 'close', colour: 0, bass: 'root',
  },
  {
    pattern: 'pulse', parts: ['chord', 'bass', 'wash'], drums: 'heartbeat', level: 0.35,
    voicing: 'led', colour: 0.5, bass: 'root',
  },
  {
    pattern: 'broken', parts: ['chord', 'bass', 'wash'], drums: 'ballad', level: 0.5,
    voicing: 'open', colour: 0.5, bass: 'walk',
  },
  {
    pattern: 'arpeggio', parts: ['chord', 'bass', 'wash'], drums: 'rock', level: 0.7,
    voicing: 'spread', colour: 1, bass: 'walk',
  },
];

export const rungFor = (level: Intensity): Rung => LADDER[level] ?? LADDER[0];
