import { clamp } from '../core/math';

/**
 * Ceiling on the combined multiplier. Four stacking bonuses multiply out fast,
 * and without a cap a good multiball run stops meaning anything numerically.
 */
const MAX_MULTIPLIER = 32;

/**
 * How long a combo survives with nothing scoring.
 *
 * The combo used to be broken every time the ball came back to the keybed,
 * which meant it could never count past a single trip up the table and the
 * multiplier it feeds was decorative. A rally is the thing worth rewarding, so
 * what ends a combo is going quiet — long enough for a normal return, short
 * enough that a fumble costs you.
 */
const COMBO_HOLD = 2.6;

export interface ScorePop {
  x: number;
  y: number;
  amount: number;
  label: string;
  at: number;
  /** 0..1 hue-ish tint index used by the renderer. */
  tone: number;
}

export interface ScoreOptions {
  label?: string;
  tone?: number;
  /** Skip the pop-up for high-frequency events like rail scrapes. */
  quiet?: boolean;
  /** Bypass multipliers, for bonuses that are already final. */
  flat?: boolean;
}

/**
 * Points, and the four multipliers that stack on top of them.
 *
 * The multipliers are the game's argument: playing musically (on the beat, in
 * chords, on the notes the table is tuned to) is worth far more than merely
 * keeping the ball alive.
 */
export class Scoring {
  score = 0;
  ballScore = 0;
  best = 0;

  /** Consecutive scoring hits without the ball returning to the keybed. */
  combo = 0;
  comboBest = 0;
  /** Earned by landing hits on the beat. */
  groove = 1;
  /** Earned by hitting elements while their note is held. */
  resonance = 1;
  /** Set while more than one ball is in play. */
  multiball = 1;

  readonly pops: ScorePop[] = [];
  /** Local clock, advanced in step with the game clock. */
  time = 0;

  /** When the combo last grew. A combo lapses rather than being cut short. */
  private lastChainAt = -99;

  update(dt: number): void {
    this.time += dt;
    if (this.combo > 0 && this.time - this.lastChainAt > COMBO_HOLD) this.combo = 0;
    // Pops live about a second; drop them from the front once expired.
    while (this.pops.length && this.time - this.pops[0].at > 1.2) this.pops.shift();
  }

  get comboMultiplier(): number {
    return 1 + Math.min(6, Math.floor(this.combo / 3)) * 0.5;
  }

  get multiplier(): number {
    return Math.min(
      MAX_MULTIPLIER,
      this.groove * this.resonance * this.multiball * this.comboMultiplier,
    );
  }

  add(base: number, x: number, y: number, opts: ScoreOptions = {}): number {
    const amount = Math.round(opts.flat ? base : base * this.multiplier);
    this.score += amount;
    this.ballScore += amount;
    if (this.score > this.best) this.best = this.score;
    if (!opts.quiet) {
      this.pops.push({
        x, y, amount,
        label: opts.label ?? '',
        at: this.time,
        tone: opts.tone ?? 0,
      });
      if (this.pops.length > 48) this.pops.shift();
    }
    return amount;
  }

  /** A scoring element was struck: extend the combo. */
  chain(): void {
    this.combo++;
    this.lastChainAt = this.time;
    if (this.combo > this.comboBest) this.comboBest = this.combo;
  }

  /** The ball is gone, or the run has restarted: the combo ends there. */
  breakChain(): void { this.combo = 0; }

  setGroove(v: number): void { this.groove = clamp(v, 1, 5); }
  setResonance(v: number): void { this.resonance = clamp(v, 1, 4); }
  setMultiball(count: number): void { this.multiball = count > 1 ? Math.min(4, count) : 1; }

  startBall(): void {
    this.ballScore = 0;
    this.combo = 0;
    this.resonance = 1;
  }

  reset(): void {
    this.score = 0;
    this.ballScore = 0;
    this.combo = 0;
    this.comboBest = 0;
    this.groove = 1;
    this.resonance = 1;
    this.multiball = 1;
    this.pops.length = 0;
  }
}
