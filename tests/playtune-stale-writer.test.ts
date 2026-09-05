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
const write = (key: string, p: Progress) => localStorage.setItem(`pianoball.${key}`, JSON.stringify(p));

// Reproduce the destructive part of the shipped old client: it only knows its
// own order and writes the filtered record to the ORIGINAL key, never a copy.
function oldClientWrite(key: string, snapshot = raw(key)): void {
  const old = LEGACY_ORDERS[key];
  const p: Progress = {
    unlocked: snapshot.unlocked.filter(id => old.includes(id)),
    best: Object.fromEntries(Object.entries(snapshot.best).filter(([id]) => old.includes(id))),
    epoch: snapshot.epoch,
  };
  const id = old[0];
  p.best[id] = { ...pass, plays: (p.best[id]?.plays ?? 0) + 1 };
  write(key, p);
}

for (const role of Object.values(ROLES)) describe(`${role.id}: an old bundle stays open`, () => {
  function completedNewTune(): Progress {
    const p = loadProgress(role.storageKey, role.order);
    recordRun(role.storageKey, p, role.order[0], role.order, pass);
    recordRun(role.storageKey, p, 'frere-jacques', role.order, pass);
    return p;
  }

  it('restores new achievements after an old writer strips unknown IDs', () => {
    const before = completedNewTune();
    oldClientWrite(role.storageKey);
    expect(raw(role.storageKey).best['frere-jacques']).toBeUndefined();
    const recovered = loadProgress(role.storageKey, role.order);
    expect(recovered.best['frere-jacques']).toEqual(before.best['frere-jacques']);
    for (const id of before.unlocked) expect(recovered.unlocked).toContain(id);
    expect(recovered.best[role.order[0]].plays).toBe(2);
    // A second reload and stale write still cannot erase the protected copy.
    oldClientWrite(role.storageKey);
    expect(loadProgress(role.storageKey, role.order).best['frere-jacques']).toEqual(before.best['frere-jacques']);
  });

  it('retains an old-tab achievement arriving after the protected copy was seeded', () => {
    const p = completedNewTune();
    const oldId = LEGACY_ORDERS[role.storageKey][1];
    const stale = raw(role.storageKey);
    stale.best[oldId] = { ...pass, plays: 1 };
    oldClientWrite(role.storageKey, stale);
    const merged = loadProgress(role.storageKey, role.order);
    expect(merged.best[oldId]).toEqual(stale.best[oldId]);
    expect(merged.best['frere-jacques']).toEqual(p.best['frere-jacques']);
  });

  it('honors a deliberate reset from an older bundle', () => {
    const p = completedNewTune();
    write(role.storageKey, {
      unlocked: LEGACY_ORDERS[role.storageKey].slice(0, 3), best: {}, epoch: p.epoch + 1,
    });
    const reset = loadProgress(role.storageKey, role.order);
    expect(reset.epoch).toBe(p.epoch + 1);
    expect(reset.best).toEqual({});
    expect(loadProgress(role.storageKey, role.order)).toEqual(reset);
  });

  it('does not resurrect achievements when an old snapshot overwrites a newer reset', () => {
    const snapshot = structuredClone(completedNewTune());
    const reset = resetProgress(role.storageKey, role.order);
    oldClientWrite(role.storageKey, snapshot);
    expect(raw(role.storageKey).epoch).toBeLessThan(reset.epoch);
    expect(loadProgress(role.storageKey, role.order)).toEqual(reset);
    expect(loadProgress(role.storageKey, role.order)).toEqual(reset);
  });

  it.each([0, 2])('honors an epoch-less reset with protected epoch %i', epoch => {
    for (let i = 0; i < epoch; i++) resetProgress(role.storageKey, role.order);
    const before = completedNewTune();
    expect(before.epoch).toBe(epoch);
    // Verified against resetProgress in historical commit 64bd3dd.
    localStorage.setItem('pianoball.' + role.storageKey, JSON.stringify({
      unlocked: [LEGACY_ORDERS[role.storageKey][0]], best: {},
    }));
    const reset = loadProgress(role.storageKey, role.order);
    expect(reset).toEqual({ unlocked: role.order.slice(0, 3), best: {}, epoch: epoch + 1 });
    expect(raw(role.storageKey)).toEqual(reset);
    expect(loadProgress(role.storageKey, role.order)).toEqual(reset);
    recordRun(role.storageKey, reset, role.order[0], role.order, pass);
    expect(loadProgress(role.storageKey, role.order).best[role.order[0]]).toBeDefined();
  });

  it('migrates an empty legacy save once without inventing repeated resets', () => {
    localStorage.setItem('pianoball.' + role.storageKey, JSON.stringify({
      unlocked: [LEGACY_ORDERS[role.storageKey][0]], best: {},
    }));
    const fresh = loadProgress(role.storageKey, role.order);
    expect(fresh).toEqual({ unlocked: role.order.slice(0, 3), best: {}, epoch: 0 });
    expect(loadProgress(role.storageKey, role.order)).toEqual(fresh);
  });

  it('does not treat a missing or corrupt primary store as a confirmed old reset', () => {
    const before = completedNewTune();
    localStorage.removeItem('pianoball.' + role.storageKey);
    expect(loadProgress(role.storageKey, role.order)).toEqual(before);
    localStorage.setItem('pianoball.' + role.storageKey, '{broken');
    expect(loadProgress(role.storageKey, role.order)).toEqual(before);
  });

  it('merges recovered achievements into a subsequent current-client run', () => {
    completedNewTune();
    oldClientWrite(role.storageKey);
    const p = loadProgress(role.storageKey, role.order);
    recordRun(role.storageKey, p, 'frere-jacques', role.order, { ...pass, passed: false, accuracy: 0.1, score: 1 });
    expect(p.best['frere-jacques']).toEqual({ ...pass, plays: 2 });
    expect(raw(role.storageKey).best['frere-jacques']).toEqual(p.best['frere-jacques']);
  });
});
