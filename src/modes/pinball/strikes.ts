import type { DrumVoice } from '../../audio/drums';
import type { MechName } from '../../audio/surfaces';
import type { TableElement } from '../../game/table/schema';

/** How a family of elements sounds when the ball strikes it. */
export interface Strike {
  /** A pitched body at the element's own note. `bright` also sets the decay. */
  mallet?: { gain: number; bright: number };
  /** An unpitched body. Two voices are chosen between by which side of the table the hit was on. */
  drum?: { voices: readonly DrumVoice[]; gain: number };
  /** The machine's own part in it: a solenoid firing under a bumper, a target dropping, a switch closing. */
  mech?: { name: MechName; gain: number };
  /** Ticks after the first, for a spinner. How many follows how hard it is spinning. */
  roll?: { mech: MechName; gain: number; perSpin: number; max: number; gap: number };
}

/**
 * The table as a band, and as a machine.
 *
 * Every element used to be the same mallet at one of two brightnesses, which
 * made a rally a run of the same sound at different pitches. Each family now
 * has a body of its own: the slings are the kick and the tom, the spinners a
 * shaker with a tick rolling behind them, the lanes under the dome bells, the
 * targets plucks. The bumpers keep the mallet they always had, because that
 * *is* the sound of the table and everything else is placed around it.
 *
 * Under the music is the machine: a coil fires under every bumper and sling,
 * a drop target falls, a switch closes under every rollover.
 *
 * Keyed by group first and kind second, so that a rollover under the dome and
 * one in the arc can differ, and the bank's targets can drop while a standup
 * only clicks, while anything with no entry of its own — a post — stays silent.
 */
export const STRIKES: Record<string, Strike> = {
  bumper: { mallet: { gain: 1, bright: 0.45 }, mech: { name: 'solenoid', gain: 0.8 } },
  sling: {
    drum: { voices: ['kick', 'tomLo'], gain: 0.9 },
    mallet: { gain: 0.3, bright: 0.15 },
    mech: { name: 'solenoid', gain: 0.9 },
  },
  bank: { mallet: { gain: 0.9, bright: 0.12 }, mech: { name: 'drop', gain: 0.8 } },
  target: { mallet: { gain: 0.9, bright: 0.12 }, mech: { name: 'switch', gain: 0.7 } },
  rollover: { mallet: { gain: 0.7, bright: 0.4 }, mech: { name: 'switch', gain: 0.6 } },
  lanes: { mallet: { gain: 0.8, bright: 1 }, mech: { name: 'switch', gain: 0.6 } },
  spinner: {
    drum: { voices: ['shaker'], gain: 0.6 },
    mallet: { gain: 0.3, bright: 0.6 },
    roll: { mech: 'spinner', gain: 0.5, perSpin: 0.25, max: 6, gap: 0.055 },
  },
};

export function strikeFor(el: TableElement): Strike | undefined {
  return STRIKES[el.group ?? ''] ?? STRIKES[el.kind];
}
