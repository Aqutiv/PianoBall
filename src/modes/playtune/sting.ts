import type { Sting, StingNote } from '../../audio/sting';

/**
 * How a finished tune sounds when the dial lands.
 *
 * Pure, so what the screen says musically can be argued with in a test rather
 * than only by ear. The mode supplies the tonic and the tempo; nothing here
 * touches the graph.
 */

export type Outcome = 'best' | 'pass' | 'short';

/**
 * The third of the tune's own mode, asked for by interval rather than by index.
 *
 * The scale arrays are degree-indexed only for the seven-note modes:
 * `minorPentatonic[2]` is 5, a fourth, and a cadence built on it would resolve
 * onto the wrong note in exactly the tunes whose scale is most audible.
 */
function thirdOf(scale: readonly number[]): number {
  return scale.includes(4) ? 4 : 3;
}

/**
 * A cadence in the tune's own key, an octave above its tonic.
 *
 * An octave up because the last note of the tune may still be ringing under the
 * player's hand — `finish` leaves the tune's instruments loaded on purpose, so
 * this comes out in the voice they have just been playing, and it should sit
 * over that rather than in the middle of it.
 *
 * What changes with the outcome is how far the figure gets. A pass climbs to
 * the octave and stops there, resolved. A new best goes one degree further, and
 * is heard as more without being told it is. A run that fell short turns around
 * and comes down onto the third — no resolution, and dulling as it falls, which
 * is deflating without being punitive. That distinction is the mode's whole
 * argument: a tune played is worth having played, and the screen should not
 * tell someone who got to the end of Canon in D that they achieved nothing.
 */
export function tuneSting(
  tonic: number,
  scale: readonly number[],
  beatSeconds: number,
  outcome: Outcome,
): Sting {
  const third = thirdOf(scale);
  const root = tonic + 12;
  // Half a beat apart, so a quick tune's cadence is quick and a slow one's has
  // room. Bounded either way: this is a punctuation mark, not a coda.
  const step = Math.min(0.2, Math.max(0.1, beatSeconds / 2));

  const rising = (degrees: number[], gains: number[], brights: number[]): StingNote[] =>
    degrees.map((d, i) => ({
      note: root + d,
      at: i * step,
      gain: gains[i],
      // Spread as it climbs, so the figure opens out rather than arriving in a
      // single spot.
      pan: (i / Math.max(1, degrees.length - 1) - 0.5) * 0.8,
      bright: brights[i],
    }));

  if (outcome === 'best') {
    return {
      notes: rising(
        [0, third, 7, 12, 16],
        [0.3, 0.28, 0.28, 0.32, 0.34],
        [0.75, 0.75, 0.8, 0.88, 0.95],
      ),
    };
  }
  if (outcome === 'pass') {
    return {
      notes: rising([0, third, 7, 12], [0.3, 0.28, 0.28, 0.34], [0.75, 0.75, 0.8, 0.9]),
    };
  }
  return {
    notes: rising([12, 7, third], [0.24, 0.22, 0.2], [0.6, 0.48, 0.34]),
  };
}
