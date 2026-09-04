import { MAX_RUNG } from './tiers';

/**
 * What the browser will tell us about the machine before it has drawn a frame.
 *
 * All of it optional, because most of it is Chromium-only and none of it is
 * reliable. `deviceMemory` is quantised to a handful of values and lies on
 * anything above 8GB; `hardwareConcurrency` counts threads, so a 2017 dual-core
 * laptop and a 2011 quad both say four.
 */
export interface DeviceHints {
  cores?: number;
  memoryGB?: number;
  /** Device pixels the frame will actually be painted at. */
  pixels?: number;
  /** The player has asked their browser to save data. */
  saveData?: boolean;
}

/**
 * The ceiling the first-run guess is allowed to reach.
 *
 * Deliberately short of the resolution rungs. Guessing a capable machine into a
 * soft picture is a far worse first impression than two seconds of visible
 * shedding on a slow one, and the measured controller is only ever a few
 * seconds behind -- the guess exists to spare a weak machine those seconds, not
 * to replace the measurement.
 */
export const MAX_SEED_RUNG = 4;

/**
 * Where to start the ladder on a machine that has never run this before.
 *
 * Additive, because the signals are weak individually and correlated in the
 * right direction: a machine that is short of threads is usually also short of
 * memory and usually also driving an integrated GPU.
 */
export function seedRung(h: DeviceHints): number {
  let rung = 0;

  const cores = h.cores ?? 0;
  if (cores > 0 && cores <= 2) rung += 3;
  else if (cores > 0 && cores <= 4) rung += 2;

  // Chromium only; `undefined` elsewhere, which correctly adds nothing.
  if (h.memoryGB !== undefined && h.memoryGB <= 4) rung += 2;

  // The best single predictor of fill-rate trouble, and the one nobody thinks
  // to check: a 4K panel at a ratio of two is eight times the pixels of a
  // 1080p one at a ratio of one, on whatever GPU happens to be behind it.
  const px = h.pixels ?? 0;
  if (px >= 6_000_000) rung += 2;
  else if (px >= 3_500_000) rung += 1;

  // An explicit request from the player, about their own machine.
  if (h.saveData) rung += 2;

  return Math.max(0, Math.min(MAX_SEED_RUNG, Math.min(MAX_RUNG, rung)));
}

/** The hints this browser will give up, if it is a browser at all. */
export function readDeviceHints(pixels: number): DeviceHints {
  if (typeof navigator === 'undefined') return { pixels };
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  return {
    cores: nav.hardwareConcurrency,
    memoryGB: nav.deviceMemory,
    pixels,
    saveData: nav.connection?.saveData,
  };
}
