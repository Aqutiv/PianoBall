import { load, save } from '../../core/storage';

const KEY = 'freestyleSettings';

export interface FreestyleSettings {
  /**
   * Whether a chord bed plays underneath.
   *
   * Off to begin with. Freestyle is the mode you open to make your own sound,
   * and starting it over a backing track decides something the player came here
   * to decide for themselves — so it is offered rather than assumed.
   */
  bed: boolean;
}

export const DEFAULT_FREESTYLE: FreestyleSettings = {
  bed: false,
};

let current: FreestyleSettings = { ...DEFAULT_FREESTYLE, ...load(KEY, {}) };

/** The live settings object. Edited in place by the HUD and the panel. */
export function freestyleSettings(): FreestyleSettings { return current; }

export function setFreestyleSettings(patch: Partial<FreestyleSettings>): void {
  current = { ...current, ...patch };
  save(KEY, current);
}
