/**
 * How much is happening on the table, on a scale the music can follow.
 *
 * The bed used to sound the same whether a ball was waiting at the serve or
 * four of them were loose in the bumpers. This reduces the state that measures
 * a rally — the combo, the resonance, the ball count — to one small number, so
 * that the accompaniment and the drums can be looked up from it rather than
 * argued about in the audio layer.
 *
 * Pure, and kept apart from the audio on purpose: the game is stepped headless
 * in tests, and what a level *sounds* like is a table in the pinball mode.
 */

export type Intensity = 0 | 1 | 2 | 3;

export interface IntensityInput {
  /** Only a ball in play can build anything: attract and the serve are quiet. */
  playing: boolean;
  combo: number;
  resonance: number;
  multiball: number;
}

/**
 * The rungs of the ladder, as the combo or the resonance it takes to stand on
 * each. Either path reaches every rung: a long rally and a musical one earn the
 * same accompaniment. Multiball is the top rung outright.
 */
export const RUNGS: readonly { combo: number; resonance: number }[] = [
  { combo: 2, resonance: 1.4 },
  { combo: 6, resonance: 2.0 },
  { combo: 12, resonance: 3.0 },
];

export function intensityOf(s: IntensityInput): Intensity {
  if (!s.playing) return 0;
  if (s.multiball > 1) return 3;
  let level = 0;
  for (const rung of RUNGS) {
    if (s.combo < rung.combo && s.resonance < rung.resonance) break;
    level++;
  }
  return level as Intensity;
}
