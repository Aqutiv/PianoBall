import { clamp01 } from '../../core/math';

export type Verdict = 'perfect' | 'good' | 'ok' | 'miss' | 'wrong';

/** Half-widths of the hit windows, in seconds. */
export interface Windows { perfect: number; good: number; ok: number }

export const WINDOWS: Windows = { perfect: 0.055, good: 0.11, ok: 0.17 };

/**
 * How much of a note each verdict is worth towards accuracy.
 *
 * `good` used to be 0.75, which made a run that hit every note in the good
 * window worth exactly 75% — which was then what Canon in D and Jesu, Joy
 * asked to pass, decided on the last bit of a float. Worse, once the long
 * notes took the hold floor, playing Greensleeves correctly and detached
 * scored 68.9% against the 70% it asked for at the time: every key right, and
 * a fail. A mode for learning a melody should not do that, so a competent run
 * now clears every pass mark in the library with room, and perfect is still
 * 20% better than good.
 *
 * `ok` used to be 0.4, so one millisecond either side of the good window more
 * than halved what a note was worth. The ladder should slope, not cliff: the
 * gaps are now 20% and 31% rather than 25% and 47%.
 *
 * Exported because the tests should assert against the ladder rather than
 * restate its numbers and quietly disagree with it later.
 */
export const WORTH: Record<Verdict, number> = {
  perfect: 1, good: 0.8, ok: 0.55, miss: 0, wrong: 0,
};

/**
 * Longest note judged on its onset alone, in beats.
 *
 * Running quavers are about the accuracy of the attack; asking for their length
 * as well would be grading finger independence in the middle of a tune whose
 * point is the melody. Anything longer than a beat is exposed enough that
 * letting go early is audible, so that is where the tail starts counting.
 */
export const HOLD_FROM = 1;

/**
 * What a perfectly timed note is worth when it is dropped immediately.
 *
 * Not zero: hitting the right key at the right moment is most of the job, and a
 * mode for learning a melody should not tell a player who played every note in
 * time that they scored nothing. The remaining third is what holding earns.
 */
export const HOLD_FLOOR = 0.7;

/** Released this near the end of the tail still counts as the whole of it. */
export const HOLD_GRACE = 0.15;

export interface TargetSpec {
  note: number;
  beat: number;
  len: number;
  /** Absolute audio time the note is due. */
  time: number;
  /** Absolute audio time the key should still be down at. */
  end: number;
}

export interface Target extends TargetSpec {
  state: 'waiting' | 'hit' | 'missed';
  verdict: Verdict | null;
  /** Signed seconds early (negative) or late (positive). */
  error: number;
  /** True while the player is still holding a note with a tail. */
  holding: boolean;
  /** Audio time the press landed, or -1 if it never did. */
  pressedAt: number;
  /** How much of the tail was held, 0..1. Null until the note settles. */
  hold: number | null;
  /** Whether this note is long enough for its length to count. */
  holdJudged: boolean;
  /**
   * Notes in a row at the moment this one was struck, or 0.
   *
   * Kept on the target because a long note is paid twice — once for the onset
   * and once for the tail — and the two instalments have to be worth the same
   * multiplier. Reading the live combo when the tail settles would price it by
   * whatever happened while the key was held down.
   */
  combo: number;
}

export interface PressResult {
  verdict: Verdict;
  target: Target | null;
  combo: number;
}

