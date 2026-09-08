import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TUNE_ORDER } from '../src/modes/playtune/library';
import { CHORD_ORDER } from '../src/modes/playtune/library/chordcurve';
import { CA92_MELODY_ORDER, CA92_BACKING_ORDER } from './fixtures/course-orders-ca92';
import {
  BACKING_STORE, CHORD_STORE, MELODY_STORE, loadProgress, recordRun, resetProgress,
  type Progress,
} from '../src/modes/playtune/progress';

const pass = { accuracy: .95, score: 9500, grade: 'A' as const, passed: true };
const record = { ...pass, plays: 7 };
const write = (key: string, value: unknown) => localStorage.setItem(`pianoball.${key}`, JSON.stringify(value));
const read = (key: string): Progress => JSON.parse(localStorage.getItem(`pianoball.${key}`)!);

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

for (const [key, source, order] of [
  [MELODY_STORE, 'playtune.v2', CA92_MELODY_ORDER],
  [BACKING_STORE, 'playbacking.v1', CA92_BACKING_ORDER],
] as const) describe(`${key}: replacing Drift with Hopscotch`, () => {
  const oldOrder = order.map(id => id === 'hopscotch' ? 'drift' : id);
  const load = () => loadProgress(key, order);
  function seed(): Progress {
    const p: Progress = {
      unlocked: oldOrder.slice(0, 8),
      best: Object.fromEntries([...oldOrder.slice(0, 4), 'drift'].map(id => [id, { ...record }])),
      epoch: 2,
      ...(key === BACKING_STORE ? { unlockCredit: 0 } : {}),
    };
    write(source, p);
    return p;
  }

  it('keeps access, other scores, and the earned unlock while giving the new composition a clean record', () => {
    const original = seed();
    const p = load();
    expect(p.unlocked).toEqual(order.slice(0, 8));
    expect(p.unlocked).toContain('hopscotch');
    expect(p.unlocked).not.toContain('drift');
    expect(p.best.drift).toBeUndefined();
    expect(p.best.hopscotch).toBeUndefined();
    expect(p.best[order[0]] ?? p.previousBest?.[order[0]]).toEqual(record);
    expect(p.retiredPasses).toEqual(['drift']);
    expect(p.epoch).toBe(2);
    expect(read(source)).toEqual(original);
    expect(read(key)).toEqual(p);

    const first = recordRun(key, p, 'hopscotch', order,
      { accuracy: .7, score: 700, grade: 'B', passed: true });
    expect(first.previous).toBeNull();
    expect(first.best).toEqual({ accuracy: .7, score: 700, grade: 'B', passed: true, plays: 1 });
    expect(first.unlocked).toBe(order[8]);
    expect(load().unlocked).toHaveLength(9);
    expect(recordRun(key, p, 'hopscotch', order, pass).unlocked).toBeNull();
  });

  it('transfers access for an unpassed Drift without fabricating a pass', () => {
    const original = seed();
    original.best.drift.passed = false;
    write(source, original);
    const p = load();
    expect(p.unlocked).toEqual(order.slice(0, 8));
    expect(p.retiredPasses).toBeUndefined();
    expect(p.best.drift).toBeUndefined();
    expect(p.best.hopscotch).toBeUndefined();
  });

  it('merges current windows without adding the retired unlock again on every save', () => {
    seed();
    const a = load(), b = load();
    recordRun(key, a, 'hopscotch', order, pass);
    recordRun(key, b, order[4], order, pass);
    expect(load().unlocked).toHaveLength(10);
    for (let i = 0; i < 3; i++) {
      recordRun(key, a, order[0], order, pass);
      expect(load().unlocked).toHaveLength(10);
      expect(load().retiredPasses).toEqual(['drift']);
    }
    expect(load().best.hopscotch.plays).toBe(1);
  });

  it('ignores old-bundle scores and resets after the one-time import', () => {
    seed();
    const p = load();
    recordRun(key, p, 'hopscotch', order, pass);
    write(source, { unlocked: [], best: {}, epoch: 100 });
    expect(load()).toEqual(p);
    write(source, { unlocked: oldOrder, best: { drift: record }, epoch: 101 });
    expect(load()).toEqual(p);
  });

  it('removes retired credit at reset and rejects it from a stale current window', () => {
    seed();
    const stale = load();
    recordRun(key, stale, 'hopscotch', order, pass);
    const fresh = resetProgress(key, order);
    expect(fresh.retiredPasses).toBeUndefined();
    expect(fresh.unlocked).toEqual(order.slice(0, 3));
    expect(fresh.epoch).toBe(3);
    recordRun(key, stale, order[0], order, pass);
    const reloaded = load();
    expect(reloaded.unlocked).toEqual(order.slice(0, 4));
    expect(reloaded.retiredPasses).toBeUndefined();
    expect(Object.keys(reloaded.best)).toEqual([order[0]]);
    expect(reloaded.unlockCredit ?? 0).toBe(0);
  });

  it('does not resurrect older progress behind an empty or corrupt previous generation', () => {
    const fallback = key === MELODY_STORE ? 'playtune' : CHORD_STORE;
    write(fallback, { unlocked: oldOrder, best: { drift: record }, epoch: 10 });
    write(source, { unlocked: [], best: {}, epoch: 3 });
    expect(load().unlocked).toEqual(order.slice(0, 3));
    expect(load().best).toEqual({});
    expect(load().epoch).toBe(3);
    localStorage.removeItem(`pianoball.${key}`);
    localStorage.setItem(`pianoball.${source}`, '{broken');
    expect(load().unlocked).toEqual(order.slice(0, 3));
    expect(load().retiredPasses).toBeUndefined();
  });

  it('deduplicates and validates stored retired-pass markers', () => {
    write(key, {
      unlocked: [], best: { drift: record }, epoch: 0,
      retiredPasses: ['drift', 'drift', 'bogus'],
      ...(key === BACKING_STORE ? { unlockCredit: 0 } : {}),
    });
    for (let i = 0; i < 3; i++) {
      const p = load();
      expect(p.retiredPasses).toEqual(['drift']);
      expect(p.unlocked).toEqual(order.slice(0, 4));
      expect(p.best).toEqual({});
    }
  });
});

