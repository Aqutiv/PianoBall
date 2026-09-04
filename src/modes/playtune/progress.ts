import { load, save } from '../../core/storage';
import type { Grade } from './judge';

/**
 * Where a role's progress is kept.
 *
 * One key per role rather than one store with two halves: the melody chain and
 * the chord chain are separate courses, they are reset separately, and a player
 * who has never touched one should not carry an empty half of it around.
 */
export const MELODY_STORE = 'playtune';
export const CHORD_STORE = 'playchords';

/**
 * How many tunes are open before anything has been passed.
 *
 * Three rather than one because each curve climbs a single axis — melody
 * difficulty for the library, strike rhythm and rate of change for the chord
 * curve — so one step a player could not take used to stop the whole mode.
 * With three open there is always somewhere else to go, and a wall can be
 * walked around rather than only hammered at.
 */
export const OPENING_TUNES = 3;

export interface TuneRecord {
  accuracy: number;
  score: number;
  grade: Grade;
  plays: number;
  /** True once any run has ever met the pass mark. Never goes back to false. */
  passed: boolean;
}

export interface Progress {
  unlocked: string[];
  best: Record<string, TuneRecord>;
  /**
   * How many times this chain has been deliberately wiped.
   *
   * The one thing a merge cannot work out on its own is the difference between
   * a record another window has not seen yet and a record the player asked to
   * be rid of: both look like "storage is missing something I hold". The count
   * only ever goes up, so a view whose own is behind knows it is looking at a
   * chain that has been reset since — and that a reset, confirmed twice on the
   * settings panel, outranks whatever it was still carrying.
   *
   * Absent from anything written before it existed, which reads as 0: no reset
   * has happened, so nothing is being overruled.
   */
  epoch: number;
}

export interface RunResult {
  accuracy: number;
  score: number;
  grade: Grade;
  /** True when the run met the tune's pass mark. */
  passed: boolean;
}

export interface RunOutcome {
  /** Id of the tune this run just opened up, if any. */
  unlocked: string | null;
  /** True when this run beat the player's previous best accuracy. */
  improved: boolean;
  /**
   * The record this run was actually judged against, or null for a first play.
   *
   * Returned rather than left to the caller to read beforehand, because the
   * merge below happens inside this function: a mode holds its `Progress` for
   * the whole session, so anything read from it before the call is a snapshot
   * from before whatever another window has done since. A caller pairing its
   * own stale reading with the `improved` computed here gets two answers from
   * two different chains — and after a reset in another tab, a run below the
   * stale best would still be called an improvement.
   */
  previous: TuneRecord | null;
  best: TuneRecord;
}

/** How many of the curve are open, given how many of it have been passed. */
function frontier(progress: Progress, order: readonly string[]): number {
  let passed = 0;
  for (const id of order) if (progress.best[id]?.passed) passed++;
  return Math.min(order.length, OPENING_TUNES + passed);
}

/**
 * Open everything the pass count has earned, in curve order and in place.
 *
 * Derived rather than merely accumulated, which is what makes the list
 * self-healing: a save from the build that opened one tune and added one per
 * pass, a merge from a second window, and a fresh start all settle in the same
 * place. Add-only, so a chain holding more than this says it earned keeps it —
 * the one thing progress must never do is go backwards.
 *
 * In place for the same reason `absorbProgress` is: the mode hands out its live
 * `Progress` object and the song list draws from it.
 */
function openEarned(progress: Progress, order: readonly string[]): void {
  const n = frontier(progress, order);
  for (let i = 0; i < n; i++) {
    if (!progress.unlocked.includes(order[i])) progress.unlocked.push(order[i]);
  }
}

/**
 * What the player has reached, and how well.
 *
 * The opening few are open from the start and every first pass opens one more,
 * so what is unlocked is the front `OPENING_TUNES + passed` of the curve.
 * Anything unreadable in storage is treated as a fresh start rather than an
 * error — losing progress is bad, but refusing to launch is worse.
 */
export function loadProgress(key: string, order: readonly string[]): Progress {
  const raw = load<Progress>(key, { unlocked: [], best: {}, epoch: 0 });
  const known = new Set(order);
  const unlocked = Array.isArray(raw.unlocked)
    ? raw.unlocked.filter((id) => known.has(id))
    : [];
  // What was *stored*, taken before anything below opens more. The back-fill
  // just after reads an open tune as evidence of a pass, and evidence has to
  // predate the conclusions drawn from it: top up first and a save holding only
  // the first tune gains the second, which is then misread as the first having
  // been passed, which earns a third — progress out of nothing.
  const open = new Set(unlocked);
  const best: Record<string, TuneRecord> = {};
  for (const [id, rec] of Object.entries(raw.best ?? {})) {
    if (!known.has(id) || !rec || typeof rec !== 'object') continue;
    const grade = (rec.grade ?? null) as Grade;
    // Records written before the flag existed have to be read for it, and they
    // all come from the build that opened one tune per pass: the tune after
    // this one being open is the strong evidence, because passing was the only
    // thing that ever opened it. A letter is the fallback for the last tune in
    // the chain, which has no next to have opened.
    const next = order[order.indexOf(id) + 1];
    best[id] = {
      accuracy: Number(rec.accuracy) || 0,
      score: Number(rec.score) || 0,
      grade,
      plays: Number(rec.plays) || 0,
      passed: typeof rec.passed === 'boolean'
        ? rec.passed
        : (next ? open.has(next) : false) || grade !== null,
    };
  }
  const progress: Progress = { unlocked, best, epoch: Number(raw.epoch) || 0 };
  openEarned(progress, order);
  return progress;
}

export function saveProgress(key: string, progress: Progress): void {
  save(key, progress);
}

