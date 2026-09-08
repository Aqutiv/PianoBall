import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKING_STORE, MELODY_STORE, hasPassed, loadProgress, recordRun, resetProgress } from '../src/modes/playtune/progress';
import { REVISED_BACKING_IDS, REVISED_MELODY_IDS } from '../src/modes/playtune/chartRevisions';
import { ROLES } from '../src/modes/playtune/role';

const record = { accuracy: .96, score: 8000, grade: 'S' as const, plays: 9, passed: true };
const pass = { accuracy: .8, score: 900, grade: 'B' as const, passed: true };
const write = (key: string, value: unknown) => localStorage.setItem(`pianoball.${key}`, JSON.stringify(value));
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

for (const [role, key, oldKey, revised] of [
  [ROLES.melody, MELODY_STORE, 'playtune.v3', REVISED_MELODY_IDS],
  [ROLES.chords, BACKING_STORE, 'playbacking.v2', REVISED_BACKING_IDS],
] as const) describe(`${role.id} corrected arrangement history`, () => {
  const changed = revised[0];
  const unchanged = role.order.find(id => !revised.includes(id))!;
  const seed = () => {
    write(oldKey, { unlocked: role.order.slice(0, 8), epoch: 4,
      best: { [changed]: record, [unchanged]: record },
      ...(role.id === 'chords' ? { unlockCredit: 3 } : {}) });
    return loadProgress(key, role.order);
  };

  it('archives changed targets but keeps accompaniment-only bests and earned access', () => {
    const progress = seed();
    expect(progress.best[changed]).toBeUndefined();
    expect(progress.previousBest?.[changed]).toEqual(record);
    expect(progress.best[unchanged]).toEqual(record);
    expect(progress.unlocked).toEqual(expect.arrayContaining(role.order.slice(0, 8)));
    expect(progress.epoch).toBe(4);
    expect(hasPassed(progress, changed)).toBe(true);
    expect(loadProgress(key, role.order)).toEqual(progress);
    expect(JSON.parse(localStorage.getItem(`pianoball.${oldKey}`)!).best[changed]).toEqual(record);
  });

  it('compares the first revised run only with current results and counts its pass once', () => {
    // Exactly four earned openings: counting the archived pass twice would
    // incorrectly reveal a fifth track on this first revised performance.
    write(oldKey, { unlocked: role.order.slice(0, 4), epoch: 4,
      best: { [changed]: record }, ...(role.id === 'chords' ? { unlockCredit: 0 } : {}) });
    const progress = loadProgress(key, role.order);
    expect(progress.unlocked).toHaveLength(4);
    const before = [...progress.unlocked];
    const outcome = recordRun(key, progress, changed, role.order, pass);
    expect(outcome.previous).toBeNull();
    expect(outcome.best).toEqual({ ...pass, plays: 1 });
    expect(outcome.unlocked).toBeNull();
    expect(progress.unlocked).toEqual(before);
    expect(progress.previousBest?.[changed]).toEqual(record);
    const replay = recordRun(key, progress, changed, role.order, { ...pass, accuracy: .7 });
    expect(replay.previous?.accuracy).toBe(.8);
    expect(replay.best.accuracy).toBe(.8);
  });

  it('preserves an unpassed historical attempt without fabricating a pass', () => {
    write(oldKey, { unlocked: [changed], best: { [changed]: { ...record, passed: false } } });
    const progress = loadProgress(key, role.order);
    expect(progress.previousBest?.[changed]?.passed).toBe(false);
    expect(hasPassed(progress, changed)).toBe(false);
  });

  it('keeps history when current tabs merge and clears it after a reset', () => {
    const first = seed();
    const stale = loadProgress(key, role.order);
    recordRun(key, first, changed, role.order, pass);
    recordRun(key, stale, unchanged, role.order, pass);
    expect(stale.best[changed].accuracy).toBe(.8);
    expect(stale.previousBest?.[changed]).toEqual(record);
    resetProgress(key, role.order);
    recordRun(key, stale, unchanged, role.order, pass);
    expect(stale.previousBest).toBeUndefined();
    expect(stale.best[changed]).toBeUndefined();
    expect(stale.best[unchanged].plays).toBe(1);
  });

  it('does not import old writes after migration or resurrect history after reset', () => {
    const progress = seed();
    write(oldKey, { unlocked: role.order, best: { [changed]: { ...record, plays: 100 } }, epoch: 999 });
    expect(loadProgress(key, role.order)).toEqual(progress);
    const fresh = resetProgress(key, role.order);
    expect(loadProgress(key, role.order)).toEqual(fresh);
    expect(fresh.previousBest).toBeUndefined();
  });

  it('respects an existing empty or corrupt newer store', () => {
    seed();
    write(key, { unlocked: [], best: {}, epoch: 6 });
    expect(loadProgress(key, role.order).previousBest).toBeUndefined();
    localStorage.setItem(`pianoball.${key}`, '{broken');
    expect(loadProgress(key, role.order).previousBest).toBeUndefined();
  });
});

