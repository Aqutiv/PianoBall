import { clamp01, smootherstep } from '../core/math';

/**
 * The end-of-run scoreboard: what a mode says about a finished run, and the
 * pass over it that makes the screen count itself out.
 *
 * The model is numeric on purpose. What stood here before was a list of
 * `{ label, value }` with every figure already rendered to a string inside the
 * mode, which left the screen nothing to sweep a dial to, nothing to hold
 * against a previous best, and no way to tell a score from a percentage. A
 * results screen that cannot tell those apart can only ever be a settings list,
 * which is exactly what both of them looked like.
 *
 * Everything above `build` is free of the DOM, so the schedule and the
 * bucketing are testable in the node environment the rest of the suite runs in.
 */

/** How a figure should be coloured, in the terms the panel already uses. */
export type StatTone = 'plain' | 'good' | 'warn' | 'bad';

/** A verdict, spelled the way the `--v-*` custom properties spell it. */
export type VerdictTone = 'perfect' | 'good' | 'ok' | 'miss' | 'wrong';

export type CountFormat = 'number' | 'time' | 'multiplier';

export type Stat =
  /** A figure that ticks up. `best` is the mark it was measured against. */
  | { kind: 'count'; label: string; value: number; best?: number; tone?: StatTone; format?: CountFormat }
  /** A fraction, 0..1, drawn as a fill. `mark` notches the track. */
  | { kind: 'share'; label: string; value: number; mark?: number; tone?: StatTone }
  /** Nothing to count — an unlocked tune's name, a word rather than a number. */
  | { kind: 'note'; label: string; value: string; tone?: StatTone };

/** A notch on the dial: what the run was being measured against. */
export interface HeroMark {
  /** Where it sits on the sweep, 0..1. */
  at: number;
  /**
   * The whole legend, already written.
   *
   * Written by the mode rather than derived from `at`, because `at` is only a
   * position. Pinball's dial is a score against a record, so its notch is at
   * some fraction of a reach nobody chose — printing that fraction gave "your
   * best 77%", which is not a number the player has ever seen.
   */
  label: string;
  kind: 'pass' | 'best';
}

export type HeroReadout =
  | { kind: 'percent' }
  | { kind: 'count'; format?: CountFormat }
  | { kind: 'text'; text: string };

export interface Hero {
  /** How far the ring sweeps, 0..1. */
  value: number;
  /** The number counting up in the middle of it. */
  readout: HeroReadout;
  /** What the readout counts to, when the readout is a count. */
  total?: number;
  /** Stamped over the readout once the sweep lands, when the run earned one. */
  badge?: string | null;
  marks?: readonly HeroMark[];
  tone: StatTone;
}

/** One slice of the verdict bar. */
export interface Split { tone: VerdictTone; count: number }

export interface ModeResult {
  title: string;
  subtitle?: string;
  hero: Hero;
  /** Per-note verdicts in time order. Absent for a mode with no chart. */
  run?: readonly VerdictTone[];
  split?: readonly Split[];
  stats: readonly Stat[];
  /** The one line worth its own emphasis — a tune unlocked, a best beaten. */
  banner?: { text: string; tone: StatTone } | null;
}

// ------------------------------------------------------------------ clock ---

/**
 * When each part of the reveal starts, and how long it takes. Seconds.
 *
 * The ring and the run map run together and land together, because they are two
 * views of the same run: watching the map fill as the dial climbs is what makes
 * the dial mean anything. Everything that reads as a consequence — the grade,
 * the breakdown, the rows — waits for both to finish.
 */
export const TIMING = {
  head: { at: 0, len: 0.25 },
  ring: { at: 0.2, len: 1.1 },
  map: { at: 0.35, len: 0.95 },
  badge: { at: 1.3, len: 0.22 },
  split: { at: 1.35, len: 0.45, step: 0.09 },
  rows: { at: 1.55, len: 0.3, step: 0.07 },
  banner: { at: 1.95, len: 0.3 },
} as const;

/** Past this the reveal has nothing left to move, however many rows there are. */
export const REVEAL_SECONDS = 3;

/** The most the frame that builds the panel may be worth. */
export const BUILD_FRAME_CAP = 0.05;