/**
 * Timing and length judgement for one run of a tune.
 *
 * A note is worth what its onset earned, scaled by how much of its tail was
 * actually held. A press that matches nothing is `wrong`: it breaks the combo,
 * and it joins the denominator rather than subtracting from the total — so
 * feeling out where a note lives costs almost nothing, while trilling through a
 * phrase dilutes the run towards zero without it ever going negative.
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
  /** Notes hit and still being held, so their tails can be settled. */
  private readonly open: Target[] = [];
  /** Sum of `WORTH * hold` over everything that has settled. */
  private earned = 0;
  /** Targets that have reached a final worth, hit or missed. */
  private settledCount = 0;
  private holdSum = 0;
  private holdCount = 0;
  private readonly firstTime: number;

  constructor(specs: readonly TargetSpec[], windows: Windows = WINDOWS) {
    this.windows = windows;
    this.targets = specs
      .map((s) => ({
        ...s,
        state: 'waiting' as const,
        verdict: null,
        error: 0,
        holding: false,
        pressedAt: -1,
        hold: null,
        combo: 0,
        holdJudged: s.len > HOLD_FROM && s.end > s.time,
      }))
      .sort((a, b) => a.time - b.time || a.note - b.note);
    this.firstTime = this.targets.length ? this.targets[0].time : Infinity;
  }

  get total(): number { return this.targets.length; }
  get judged(): number {
    return this.tally.perfect + this.tally.good + this.tally.ok + this.tally.miss;
  }

  /**
   * Weighted fraction of the melody actually played, 0..1.
   *
   * Over the whole chart, so it only reaches its true value once the run ends;
   * `accuracySoFar` is the one to show while it is still going.
   */
  get accuracy(): number {
    const denom = this.total + this.tally.wrong;
    if (!denom) return 0;
    return this.earned / denom;
  }

  /** The same measure over what has actually been resolved so far. */
  get accuracySoFar(): number {
    const denom = this.settledCount + this.tally.wrong;
    return denom ? this.earned / denom : 1;
  }

  /** Mean fraction of the tail held, over the notes long enough to count. */
  get holdAccuracy(): number | null {
    return this.holdCount ? this.holdSum / this.holdCount : null;
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
      // A press before the tune has started is the player finding the keys, and
      // the count-in is exactly when that happens. Charging for it would make
      // the calibration bars part of the score.
      //
      // The boundary is the first note itself rather than the opening of its
      // window: a wrong pitch struck in the last breath before the downbeat is
      // still inside the count-in, and half a hit window is not where a rule
      // about whether the tune has begun should turn over.
      if (at >= this.firstTime) this.tally.wrong++;
      return { verdict: 'wrong', target: null, combo: 0 };
    }

    // The same pitch struck again while an earlier tail is still open means the
    // release was never seen. Settle it at what it managed, rather than leaving
    // two notes claiming one key.
    this.closeOpen(note, at);

    const mag = Math.abs(bestErr);
    const verdict: Verdict = mag <= this.windows.perfect ? 'perfect'
      : mag <= this.windows.good ? 'good'
        : 'ok';
    best.state = 'hit';
    best.verdict = verdict;
    best.error = bestErr;
    best.pressedAt = at;
    this.tally[verdict]++;
    this.combo++;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    best.combo = this.combo;

    if (best.holdJudged) {
      best.holding = true;
      this.open.push(best);
    } else {
      // A note with no tail to speak of is worth its onset and nothing else.
      this.settle(best, 1);
    }
    return { verdict, target: best, combo: this.combo };
  }

  /**
   * The player let go. A tail that was owed settles at what it got, and comes
   * back so the caller can pay out the part of the note that was in holding it.
   */
  release(note: number, at: number): Target | null {
    return this.closeOpen(note, at);
  }

  /**
   * Credit every held note whose tail has run out.
   *
   * `expire` cannot do this: it is one forward cursor over onsets, and a tail
   * finishes at a time that has nothing to do with the order notes start in.
   * `open` only ever holds what is sounding right now, so the sweep is short.
   */
  settleHolds(at: number): Target[] {
    const done: Target[] = [];
    for (let i = this.open.length - 1; i >= 0; i--) {
      const t = this.open[i];
      if (at < t.end) continue;
      this.open.splice(i, 1);
      // Still down when the note ended: the whole tail was held.
      this.settle(t, 1);
      done.push(t);
    }
    return done;
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
      t.hold = 0;
      this.tally.miss++;
      this.settledCount++;
      this.combo = 0;
      missed.push(t);
    }
    return missed;
  }

  /** Everything still open at the end of the tune, resolved where it stands. */
  finish(): void {
    this.expire(Infinity);
    this.settleHolds(Infinity);
  }

  /** Targets currently inside the approach window, for drawing. */
  approaching(at: number, lead: number): Target[] {
    return this.targets.filter((t) =>
      t.state === 'waiting' && t.time - at <= lead && at <= t.time + this.windows.ok);
  }

  /** Notes being held right now, so their tails can be drawn draining. */
  sounding(at: number): Target[] {
    return this.open.filter((t) => at < t.end);
  }

  private closeOpen(note: number, at: number): Target | null {
    for (let i = 0; i < this.open.length; i++) {
      const t = this.open[i];
      if (t.note !== note) continue;
      this.open.splice(i, 1);
      this.settle(t, this.holdWorth(t, at));
      return t;
    }
    return null;
  }

  /**
   * How much of a note's tail was held, 0..1.
   *
   * Measured from where the note was *due* rather than from where the press
   * landed: a note ends when it ends, and a player who came in slightly late
   * should not have to hold past the end of the bar to make up for it.
   */
  private holdWorth(t: Target, at: number): number {
    const need = (t.end - t.time) * (1 - HOLD_GRACE);
    if (need <= 0) return 1;
    return clamp01((at - t.time) / need);
  }

  private settle(t: Target, hold: number): void {
    t.hold = hold;
    t.holding = false;
    this.settledCount++;
    this.earned += WORTH[t.verdict ?? 'miss']
      * (t.holdJudged ? HOLD_FLOOR + (1 - HOLD_FLOOR) * hold : 1);
    if (t.holdJudged) {
      this.holdSum += hold;
      this.holdCount++;
    }
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
