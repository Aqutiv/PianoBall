import { clamp01 } from '../core/math';

export type CurveName = 'linear' | 'soft' | 'hard' | 'gamma' | 'fixed';

export interface VelocitySettings {
  curve: CurveName;
  /** Exponent for the `gamma` curve. Below 1 boosts soft playing. */
  gamma: number;
  /** Raw MIDI values below this map to silence-adjacent, above `ceiling` to full. */
  floor: number;
  ceiling: number;
  /** Output for the `fixed` curve, and for inputs that carry no velocity. */
  fixed: number;
  /** Smallest non-zero output, so the softest press still does something. */
  min: number;
}

export const DEFAULT_VELOCITY: VelocitySettings = {
  // Mini keys rarely reach the top of the range, so the default curve leans
  // soft and the ceiling sits well below 127.
  curve: 'soft',
  gamma: 0.7,
  floor: 4,
  ceiling: 108,
  fixed: 0.72,
  min: 0.1,
};

/** Raw MIDI velocity (0..127) to normalised strike force (0..1). */
export function mapVelocity(raw: number, s: VelocitySettings = DEFAULT_VELOCITY): number {
  if (s.curve === 'fixed') return s.fixed;
  const span = Math.max(1, s.ceiling - s.floor);
  const t = clamp01((raw - s.floor) / span);
  let shaped: number;
  switch (s.curve) {
    case 'soft': shaped = Math.pow(t, 0.62); break;
    case 'hard': shaped = Math.pow(t, 1.7); break;
    case 'gamma': shaped = Math.pow(t, Math.max(0.05, s.gamma)); break;
    default: shaped = t;
  }
  return s.min + (1 - s.min) * shaped;
}

/** Rolling histogram of raw velocities, so the curve can be tuned against real playing. */
export class VelocityHistogram {
  readonly bins: number[];
  count = 0;

  constructor(readonly binCount = 32) {
    this.bins = new Array(binCount).fill(0);
  }

  add(raw: number): void {
    const i = Math.min(this.binCount - 1, Math.max(0, Math.floor((raw / 128) * this.binCount)));
    this.bins[i]++;
    this.count++;
  }

  reset(): void {
    this.bins.fill(0);
    this.count = 0;
  }

  get peak(): number { return Math.max(1, ...this.bins); }
}
