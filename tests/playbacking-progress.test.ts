import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { BACKING_STORE, CHORD_STORE, MELODY_STORE, loadProgress, recordRun, resetProgress, passesNeeded } from '../src/modes/playtune/progress';
import { CHORD_ORDER } from '../src/modes/playtune/library/chordcurve';
import { LEGACY_ORDERS } from '../src/modes/playtune/legacyOrder';

const pass = { accuracy: .9, score: 1234, grade: 'A' as const, passed: true };
const write = (key: string, value: unknown) => localStorage.setItem(`pianoball.${key}`, JSON.stringify(value));
const read = (key: string) => localStorage.getItem(`pianoball.${key}`);
const load = () => loadProgress(BACKING_STORE, CHORD_ORDER);
beforeEach(() => {
  const data = new Map<string,string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string,v: string) => data.set(k,v), removeItem: (k: string) => data.delete(k) });
});
afterEach(() => vi.unstubAllGlobals());

describe('Backing access migration', () => {
  it('starts fresh with exactly three tracks, and completes the entire course', () => {
    const p = load();
    expect(p).toEqual({ unlocked: CHORD_ORDER.slice(0,3), best: {}, epoch: 0, unlockCredit: 0 });
    for (const id of CHORD_ORDER) {
      expect(p.unlocked).toContain(id);
      recordRun(BACKING_STORE,p,id,CHORD_ORDER,pass);
    }
    expect(p.unlocked).toEqual(CHORD_ORDER);
  });
  it.each([CHORD_STORE, 'playchords'])('imports %s access but never its scores or pass flags', source => {
    const ids = ['chord-ground','chord-three','drift','chord-march','first-light','two-hands'];
    write(source, { unlocked: ids, best: { drift: { ...pass, plays: 8 } }, epoch: 7 });
    const before = read(source);
    const p = load();
    expect(p.best).toEqual({});
    expect(p.unlocked).toHaveLength(6);
    expect(p.unlocked).toEqual(expect.arrayContaining(['chord-ground','drift','chord-march',...CHORD_ORDER.slice(0,3)]));
    expect(p.unlockCredit).toBe(3);
    expect(read(source)).toBe(before);
    expect(load()).toEqual(p);
    expect(p.unlocked).not.toContain('chord-three');
    const next = CHORD_ORDER.find(id => !p.unlocked.includes(id))!;
    expect(passesNeeded(p,CHORD_ORDER,next)).toBe(1);
    expect(recordRun(BACKING_STORE,p,CHORD_ORDER[0],CHORD_ORDER,pass).unlocked).toBe(next);
    expect(recordRun(BACKING_STORE,p,CHORD_ORDER[0],CHORD_ORDER,pass).unlocked).toBeNull();
  });
  it('prefers v2 even when it is empty or corrupt rather than resurrecting older progress', () => {
    write('playchords', { unlocked: LEGACY_ORDERS.playchords, best: {} });
    write(CHORD_STORE, { unlocked: [], best: {} });
    expect(load().unlocked).toEqual(CHORD_ORDER.slice(0,3));
    localStorage.removeItem(`pianoball.${BACKING_STORE}`);
    localStorage.setItem(`pianoball.${CHORD_STORE}`, '{broken');
    expect(load().unlocked).toEqual(CHORD_ORDER.slice(0,3));
  });
  it('preserves a late unlocked song while filling earlier access in the new order', () => {
    write(CHORD_STORE, { unlocked: ['the-entertainer','chord-three','first-light','two-hands','drift'], best: {} });
    const p = load();
    expect(p.unlocked).toContain('the-entertainer');
    expect(p.unlocked).toContain('drift');
    expect(p.unlocked.slice(0,3)).toEqual(CHORD_ORDER.slice(0,3));
    const before = p.unlocked.length;
    const next = CHORD_ORDER.find(id => !p.unlocked.includes(id));
    expect(recordRun(BACKING_STORE,p,'drift',CHORD_ORDER,pass).unlocked).toBe(next);
    expect(p.unlocked).toHaveLength(before+1);
  });
  it('caps fully unlocked old access at nineteen without fabricating achievements', () => {
    write(CHORD_STORE, { unlocked: [...CHORD_ORDER,'chord-three','first-light','two-hands'], best: {} });
    const p = load();
    expect(p.unlocked).toEqual(CHORD_ORDER);
    expect(p.unlockCredit).toBe(16);
    expect(p.best).toEqual({});
  });
  it('recognizes legacy pass evidence when restoring earned access', () => {
    write('playchords', { unlocked: ['chord-ground','chord-three'], best: { 'chord-ground': { accuracy: .8, score: 5, plays: 2, grade: null } } });
    const p = load();
    expect(p.unlocked).toContain('chord-march');
    expect(p.best).toEqual({});
  });
  it('ignores duplicate and unknown legacy IDs', () => {
    write(CHORD_STORE, { unlocked: ['chord-ground','chord-ground','bogus'], best: {} });
    expect(load().unlocked).toEqual(CHORD_ORDER.slice(0,3));
  });
  it('isolates old-client writes and resets from the new course', () => {
    const p = load();
    recordRun(BACKING_STORE,p,CHORD_ORDER[0],CHORD_ORDER,pass);
    write(CHORD_STORE,{ unlocked: [], best: {}, epoch: 100 });
    expect(load()).toEqual(p);
    write(MELODY_STORE,{ unlocked: ['first-light'], best: {} });
    expect(load()).toEqual(p);
  });
  it('merges first passes from current tabs without duplicating unlocks', () => {
    const a=load(), b=load();
    recordRun(BACKING_STORE,a,CHORD_ORDER[0],CHORD_ORDER,pass);
    recordRun(BACKING_STORE,b,CHORD_ORDER[1],CHORD_ORDER,pass);
    expect(load().unlocked).toHaveLength(5);
    recordRun(BACKING_STORE,a,CHORD_ORDER[0],CHORD_ORDER,pass);
    expect(load().unlocked).toHaveLength(5);
    expect(Object.keys(load().best)).toHaveLength(2);
  });
  it('resets import credit and rejects stale scores and credit after reset', () => {
    write(CHORD_STORE, { unlocked: CHORD_ORDER, best: {} });
    const stale=load();
    recordRun(BACKING_STORE,stale,'drift',CHORD_ORDER,pass);
    const fresh=resetProgress(BACKING_STORE,CHORD_ORDER);
    expect(fresh).toEqual({ unlocked: CHORD_ORDER.slice(0,3), best: {}, epoch: 1, unlockCredit: 0 });
    recordRun(BACKING_STORE,stale,CHORD_ORDER[0],CHORD_ORDER,pass);
    expect(load().unlocked).toHaveLength(4);
    expect(load().unlockCredit).toBe(0);
    expect(load().best.drift).toBeUndefined();
    expect(read(CHORD_STORE)).not.toBeNull();
  });
});
