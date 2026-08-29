import { load, save } from '../../core/storage';
import { DEFAULT_BED_VOICE, DEFAULT_LEAD_VOICE } from '../../audio/voices';

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
  /**
   * What the keys sound like, and what the bed sounds like under them.
   *
   * Freestyle's own, not the app's: the mode sets both on the way in and puts
   * the defaults back on the way out, so choosing a choir here leaves Pinball
   * and PlayTune sounding exactly as they did.
   */
  voiceId: string;
  bedVoiceId: string;
}

export const DEFAULT_FREESTYLE: FreestyleSettings = {
  bed: false,
  voiceId: DEFAULT_LEAD_VOICE,
  bedVoiceId: DEFAULT_BED_VOICE,
};

let current: FreestyleSettings = { ...DEFAULT_FREESTYLE, ...load(KEY, {}) };

/** The live settings object. Edited in place by the HUD and the panel. */
export function freestyleSettings(): FreestyleSettings { return current; }

export function setFreestyleSettings(patch: Partial<FreestyleSettings>): void {
  current = { ...current, ...patch };
  save(KEY, current);
}

/** Part of the panel's "reset everything": these are preferences like any other. */
export function resetFreestyleSettings(): void {
  current = { ...DEFAULT_FREESTYLE };
  save(KEY, current);
}
