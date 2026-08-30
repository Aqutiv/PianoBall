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
  const best: Record<string, TuneRecord> = {};
  for (const [id, rec] of Object.entries(raw.best ?? {})) {
    if (!known.has(id) || !rec || typeof rec !== 'object') continue;
    best[id] = {
      accuracy: Number(rec.accuracy) || 0,
      score: Number(rec.score) || 0,
      grade: (rec.grade ?? null) as Grade,
      plays: Number(rec.plays) || 0,
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

/**
 * Fold a finished run into the saved progress, and say what changed.
 * Bests only ever improve: a bad run after a good one loses nothing.
 */
export function recordRun(
  key: string,
  progress: Progress,
  id: string,
  order: readonly string[],
  result: RunResult,
): RunOutcome {
  const prev = progress.best[id];
  const improved = !prev || result.accuracy > prev.accuracy;
  const best: TuneRecord = {
    accuracy: Math.max(prev?.accuracy ?? 0, result.accuracy),
    score: Math.max(prev?.score ?? 0, result.score),
    grade: improved ? result.grade : (prev?.grade ?? result.grade),
    plays: (prev?.plays ?? 0) + 1,
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
