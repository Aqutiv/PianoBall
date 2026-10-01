import { load, save } from '../core/storage';
import { clamp } from '../core/math';
import { KEY_TARGET, nearestC, type DockEnv, type KeySize } from '../game/dock';
import type { InputHub } from '../midi/inputHub';

const KEY = 'dock';

export interface DockSettings {
  /** How large the keys are on a touch screen. */
  keySize: KeySize;
  /** The C the touch keyboard is built around, moved by its octave buttons. */
  touchCenter: number;
}

export const DEFAULT_DOCK_SETTINGS: DockSettings = { keySize: 'comfortable', touchCenter: 60 };

const SIZES = Object.keys(KEY_TARGET) as KeySize[];

/** Anything read back from storage, made safe to lay a keyboard out with. */
function sanitise(s: Partial<DockSettings>): DockSettings {
  const keySize = SIZES.includes(s.keySize as KeySize) ? (s.keySize as KeySize) : DEFAULT_DOCK_SETTINGS.keySize;
  const centre = typeof s.touchCenter === 'number' && Number.isFinite(s.touchCenter)
    ? nearestC(s.touchCenter) : DEFAULT_DOCK_SETTINGS.touchCenter;
  return { keySize, touchCenter: clamp(centre, 36, 96) };
}

let current: DockSettings = sanitise(load<Partial<DockSettings>>(KEY, {}));

export function dockSettings(): DockSettings { return current; }

export function setDockSettings(patch: Partial<DockSettings>): void {
  current = sanitise({ ...current, ...patch });
  save(KEY, current);
}

/** Part of the panel's "reset everything". */
export function resetDockSettings(): void {
  current = { ...DEFAULT_DOCK_SETTINGS };
  save(KEY, current);
}

/** Forced from the debug API: a desktop browser cannot otherwise show the touch keyboard. */
let override: 'touch' | 'mapped' | null = null;

export function setDockOverride(policy: 'touch' | 'mapped' | null): void { override = policy; }

let coarse: MediaQueryList | null | undefined;

/** Whether the main pointer is a finger. Asked once; the answer is kept and stays live. */
function coarsePointer(): boolean {
  if (coarse === undefined) {
    try {
      coarse = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(pointer: coarse)') : null;
    } catch {
      coarse = null;
    }
  }
  return coarse?.matches ?? false;
}

/**
 * What the keyboard should be sized for, right now.
 *
 * Fingers on a touch screen with no MIDI keyboard plugged in. With a
 * controller, the screen mirrors its keys instead, so every lane has a
 * physical key under it, and with a mouse the mapped window is what the
 * computer keyboard plays.
 */
export function readDockEnv(input: InputHub): DockEnv {
  const midi = input.midi;
  const controller = midi.status === 'ready' && midi.devices.length > 0;
  const touch = override ? override === 'touch' : coarsePointer() && !controller;
  return { touch, keySize: current.keySize, center: current.touchCenter };
}