describe('historical melody pass evidence around the replaced slot', () => {
  it('uses Drift as Scarborough Fair’s successor and preserves Drift’s earned unlock', () => {
    write('playtune', {
      unlocked: ['scarborough-fair', 'drift', 'greensleeves'], epoch: 0,
      best: {
        'scarborough-fair': { accuracy: .8, score: 4, plays: 1, grade: null },
        drift: { accuracy: .8, score: 4, plays: 1, grade: null },
      },
    });
    const p = loadProgress(MELODY_STORE, TUNE_ORDER);
    expect(p.previousBest?.['scarborough-fair'].passed).toBe(true);
    expect(p.best.drift).toBeUndefined();
    expect(p.best.hopscotch).toBeUndefined();
    expect(p.retiredPasses).toEqual(['drift']);
    expect(p.unlocked).toEqual(expect.arrayContaining(['hopscotch', 'greensleeves']));
    expect(loadProgress(MELODY_STORE, TUNE_ORDER)).toEqual(p);
  });
});
describe('existing Backing imports through the replacement', () => {
  it('keeps imported access credit separate from the retired composition’s pass', () => {
    const order = CA92_BACKING_ORDER;
    const oldOrder = order.map(id => id === 'hopscotch' ? 'drift' : id);
    write('playbacking.v1', {
      unlocked: oldOrder.slice(0, 9), epoch: 4, unlockCredit: 2,
      best: Object.fromEntries([...oldOrder.slice(0, 3), 'drift'].map(id => [id, record])),
    });
    const p = loadProgress(BACKING_STORE, order);
    expect(p.unlockCredit).toBe(2);
    expect(p.retiredPasses).toEqual(['drift']);
    expect(p.unlocked).toEqual(order.slice(0, 9));
    expect(recordRun(BACKING_STORE, p, 'hopscotch', order, pass).unlocked).toBe(order[9]);
    expect(loadProgress(BACKING_STORE, order).unlockCredit).toBe(2);
    expect(loadProgress(BACKING_STORE, order).unlocked).toHaveLength(10);
  });

  it('does not infer a retired pass from an unrelated opening song', () => {
    const { passed: _passed, ...ungraded } = { ...record, grade: null };
    write('playbacking.v1', {
      unlocked: [CHORD_ORDER[0], 'drift'], best: { drift: ungraded }, epoch: 0, unlockCredit: 0,
    });
    const p = loadProgress(BACKING_STORE, CHORD_ORDER);
    expect(p.retiredPasses).toBeUndefined();
    expect(p.best).toEqual({});
    expect(p.unlocked).toContain('hopscotch');
  });
});