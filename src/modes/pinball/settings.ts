import { load, save } from '../../core/storage';

const KEY = 'pinballSettings';

export interface PinballSettings {
  /**
   * Whether the rhythm box joins a rally.
   *
   * On to begin with. The table is the one place in the app where a kick
   * under the harmony is not a costume: the bed already follows the rally, and
   * drums are how a rally is heard to be one. Off for whoever wants the chords
   * and the bells without a band behind them.
   */
  drums: boolean;
}

export const DEFAULT_PINBALL: PinballSettings = {
  drums: true,
};

let current: PinballSettings = { ...DEFAULT_PINBALL, ...load(KEY, {}) };

/** The live settings object, read by the mode whenever it applies a rung. */
export function pinballSettings(): PinballSettings { return current; }

export function setPinballSettings(patch: Partial<PinballSettings>): void {
  current = { ...current, ...patch };
  save(KEY, current);
}

/** Part of the panel's "reset everything": these are preferences like any other. */
export function resetPinballSettings(): void {
  current = { ...DEFAULT_PINBALL };
  save(KEY, current);
}
