import { load, save } from '../../core/storage';

const KEY = 'playtuneSettings';

export interface PlayTuneSettings {
  /**
   * Milliseconds added to the device's own reported latency.
   *
   * Positive means "I am consistently early" — the press is treated as having
   * happened later than it did. Hardware, drivers and Bluetooth all lie by
   * different amounts, so there is no getting this right without asking.
   */
  offsetMs: number;
  /** Beats of approach an aura gets. Fewer is less warning, not less time. */
  leadBeats: number;
  /** Light the key an aura is heading for. */
  assist: boolean;
}

export const DEFAULT_PLAYTUNE: PlayTuneSettings = {
  offsetMs: 0,
  leadBeats: 4,
  assist: true,
};

let current: PlayTuneSettings = { ...DEFAULT_PLAYTUNE, ...load(KEY, {}) };

/** The live settings object. Edited in place by the settings panel. */
export function playTuneSettings(): PlayTuneSettings { return current; }

export function setPlayTuneSettings(patch: Partial<PlayTuneSettings>): void {
  current = { ...current, ...patch };
  save(KEY, current);
}

/** Part of the panel's "reset everything": these are preferences like any other. */
export function resetPlayTuneSettings(): void {
  current = { ...DEFAULT_PLAYTUNE };
  save(KEY, current);
}
