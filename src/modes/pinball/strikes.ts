import type { DrumVoice } from '../../audio/drums';
import type { TableElement } from '../../game/table/schema';

/** How a family of elements sounds when the ball strikes it. */
export interface Strike {
  /** A pitched body at the element's own note. `bright` also sets the decay. */
  mallet?: { gain: number; bright: number };
  /** An unpitched body. Two voices are chosen between by which side of the table the hit was on. */
  drum?: { voices: readonly DrumVoice[]; gain: number };
  /** Hits after the first, for a spinner. How many follows how hard it is spinning. */
  roll?: { voice: DrumVoice; gain: number; perSpin: number; max: number; gap: number };
}

/**
 * The table as a band.
 *
 * Every element used to be the same mallet at one of two brightnesses, which
 * made a rally a run of the same sound at different pitches. Each family now
 * has a body of its own: the slings are the kick and the tom, the spinners a
 * shaker with a hat rolling behind them, the lanes under the dome bells, the
 * targets plucks. The bumpers keep the mallet they always had, because that
 * *is* the sound of the table and everything else is placed around it.
 *
 * Keyed by group first and kind second, so that a rollover under the dome and
 * one in the arc can differ, while anything with no entry of its own — a post
 * — stays silent.
 */
export const STRIKES: Record<string, Strike> = {
  bumper: { mallet: { gain: 1, bright: 0.45 } },
  sling: { drum: { voices: ['kick', 'tomLo'], gain: 0.9 }, mallet: { gain: 0.3, bright: 0.15 } },
  target: { mallet: { gain: 0.9, bright: 0.12 } },
  rollover: { mallet: { gain: 0.7, bright: 0.4 } },
  lanes: { mallet: { gain: 0.8, bright: 1 } },
  spinner: {
    drum: { voices: ['shaker'], gain: 0.6 },
    mallet: { gain: 0.3, bright: 0.6 },
    roll: { voice: 'hat', gain: 0.5, perSpin: 0.25, max: 6, gap: 0.055 },
  },
};

export function strikeFor(el: TableElement): Strike | undefined {
  return STRIKES[el.group ?? ''] ?? STRIKES[el.kind];
}
