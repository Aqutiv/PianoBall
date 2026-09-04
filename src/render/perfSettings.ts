import { load, save } from '../core/storage';

const KEY = 'perf';

/**
 * How the ladder's rung gets chosen, and how the sound follows it.
 *
 * Deliberately its own settings module rather than fields on `RenderQuality`:
 * quality is *what is being drawn*, and this is *who decides*. They also have
 * different lifetimes -- the running quality is derived fresh from the
 * preference and a rung on every change, and this is not derived from anything.
 */
export type GraphicsPreset = 'auto' | 'high' | 'balanced' | 'low';
export type SoundPreset = 'auto' | 'full' | 'lite';

export interface PerfSettings {
  graphics: GraphicsPreset;
  sound: SoundPreset;
  /**
   * Whether the first-run guess at what this machine can draw has been made.
   *
   * Its own marker, because the thing it used to be inferred from -- whether a
   * `quality` preference had ever been written -- is only true once the player
   * touches a Display toggle. An Auto player who never does was treated as a
   * first run on every single load, so a capable machine misclassified by a
   * coarse thread count started degraded every session and spent half a minute
   * climbing back out, however well the previous session had gone.
   */
  seeded: boolean;
}

export const DEFAULT_PERF: PerfSettings = { graphics: 'auto', sound: 'auto', seeded: false };

/**
 * The rung each pinned preset holds the ladder at.
 *
 * `auto` is absent because it does not pin: the measured controller owns the
 * rung, which is the default and what every existing session already does.
 */
export const PRESET_RUNG: Record<Exclude<GraphicsPreset, 'auto'>, number> = {
  high: 0,
  // The two full-frame passes nobody can name, kept short of anything with a
  // shape: bloom and shadows both survive here.
  balanced: 2,
  // Everything but the last resolution step, which is reserved for a machine
  // that has actually been measured failing rather than merely told it is old.
  low: 6,
};

let current: PerfSettings = { ...DEFAULT_PERF, ...load(KEY, {}) };

export function perfSettings(): PerfSettings { return current; }

export function setPerfSettings(patch: Partial<PerfSettings>): void {
  current = { ...current, ...patch };
  save(KEY, current);
}

export function resetPerfSettings(): void {
  current = { ...DEFAULT_PERF };
  save(KEY, current);
}
