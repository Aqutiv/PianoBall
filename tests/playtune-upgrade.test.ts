import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEGACY_ORDERS } from '../src/modes/playtune/legacyOrder';
import { ROLES } from '../src/modes/playtune/role';
import { loadProgress, recordRun, saveProgress } from '../src/modes/playtune/progress';

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());
const record = { accuracy: 0.73, score: 12345, grade: null, plays: 4, passed: true } as const;
const pass = { accuracy: 0.9, score: 15000, grade: 'A', passed: true } as const;

for (const role of [ROLES.melody]) describe(`${role.id} course expansion`, () => {
  const legacyKey = role.id === 'melody' ? 'playtune' : 'playchords';
  const old = LEGACY_ORDERS[legacyKey];
  it('starts with three open tracks and can complete the whole expanded course', () => {
    const p = loadProgress(role.storageKey, role.order);
    expect(p.unlocked).toEqual(role.order.slice(0, 3));
    expect(p.best).toEqual({});
    for (const id of role.order) {
      expect(p.unlocked).toContain(id);
      recordRun(role.storageKey, p, id, role.order, pass);
    }
    expect(p.unlocked).toEqual(role.order);
    expect(Object.values(p.best).every(r => r.passed)).toBe(true);
  });

  it.each([1, 5, old.length])('preserves a save with %i previously passed tracks', count => {
    const best = Object.fromEntries(old.slice(0, count).map(id => [id, { ...record }]));
    const unlocked = old.slice(0, Math.min(old.length, count + 3));
    localStorage.setItem(`pianoball.${legacyKey}`, JSON.stringify({ unlocked, best, epoch: 7 }));
    const p = loadProgress(role.storageKey, role.order);
    expect(p.epoch).toBe(7);
    expect({ ...p.previousBest, ...p.best }).toEqual(best);
    for (const id of unlocked) expect(p.unlocked).toContain(id);
    for (const id of role.order.filter(id => !old.includes(id))) {
      expect(p.best[id]).toBeUndefined();
    }
    saveProgress(role.storageKey, p);
    expect(loadProgress(role.storageKey, role.order)).toEqual(p);
  });

  it('uses the historical successor at every insertion boundary for missing flags', () => {
    for (let i = 0; i < old.length - 1; i++) {
      const id = old[i], next = old[i + 1];
      const { passed: _passed, ...legacy } = record;
      localStorage.removeItem(`pianoball.${role.storageKey}`);
      localStorage.setItem(`pianoball.${legacyKey}`, JSON.stringify({ unlocked: [id, next], best: { [id]: legacy } }));
      const p = loadProgress(role.storageKey, role.order);
      expect(p.best[id] ?? p.previousBest?.[id], id).toEqual(record);
      expect(p.unlocked).toContain(next);
    }
  });

  it('preserves a fully completed legacy course, including its final grade', () => {
    const best = Object.fromEntries(old.map((id, i) => [id, {
      accuracy: 0.73, score: 12345, plays: 4, grade: i === old.length - 1 ? 'B' : null,
    }]));
    localStorage.setItem(`pianoball.${legacyKey}`, JSON.stringify({ unlocked: old, best }));
    const p = loadProgress(role.storageKey, role.order);
    for (const id of old) {
      expect((p.best[id] ?? p.previousBest?.[id])?.passed, id).toBe(true);
      expect((p.best[id] ?? p.previousBest?.[id])?.score).toBe(12345);
      expect(p.unlocked).toContain(id);
    }
    // New material remains earnable; old completions don't fabricate new scores.
    for (const id of role.order) if (!old.includes(id)) {
      expect(p.unlocked).toContain(id);
      recordRun(role.storageKey, p, id, role.order, pass);
    }
    expect(new Set(p.unlocked)).toEqual(new Set(role.order));
  });

  it('respects explicit false even when the successor is unlocked', () => {
    const id = old[0];
    localStorage.setItem(`pianoball.${role.storageKey}`, JSON.stringify({
      unlocked: old, best: { [id]: { ...record, passed: false } },
    }));
    expect(loadProgress(role.storageKey, role.order).best[id].passed).toBe(false);
  });

  it('never infers passes from automatic opening tracks', () => {
    const id = old[0];
    localStorage.setItem(`pianoball.${role.storageKey}`, JSON.stringify({
      unlocked: [id], best: { [id]: { accuracy: 0.1, score: 20, plays: 1, grade: null } },
    }));
    const p = loadProgress(role.storageKey, role.order);
    expect(p.best[id].passed).toBe(false);
    expect(p.unlocked).toEqual(role.order.slice(0, 3));
  });

  it('keeps scores, passes and unlocks when replaying an old track below its pass mark', () => {
    const id = old[0];
    saveProgress(role.storageKey, { unlocked: [...old], best: { [id]: { ...record } }, epoch: 2 });
    const p = loadProgress(role.storageKey, role.order);
    recordRun(role.storageKey, p, id, role.order, { accuracy: 0.1, score: 20, grade: null, passed: false });
    expect(p.best[id]).toEqual({ ...record, plays: 5 });
    for (const unlocked of old) expect(p.unlocked).toContain(unlocked);
    const other = Object.values(ROLES).find(r => r.id !== role.id)!;
    expect(loadProgress(other.storageKey, other.order).best).toEqual({});
  });
});
