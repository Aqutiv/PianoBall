import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEGACY_ORDERS } from '../src/modes/playtune/legacyOrder';
import { ROLES } from '../src/modes/playtune/role';
import { loadProgress, recordRun, resetProgress, type Progress } from '../src/modes/playtune/progress';

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());
const pass = { accuracy: 0.92, score: 6543, grade: 'A', passed: true } as const;
const raw = (key: string): Progress => JSON.parse(localStorage.getItem(`pianoball.${key}`)!);
const write = (key: string, p: unknown) => localStorage.setItem(`pianoball.${key}`, JSON.stringify(p));

for (const role of Object.values(ROLES)) describe(`${role.id}: independent course generations`, () => {
  const legacyKey = role.id === 'melody' ? 'playtune' : 'playchords';
  const old = LEGACY_ORDERS[legacyKey];
  function seedLegacy(): Progress {
    const p: Progress = {
      unlocked: old.slice(0, 3), best: { [old[0]]: { ...pass, plays: 4 } }, epoch: 2,
    };
    write(legacyKey, p);
    return p;
  }
  function oldClientRun(): void {
    const p = raw(legacyKey);
    p.unlocked = p.unlocked.filter(id => old.includes(id));
    p.best = Object.fromEntries(Object.entries(p.best).filter(([id]) => old.includes(id)));
    p.best[old[0]] = { ...pass, plays: (p.best[old[0]]?.plays ?? 0) + 1 };
    write(legacyKey, p);
  }

  it('copies existing progress once in the same format, without modifying the legacy store', () => {
    const oldSave = seedLegacy();
    const p = loadProgress(role.storageKey, role.order);
    expect(role.storageKey).not.toBe(legacyKey);
    expect(p.best).toEqual(oldSave.best);
    expect(p.epoch).toBe(oldSave.epoch);
    for (const id of oldSave.unlocked) expect(p.unlocked).toContain(id);
    expect(raw(role.storageKey)).toEqual(p);
    expect(raw(legacyKey)).toEqual(oldSave);
    expect(loadProgress(role.storageKey, role.order)).toEqual(p);
  });

  it('keeps new scores when an old client filters and writes its own course', () => {
    seedLegacy();
    const p = loadProgress(role.storageKey, role.order);
    recordRun(role.storageKey, p, 'frere-jacques', role.order, pass);
    oldClientRun();
    expect(raw(legacyKey).best['frere-jacques']).toBeUndefined();
    expect(loadProgress(role.storageKey, role.order)).toEqual(p);
    expect(raw(legacyKey).best[old[0]].plays).toBe(5);
  });

  it('retains post-reset runs in an epoch-less old course without resetting the new course', () => {
    seedLegacy();
    const p = loadProgress(role.storageKey, role.order);
    recordRun(role.storageKey, p, 'frere-jacques', role.order, pass);
    // Exact reset shape from historical commit 64bd3dd.
    write(legacyKey, { unlocked: [old[0]], best: {} });
    expect(loadProgress(role.storageKey, role.order)).toEqual(p);
    oldClientRun();
    const oldRun = raw(legacyKey);
    expect(oldRun.best[old[0]]).toEqual({ ...pass, plays: 1 });
    expect(Object.hasOwn(oldRun, 'epoch')).toBe(false);
    expect(loadProgress(role.storageKey, role.order)).toEqual(p);
    expect(raw(legacyKey)).toEqual(oldRun);
  });

  it('isolates resets with epochs as well as epoch-less resets', () => {
    seedLegacy();
    const p = loadProgress(role.storageKey, role.order);
    write(legacyKey, { unlocked: old.slice(0, 3), best: {}, epoch: p.epoch + 10 });
    expect(loadProgress(role.storageKey, role.order)).toEqual(p);
  });

  it('never re-imports a stale old snapshot after a current-course reset', () => {
    seedLegacy();
    loadProgress(role.storageKey, role.order);
    const reset = resetProgress(role.storageKey, role.order);
    oldClientRun();
    expect(loadProgress(role.storageKey, role.order)).toEqual(reset);
    expect(reset.best).toEqual({});
    expect(raw(legacyKey).best[old[0]].plays).toBe(5);
  });

  it('acknowledges even an empty first migration', () => {
    const fresh = loadProgress(role.storageKey, role.order);
    expect(fresh).toEqual({ unlocked: role.order.slice(0, 3), best: {}, epoch: 0 });
    expect(raw(role.storageKey)).toEqual(fresh);
    seedLegacy();
    expect(loadProgress(role.storageKey, role.order)).toEqual(fresh);
  });

  it('does not resurrect legacy scores when the current store is corrupt', () => {
    const legacy = seedLegacy();
    loadProgress(role.storageKey, role.order);
    resetProgress(role.storageKey, role.order);
    localStorage.setItem(`pianoball.${role.storageKey}`, '{broken');
    expect(loadProgress(role.storageKey, role.order).best).toEqual({});
    expect(raw(legacyKey)).toEqual(legacy);
  });
});