/**
 * What a frame is worth to the reveal.
 *
 * Only the first one is clamped, and that one has a reason: the frame that
 * opens this panel is the frame that also parsed it, and the loop hands down a
 * delta as large as a quarter second — enough to arrive a fifth of the way
 * through the reveal already.
 *
 * Every frame after it runs at wall clock, and that also has a reason. The
 * cadence is placed on the audio clock, which does not slow down for anything;
 * a reveal that took only fifty milliseconds a frame would run at half speed
 * on a device managing ten of them, and the tune would resolve while the ring
 * was still climbing. Better a single honest jump than a screen that drifts
 * away from its own sound.
 */
export function revealStep(dt: number, primed: boolean): number {
  return primed ? dt : Math.min(dt, BUILD_FRAME_CAP);
}

/**
 * The reveal's own clock.
 *
 * A clock rather than a set of CSS animations because the dial, the map and the
 * counters all have to agree on where they are — a mark on the ring brightens
 * the instant the sweep reaches it, and that comparison only exists if one
 * number drives both.
 */
export class Reveal {
  t = 0;

  advance(dt: number): void {
    if (this.t < REVEAL_SECONDS) this.t += dt;
  }

  /** Eased 0..1 for a phase starting at `at` and lasting `len`. */
  phase(at: number, len: number): number {
    return smootherstep((this.t - at) / len);
  }

  /** Jump to the end. What reduced motion asks for: arrive, do not travel. */
  settle(): void { this.t = REVEAL_SECONDS; }

  get done(): boolean { return this.t >= REVEAL_SECONDS; }
}

// -------------------------------------------------------------- run map ---

/**
 * Worst first: which verdict a bucket takes when it holds more than one.
 *
 * A miss inside a bucket of hits is the thing worth seeing, so it wins. The
 * point of the strip is to find where a run came apart, and averaging would
 * hide exactly that.
 */
const SEVERITY: Record<VerdictTone, number> = {
  perfect: 0, good: 1, ok: 2, wrong: 3, miss: 4,
};

/**
 * Collapse a run to at most `columns` ticks, keeping the worst of each bucket.
 *
 * Canon in D is a little over two hundred notes against a strip a few hundred
 * pixels wide; drawn one per note they would be thinner than a pixel and the
 * whole thing would grey out. A note that was never resolved counts as a miss,
 * because that is what it was.
 */
/**
 * How many ticks the run map is allowed before one would go sub-pixel.
 *
 * The panel is `min(560px, 92vw)` less 28px of padding either side, and the map
 * takes the part of that the dial does not — a little over three hundred pixels
 * on a desktop and around two hundred and forty on a phone held sideways. At
 * these counts a tick and its gap still land on more than a pixel there.
 */
export const RUN_COLUMNS = 118;

export function bucketRun(
  verdicts: readonly (VerdictTone | null)[],
  columns: number,
): VerdictTone[] {
  if (!verdicts.length || columns < 1) return [];
  const n = Math.min(columns, verdicts.length);
  const out: VerdictTone[] = [];
  for (let i = 0; i < n; i++) {
    // Bucket edges from the ratio rather than a running width, so the last
    // bucket ends exactly on the last note however the division falls.
    const from = Math.floor((i * verdicts.length) / n);
    const to = Math.floor(((i + 1) * verdicts.length) / n);
    let worst: VerdictTone = 'perfect';
    for (let k = from; k < to; k++) {
      const v = verdicts[k] ?? 'miss';
      if (SEVERITY[v] > SEVERITY[worst]) worst = v;
    }
    out.push(worst);
  }
  return out;
}

// ------------------------------------------------------------- formatting ---

/** Minutes and seconds, for a stat measured in time rather than points. */
export function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function formatCount(value: number, format: CountFormat = 'number'): string {
  if (format === 'time') return formatTime(value);
  if (format === 'multiplier') return `\u00d7${(Math.round(value * 10) / 10).toFixed(1)}`;
  return Math.round(value).toLocaleString();
}

export function formatShare(value: number): string {
  return `${Math.round(clamp01(value) * 100)}%`;
}
