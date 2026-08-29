import { load, save } from '../../core/storage';

const KEY = 'freestyleRhythm';

export interface RhythmSettings {
  /** Whether the box is running. Remembered, so it comes back as you left it. */
  on: boolean;
  patternId: string;
  bpm: number;
  /** The player's swing trim, added to the pattern's own feel. */
  swing: number;
  level: number;
}

export const DEFAULT_RHYTHM: RhythmSettings = {
  // Off to begin with: somebody who came to Freestyle for the pad and their
  // own hands should not be drummed at the moment they arrive.
  on: false,
  patternId: 'rock',
  bpm: 96,
  swing: 0,
  level: 0.8,
};

let current: RhythmSettings = { ...DEFAULT_RHYTHM, ...load(KEY, {}) };

/** The live settings object. Edited in place by the HUD panel. */
export function rhythmSettings(): RhythmSettings { return current; }

export function setRhythmSettings(patch: Partial<RhythmSettings>): void {
  current = { ...current, ...patch };
  save(KEY, current);
}

export function resetRhythmSettings(): void {
  current = { ...DEFAULT_RHYTHM };
  save(KEY, current);
}
