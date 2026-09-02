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
  best: TuneRecord;
}

/**
 * What the player has reached, and how well.
 *
 * The first tune is always available; every other one opens when the one before
 * it is passed. Anything unreadable in storage is treated as a fresh start
 * rather than an error — losing progress is bad, but refusing to launch is
 * worse.
 */
export function loadProgress(key: string, order: readonly string[]): Progress {
  const raw = load<Progress>(key, { unlocked: [], best: {} });
  const known = new Set(order);
  const unlocked = Array.isArray(raw.unlocked)
    ? raw.unlocked.filter((id) => known.has(id))
    : [];
  const first = order[0];
  if (first && !unlocked.includes(first)) unlocked.push(first);
  const open = new Set(unlocked);
  const best: Record<string, TuneRecord> = {};
  for (const [id, rec] of Object.entries(raw.best ?? {})) {
    if (!known.has(id) || !rec || typeof rec !== 'object') continue;
    const grade = (rec.grade ?? null) as Grade;
    // Records written before the flag existed have to be read for it. The tune
    // after this one being open is the strong evidence — that is the only thing
    // passing has ever done — and a letter is the fallback for the last tune in
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
  return { unlocked, best };
}

export function saveProgress(key: string, progress: Progress): void {
  save(key, progress);
}

export function isUnlocked(progress: Progress, id: string): boolean {
  return progress.unlocked.includes(id);
}

/** The tune whose passing opens `id`, for the locked card's explanation. */
export function unlockedBy(order: readonly string[], id: string): string | null {
  const i = order.indexOf(id);
  return i > 0 ? order[i - 1] : null;
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
  return progress;
}

/**
 * Fold a finished run into the saved progress, and say what changed.
 *
 * Bests only ever improve: a bad run after a good one loses nothing, and
 * neither does a fifth attempt at the first tune once the fifth is open.
 *
 * The write goes through what is *stored* rather than straight over it. A mode
 * is built once and keeps its `Progress` for the whole session, so a second
 * window of the app — a browser tab beside the installed one is the easy way
 * to have two — holds a snapshot from before whatever the other has done
 * since, and finishing any run there would otherwise put storage back to it.
 * Replaying an early tune is exactly when that bites, because the snapshot is
 * oldest where the player has least left to earn.
 */
export function recordRun(
  key: string,
  progress: Progress,
  id: string,
  order: readonly string[],
  result: RunResult,
): RunOutcome {
  absorbProgress(progress, loadProgress(key, order));

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

  let unlocked: string | null = null;
  if (result.passed) {
    const next = order[order.indexOf(id) + 1];
    if (next && !progress.unlocked.includes(next)) {
      progress.unlocked.push(next);
      unlocked = next;
    }
  }

  saveProgress(key, progress);
  return { unlocked, improved, best };
}

/** Wipe every unlock and record. The settings panel confirms before calling. */
export function resetProgress(key: string, order: readonly string[]): Progress {
  const fresh: Progress = { unlocked: order.length ? [order[0]] : [], best: {} };
  saveProgress(key, fresh);
  return fresh;
}