export function isUnlocked(progress: Progress, id: string): boolean {
  return progress.unlocked.includes(id);
}

/**
 * How many more passes a locked tune is waiting on, for its card. 0 once open.
 *
 * Every pass opens exactly one tune, so the answer is however many are still
 * shut at or before this one. Counted rather than worked out from an index, so
 * it stays right without assuming the unlocked set is a clean prefix.
 */
export function passesNeeded(
  progress: Progress,
  order: readonly string[],
  id: string,
): number {
  const at = order.indexOf(id);
  if (at < 0) return 0;
  let shut = 0;
  for (let i = 0; i <= at; i++) if (!isUnlocked(progress, order[i])) shut++;
  return shut;
}

/** Worst to best, so two grades can be compared without ranking nulls. */
const RANK: Record<Exclude<Grade, null>, number> = { C: 1, B: 2, A: 3, S: 4 };

/** The better of two letters, where "no letter" is worse than any of them. */
function bestGrade(a: Grade, b: Grade): Grade {
  return (a ? RANK[a] : 0) >= (b ? RANK[b] : 0) ? a : b;
}

/** The better of two records, field by field. Neither one's high water mark is lost. */
function bestOf(a: TuneRecord | undefined, b: TuneRecord | undefined): TuneRecord | undefined {
  if (!a || !b) return a ?? b;
  return {
    accuracy: Math.max(a.accuracy, b.accuracy),
    score: Math.max(a.score, b.score),
    grade: bestGrade(a.grade, b.grade),
    // Not a sum: the two views usually overlap, and counting the same run twice
    // is a worse lie than under-counting a run only one of them saw.
    plays: Math.max(a.plays, b.plays),
    passed: a.passed || b.passed,
  };
}

/**
 * Fold everything in `other` into `progress`, in place.
 *
 * In place because the mode hands out its live `Progress` object — the song
 * list draws from it — so replacing it would leave the screen reading a
 * detached copy. Unlocks are unioned and records keep the better of the two:
 * this can only ever add.
 */
function absorbProgress(progress: Progress, other: Progress): Progress {
  for (const id of other.unlocked) {
    if (!progress.unlocked.includes(id)) progress.unlocked.push(id);
  }
  for (const [id, rec] of Object.entries(other.best)) {
    const merged = bestOf(progress.best[id], rec);
    if (merged) progress.best[id] = merged;
  }
  progress.epoch = Math.max(progress.epoch, other.epoch);
  return progress;
}

/** Become `other` outright, in place and for the same reason `absorb` is. */
function adoptProgress(progress: Progress, other: Progress): Progress {
  progress.unlocked.splice(0, progress.unlocked.length, ...other.unlocked);
  for (const id of Object.keys(progress.best)) delete progress.best[id];
  Object.assign(progress.best, other.best);
  progress.epoch = other.epoch;
  return progress;
}

/**
 * Fold a finished run into the saved progress, and say what changed.
 *
 * Bests only ever improve: a bad run after a good one loses nothing, and
 * neither does a fifth attempt at the first tune once the fifth is open. Only
 * a tune's *first* pass opens anything, which is what stops the easiest tune in
 * the curve from being played over and over for the whole library.
 *
 * The write goes through what is *stored* rather than straight over it. A mode
 * is built once and keeps its `Progress` for the whole session, so a second
 * window of the app — a browser tab beside the installed one is the easy way
 * to have two — holds a snapshot from before whatever the other has done
 * since, and finishing any run there would otherwise put storage back to it.
 * Replaying an early tune is exactly when that bites, because the snapshot is
 * oldest where the player has least left to earn.
 *
 * The exception is a chain that has been reset since the snapshot was taken,
 * which the epoch is there to spot. A merge would quietly put back what the
 * player asked twice to be rid of, so the stored side wins outright instead —
 * the run being written still counts, on the fresh chain.
 */
export function recordRun(
  key: string,
  progress: Progress,
  id: string,
  order: readonly string[],
  result: RunResult,
): RunOutcome {
  const stored = loadProgress(key, order);
  if (stored.epoch > progress.epoch) adoptProgress(progress, stored);
  else absorbProgress(progress, stored);
  // Settle what the merge earned before taking the mark, so this run is
  // credited with what it opened and not with another window's passes as well.
  openEarned(progress, order);
  const before = new Set(progress.unlocked);

  const prev = progress.best[id];
  const improved = !prev || result.accuracy > prev.accuracy;
  const best: TuneRecord = {
    accuracy: Math.max(prev?.accuracy ?? 0, result.accuracy),
    score: Math.max(prev?.score ?? 0, result.score),
    grade: bestGrade(prev?.grade ?? null, result.grade),
    plays: (prev?.plays ?? 0) + 1,
    passed: (prev?.passed ?? false) || result.passed,
  };
  progress.best[id] = best;

  // At most one can appear: a run raises the pass count by one or by nothing.
  openEarned(progress, order);
  const unlocked = progress.unlocked.find((tune) => !before.has(tune)) ?? null;

  saveProgress(key, progress);
  return { unlocked, improved, previous: prev ?? null, best };
}

/**
 * Wipe every unlock and record. The settings panel confirms before calling.
 *
 * The epoch goes up rather than back to zero, which is what tells any other
 * window of the app still holding a pre-reset view that its records are gone
 * on purpose rather than merely not written down yet.
 */
export function resetProgress(key: string, order: readonly string[]): Progress {
  const fresh: Progress = {
    unlocked: order.slice(0, OPENING_TUNES),
    best: {},
    epoch: loadProgress(key, order).epoch + 1,
  };
  saveProgress(key, fresh);
  return fresh;
}
