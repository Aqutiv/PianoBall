import { clamp, clamp01, damp } from '../core/math';

export interface TiltConfig {
  /** Peak sideways acceleration, as a fraction of gravity. */
  authority: number;
  /** How fast the table responds to the bend control, per second. */
  response: number;
  /** Strain accumulated per second at full tilt before the table gives up. */
  strainRate: number;
  strainDecay: number;
  /** Strain at which the warning shows, and at which the table tilts out. */
  warnAt: number;
  tiltAt: number;
}

export const DEFAULT_TILT: TiltConfig = {
  authority: 0.27,
  response: 11,
  strainRate: 1,
  strainDecay: 0.62,
  warnAt: 0.55,
  tiltAt: 1,
};

/**
 * Pitch bend nudges the table.
 *
 * The keybed is a crown, so a ball rolling towards an outlane can be steered
 * back — which is what gives the bend control real weight. Leaning on it
 * permanently would trivialise that, so sustained tilt builds strain and
 * eventually kills the paddles until the ball drains, exactly like the real thing.
 */
export class Tilt {
  cfg: TiltConfig;
  /** Smoothed bend, -1..1. */
  value = 0;
  target = 0;
  strain = 0;
  tilted = false;

  constructor(cfg: Partial<TiltConfig> = {}) {
    this.cfg = { ...DEFAULT_TILT, ...cfg };
  }

  setBend(v: number): void { this.target = clamp(v, -1, 1); }

  update(dt: number): void {
    // Bend *buttons* send an instant full-scale value, so smoothing is what
    // turns a binary control into a usable nudge.
    this.value = damp(this.value, this.tilted ? 0 : this.target, this.cfg.response, dt);
    const load = Math.abs(this.value);
    if (load > 0.25 && !this.tilted) {
      this.strain += (load - 0.25) * this.cfg.strainRate * dt;
      if (this.strain >= this.cfg.tiltAt) { this.tilted = true; this.strain = this.cfg.tiltAt; }
    } else {
      this.strain = Math.max(0, this.strain - this.cfg.strainDecay * dt);
    }
  }

  /** Sideways acceleration to add to gravity, in the same units. */
  accelX(gravity: number): number {
    return this.tilted ? 0 : this.value * this.cfg.authority * gravity;
  }

  get warning(): boolean { return !this.tilted && this.strain >= this.cfg.warnAt; }
  get strain01(): number { return clamp01(this.strain / this.cfg.tiltAt); }

  /** Called when a ball drains: the table forgives and resets. */
  reset(): void {
    this.tilted = false;
    this.strain = 0;
    this.value = 0;
    this.target = 0;
  }
}
