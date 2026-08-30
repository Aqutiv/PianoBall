import { load, save } from '../../core/storage';
import type { RoleId } from './role';

const KEY = 'playtuneSettings';

export interface PlayTuneSettings {
  /**
   * Which half of the arrangement the player takes.
   *
   * A preference and not a saved score, which is why it lives here: resetting
   * settings should put the player back on the melody without touching either
   * chain of unlocks, and both roles want the same offset, lane and assist.
   */
  role: RoleId;
  /**
   * Milliseconds added to the device's own reported latency.
   *
   * Positive means "I am consistently early" — the press is treated as having
   * happened later than it did. Hardware, drivers and Bluetooth all lie by
   * different amounts, so there is no getting this right without asking.
   */
  offsetMs: number;
  /**
   * Beats of lane an aura gets to fall down.
   *
   * Beats rather than seconds because the lane is a beat ruler: it is what
   * makes a minim's tail twice a crotchet's. What it is *not* is the whole
   * story about warning time — above `APPROACH_BPM_CAP` the beat stops being
   * allowed to shrink, so a quick tune buys the same seconds a moderate one
   * does. See `Transport.approachSeconds`.
   */
  leadBeats: number;
  /** Light the key an aura is heading for. */
  assist: boolean;
}

/**
 * The leads the panel offers, and so the range anything else has to cope with.
 *
 * Exported so the clamp and the `<select>` read one list rather than two that
 * drift, the way `MIN_BPM`/`MAX_BPM` are shared with the Freestyle HUD.
 */
export const LEAD_BEAT_CHOICES = [3, 4, 6, 8] as const;

export const MIN_LEAD_BEATS = LEAD_BEAT_CHOICES[0];
export const MAX_LEAD_BEATS = LEAD_BEAT_CHOICES[LEAD_BEAT_CHOICES.length - 1];

export const DEFAULT_PLAYTUNE: PlayTuneSettings = {
  role: 'melody',
  offsetMs: 0,
  leadBeats: 4,
  assist: true,
};

/**
 * Every role there is, as something that exists at run time.
 *
 * Keyed by the union so that adding a role fails to compile until it is named
 * here. `load` checks that what came out of storage is an object and nothing
 * at all about what its values mean, so a hand-edited or stale
 * `pianoball.playtuneSettings` can hold any string — and an unrecognised one
 * would reach `ROLES[...]` as undefined and throw while PlayTune was being
 * built, which is enough to stop the app starting when it is the last mode
 * played.
 */
const ROLE_IDS: Record<RoleId, true> = { melody: true, chords: true };

function asRole(value: unknown): RoleId {
  return typeof value === 'string' && value in ROLE_IDS
    ? value as RoleId
    : DEFAULT_PLAYTUNE.role;
}

const settle = (s: PlayTuneSettings): PlayTuneSettings => ({ ...s, role: asRole(s.role) });

let current: PlayTuneSettings = settle({ ...DEFAULT_PLAYTUNE, ...load(KEY, {}) });

/** The live settings object. Edited in place by the settings panel. */
export function playTuneSettings(): PlayTuneSettings { return current; }

export function setPlayTuneSettings(patch: Partial<PlayTuneSettings>): void {
  current = settle({ ...current, ...patch });
  save(KEY, current);
}

/** Part of the panel's "reset everything": these are preferences like any other. */
export function resetPlayTuneSettings(): void {
  current = { ...DEFAULT_PLAYTUNE };
  save(KEY, current);
}