it('prefers the latest existing predecessor, even when it is empty or corrupt', () => {
  write('playtune', { unlocked: ROLES.melody.order, best: { 'fur-elise': record } });
  localStorage.setItem('pianoball.playtune.v2', '{broken');
  const progress = loadProgress(MELODY_STORE, ROLES.melody.order);
  expect(progress.best).toEqual({});
  expect(progress.previousBest).toBeUndefined();
  expect(progress.unlocked).toHaveLength(3);
});


for (const [role, key, correctedKey, upstreamKey, olderKey, revised] of [
  [ROLES.melody, MELODY_STORE, 'playtune.musicality.v1', 'playtune.v3', 'playtune.v2', REVISED_MELODY_IDS],
  [ROLES.chords, BACKING_STORE, 'playbacking.musicality.v1', 'playbacking.v2', 'playbacking.v1', REVISED_BACKING_IDS],
] as const) describe(`${role.id} merged course generations`, () => {
  const changed = revised[0];
  const extras = role.id === 'chords' ? { unlockCredit: 0 } : {};

  it('imports upstream Hopscotch scores while archiving revised charts and retaining retired credit', () => {
    write(upstreamKey, { unlocked: role.order.slice(0, 6), epoch: 5, ...extras,
      best: { [changed]: record, hopscotch: { ...record, plays: 2 } }, retiredPasses: ['drift'] });
    const p = loadProgress(key, role.order);
    expect(p.best.hopscotch).toEqual({ ...record, plays: 2 });
    expect(p.previousBest?.[changed]).toEqual(record);
    expect(p.best[changed]).toBeUndefined();
    expect(p.retiredPasses).toEqual(['drift']);
    expect(p.unlocked).toHaveLength(6);
    expect(recordRun(key, p, changed, role.order, pass).unlocked).toBeNull();
    expect(recordRun(key, p, 'hopscotch', role.order, pass).previous?.plays).toBe(2);
    expect(p.unlocked).toHaveLength(6);
    write(upstreamKey, { unlocked: [], best: {}, epoch: 100 });
    expect(loadProgress(key, role.order)).toEqual(p);
  });

  it('keeps already-corrected bests and history while retiring Drift exactly once', () => {
    const current = { ...record, accuracy: .8, score: 900, plays: 2 };
    write(correctedKey, { unlocked: role.order.slice(0, 5).concat('drift'), epoch: 7, ...extras,
      best: { [changed]: current, drift: { ...record, passed: false } },
      previousBest: { [changed]: record, drift: record } });
    const p = loadProgress(key, role.order);
    expect(p.best[changed]).toEqual(current);
    expect(p.previousBest?.[changed]).toEqual(record);
    expect(p.best.drift).toBeUndefined();
    expect(p.previousBest?.drift).toBeUndefined();
    expect(p.best.hopscotch).toBeUndefined();
    expect(p.previousBest?.hopscotch).toBeUndefined();
    expect(p.retiredPasses).toEqual(['drift']);
    expect(p.unlocked).toContain('hopscotch');
    expect(p.unlocked).not.toContain('drift');
    expect(recordRun(key, p, changed, role.order, pass).previous).toEqual(current);
    expect(loadProgress(key, role.order)).toEqual(p);
    write(correctedKey, { unlocked: [], best: {}, epoch: 100 });
    write(upstreamKey, { unlocked: role.order, best: { hopscotch: record }, epoch: 101 });
    expect(loadProgress(key, role.order)).toEqual(p);
    resetProgress(key, role.order);
    recordRun(key, p, role.order[0], role.order, pass);
    expect(p.retiredPasses).toBeUndefined();
    expect(p.previousBest).toBeUndefined();
    expect(p.unlocked).toEqual(role.order.slice(0, 4));
    expect(Object.keys(p.best)).toEqual([role.order[0]]);
  });

  it.each([upstreamKey, correctedKey])('treats an empty or corrupt %s as a reset boundary', source => {
    write(olderKey, { unlocked: role.order, best: { [changed]: record }, epoch: 10, ...extras });
    if (source === correctedKey) write(upstreamKey, {
      unlocked: role.order, best: { hopscotch: record }, epoch: 11, ...extras });
    write(source, { unlocked: [], best: {}, epoch: 12, ...extras });
    expect(loadProgress(key, role.order)).toEqual({ unlocked: role.order.slice(0, 3), best: {}, epoch: 12, ...extras });
    localStorage.removeItem(`pianoball.${key}`);
    localStorage.setItem(`pianoball.${source}`, '{broken');
    expect(loadProgress(key, role.order)).toEqual({ unlocked: role.order.slice(0, 3), best: {}, epoch: 0, ...extras });
  });
});
