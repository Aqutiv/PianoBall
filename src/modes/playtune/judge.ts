export type Verdict = 'perfect' | 'good' | 'ok' | 'miss' | 'wrong';

/** Half-widths of the hit windows, in seconds. */
export interface Windows { perfect: number; good: number; ok: number }

export const WINDOWS: Windows = { perfect: 0.055, good: 0.11, ok: 0.17 };

/** How much of a note each verdict is worth towards accuracy. */
const WORTH: Record<Verdict, number> = {
  perfect: 1, good: 0.75, ok: 0.4, miss: 0, wrong: 0,
};

export interface TargetSpec {
  note: number;
  beat: number;
  len: number;
  /** Absolute audio time the note is due. */
  time: number;
}

export interface Target extends TargetSpec {
  state: 'waiting' | 'hit' | 'missed';
  verdict: Verdict | null;
  /** Signed seconds early (negative) or late (positive). */
  error: number;
  /** True while the player is still holding a note with a tail. */
  holding: boolean;
}

export interface PressResult {
  verdict: Verdict;
  target: Target | null;
  combo: number;
}

/**
 * Timing judgement for one run of a tune.
 *
 * Deliberately forgiving in one direction only: a press that matches nothing is
 * `wrong`, which breaks the combo but costs no accuracy. This mode is for
 * learning a melody, and a player feeling out where a note lives should not be
 * punished for it — but they should not be able to trill their way to an A
 * either, which is what breaking the combo prevents.
 */
export class Judge {
  readonly targets: Target[];
  combo = 0;
  bestCombo = 0;
  readonly tally: Record<Verdict, number> = {
    perfect: 0, good: 0, ok: 0, miss: 0, wrong: 0,
  };

  private readonly windows: Windows;
  /** Targets not yet resolved, kept in due order for a cheap sweep. */
  private cursor = 0;

  constructor(specs: readonly TargetSpec[], windows: Windows = WINDOWS) {
    this.windows = windows;
    this.targets = specs
      .map((s) => ({ ...s, state: 'waiting' as const, verdict: null, error: 0, holding: false }))
      .sort((a, b) => a.time - b.time || a.note - b.note);
  }

  get total(): number { return this.targets.length; }
  get judged(): number {
    return this.tally.perfect + this.tally.good + this.tally.ok + this.tally.miss;
  }

  /** Weighted fraction of the melody actually played, 0..1. */
  get accuracy(): number {
    if (!this.total) return 0;
    const earned = this.tally.perfect * WORTH.perfect
      + this.tally.good * WORTH.good
      + this.tally.ok * WORTH.ok;
    return earned / this.total;
  }

  get done(): boolean { return this.judged >= this.total; }

  /**
   * Grade the press of `note` at audio time `at`.
   *
   * Picks the nearest unresolved target for that pitch inside the widest
   * window. Nearest rather than earliest: on a repeated note, a player who is
   * slightly late for one is not thereby early for the next.
   */
  press(note: number, at: number): PressResult {
    let best: Target | null = null;
    let bestErr = Infinity;
    for (const t of this.targets) {
      if (t.state !== 'waiting' || t.note !== note) continue;
      const err = at - t.time;
      if (Math.abs(err) > this.windows.ok) continue;
      if (Math.abs(err) < Math.abs(bestErr)) { best = t; bestErr = err; }
    }

    if (!best) {
      this.combo = 0;
      this.tally.wrong++;
      return { verdict: 'wrong', target: null, combo: 0 };
    }

    const mag = Math.abs(bestErr);
    const verdict: Verdict = mag <= this.windows.perfect ? 'perfect'
      : mag <= this.windows.good ? 'good'
        : 'ok';
    best.state = 'hit';
    best.verdict = verdict;
    best.error = bestErr;
    best.holding = true;
    this.tally[verdict]++;
    this.combo++;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    return { verdict, target: best, combo: this.combo };
  }

  /** The player let go; a held tail stops being held. */
  release(note: number): void {
    for (const t of this.targets) if (t.note === note) t.holding = false;
  }

  /**
   * Resolve every target whose window has closed. Returns the ones that just
   * became misses, so the caller can shatter them.
   */
  expire(at: number): Target[] {
    const missed: Target[] = [];
    while (this.cursor < this.targets.length) {
      const t = this.targets[this.cursor];
      if (at <= t.time + this.windows.ok) break;
      this.cursor++;
      if (t.state !== 'waiting') continue;
      t.state = 'missed';
      t.verdict = 'miss';
      this.tally.miss++;
      this.combo = 0;
      missed.push(t);
    }
    return missed;
  }

  /** Targets currently inside the approach window, for drawing. */
  approaching(at: number, lead: number): Target[] {
    return this.targets.filter((t) =>
      t.state === 'waiting' && t.time - at <= lead && at <= t.time + this.windows.ok);
  }
}

export type Grade = 'S' | 'A' | 'B' | 'C' | null;

const GRADES: { grade: Exclude<Grade, null>; at: number }[] = [
  { grade: 'S', at: 0.98 },
  { grade: 'A', at: 0.92 },
  { grade: 'B', at: 0.84 },
  { grade: 'C', at: 0.70 },
];

/** Letter for an accuracy, or null when the run does not yet earn one. */
export function grade(accuracy: number): Grade {
  for (const g of GRADES) if (accuracy >= g.at) return g.grade;
  return null;
}
