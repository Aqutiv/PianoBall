import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compilePublishedCatalog } from '../src/content/export';
import { LIBRARY, findTune } from '../src/modes/playtune/library';
import { CHORD_CURVE } from '../src/modes/playtune/library/chordcurve';
import { CLASSICS } from '../src/modes/playtune/library/classics';
import { loadProgress, recordRun, resetProgress, saveProgress, type Progress } from '../src/modes/playtune/progress';
import { ROLES } from '../src/modes/playtune/role';
import { REVISED_BACKING_IDS, REVISED_MELODY_IDS } from '../src/modes/playtune/chartRevisions';
import { resetPlayTuneSettings, setPlayTuneSettings } from '../src/modes/playtune/settings';
import { CA92_MELODY_ORDER, CA92_BACKING_ORDER } from './fixtures/course-orders-ca92';

const additions = ['yankee-doodle', 'la-bamba', 'irish-washerwoman'];
const baseline = { melody: CA92_MELODY_ORDER, chords: CA92_BACKING_ORDER };
const expanded = {
  melody: [
    'first-light', 'ode-to-joy', 'twinkle', 'frere-jacques', 'amazing-grace',
    'scarborough-fair', 'hopscotch', 'yankee-doodle', 'drunken-sailor', 'greensleeves',
    'fur-elise', 'londonderry-air', 'la-bamba', 'le-temps-des-cerises', 'hava-nagila', 'can-can', 'minuet-in-g', 'gymnopedie',
    'two-hands', 'irish-washerwoman', 'blue-danube', 'canon-in-d', 'jesu-joy', 'the-entertainer',
  ],
  chords: [
    'frere-jacques', 'ode-to-joy', 'chord-ground', 'twinkle', 'chord-march',
    'yankee-doodle', 'hopscotch', 'drunken-sailor', 'canon-in-d', 'amazing-grace',
    'scarborough-fair', 'la-bamba', 'le-temps-des-cerises', 'hava-nagila', 'gymnopedie', 'londonderry-air', 'greensleeves',
    'irish-washerwoman', 'can-can', 'blue-danube', 'fur-elise', 'minuet-in-g', 'jesu-joy', 'the-entertainer',
  ],
};
const provenance = { sourceCommit: null, sourceDirty: null };
const passing = { accuracy: 0.9, score: 12000, grade: 'A' as const, passed: true };
const oldRecord = { accuracy: 0.8, score: 10000, grade: 'B' as const, passed: true, plays: 4 };

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
  resetPlayTuneSettings();
});
afterEach(() => { resetPlayTuneSettings(); vi.unstubAllGlobals(); });

describe('traditional course expansion', () => {
  it('publishes 24 courses per role at their approved teaching positions', () => {
    expect(LIBRARY).toHaveLength(24);
    expect(CHORD_CURVE).toHaveLength(24);
    const catalog = compilePublishedCatalog(provenance);
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.entries).toHaveLength(48);
    for (const role of Object.values(ROLES)) {
      expect(role.order).toEqual(expanded[role.id]);
      expect(role.order.filter(id => !additions.includes(id) && !['le-temps-des-cerises', 'hava-nagila'].includes(id))).toEqual(baseline[role.id]);
      expect(role.order.slice(0, 3)).toEqual(baseline[role.id].slice(0, 3));
      expect(catalog.entries.filter(entry => entry.role === role.id).map(entry => entry.id)).toEqual(role.order);
    }
    for (const [index, id] of additions.entries()) {
      const tune = findTune(id)!;
      expect(tune.origin).toBe('classic');
      expect(CLASSICS).toContain(tune);
      for (const role of Object.values(ROLES)) {
        const card = role.card(tune);
        expect(card.difficulty).toBe([2, 3, 4][index]);
        expect(card.pass).toBe((role.id === 'melody' ? [0.63, 0.65, 0.67] : [0.60, 0.63, 0.67])[index]);
      }
      expect(ROLES.melody.card(tune).teaches).not.toBe(ROLES.chords.card(tune).teaches);
    }
  });

  it('exports percussion for all originals and the new dances, leaving the 36 undrummed classic entries unchanged', () => {
    const catalog = compilePublishedCatalog(provenance);
    const rhythmic = catalog.entries.filter(entry => entry.drumEvents?.length);
    expect(rhythmic).toHaveLength(12);
    let oldClassics = 0;
    for (const role of Object.values(ROLES)) for (const tune of role.tunes) {
      const entry = catalog.entries.find(item => item.role === role.id && item.id === tune.id)!;
      if (tune.origin === 'original' || additions.includes(tune.id)) {
        expect(entry.drumEvents?.length, role.id + ':' + tune.id).toBeGreaterThan(0);
      } else {
        oldClassics++;
        expect(Object.hasOwn(entry, 'drumEvents'), role.id + ':' + tune.id).toBe(false);
      }
    }
    expect(oldClassics).toBe(36);
    for (const id of ['hopscotch', ...additions]) {
      const [melody, backing] = catalog.entries.filter(entry => entry.id === id);
      expect(melody.drumEvents).toEqual(backing.drumEvents);
    }
  });

  it('exports the same authored catalogue with the playback rhythm switch on or off', () => {
    setPlayTuneSettings({ rhythmEnabled: true });
    const enabled = compilePublishedCatalog(provenance);
    setPlayTuneSettings({ rhythmEnabled: false, role: 'chords' });
    expect(compilePublishedCatalog(provenance)).toEqual(enabled);
  });
});

for (const role of Object.values(ROLES)) describe(role.id + ' progress through added traditional courses', () => {
  const oldOrder = baseline[role.id];
  const revised = role.id === 'melody' ? REVISED_MELODY_IDS : REVISED_BACKING_IDS;
  it.each([0, 6, 19].flatMap(count => [false, true].map(history => [count, history] as const)))(
    'preserves a current save with %i passed courses (history=%s) and leaves inserted records unplayed', (passedCount, history) => {
    const credit = role.id === 'chords' && passedCount > 0 ? 2 : 0;
    const retired = passedCount > 0 ? ['drift'] : undefined;
    const initial: Progress = {
      unlocked: oldOrder.slice(0, Math.min(oldOrder.length, 3 + passedCount + credit + (retired?.length ?? 0))),
      best: Object.fromEntries(oldOrder.slice(0, passedCount)
        .filter(id => !history || !revised.includes(id)).map(id => [id, { ...oldRecord }])),
      ...(history && oldOrder.slice(0, passedCount).some(id => revised.includes(id)) ? {
        previousBest: Object.fromEntries(oldOrder.slice(0, passedCount)
          .filter(id => revised.includes(id)).map(id => [id, { ...oldRecord }])),
      } : {}),
      epoch: 7,
      ...(role.id === 'chords' ? { unlockCredit: credit } : {}),
      ...(retired ? { retiredPasses: retired } : {}),
    };
    saveProgress(role.storageKey, initial);
    const progress = loadProgress(role.storageKey, role.order);
    expect(progress.best).toEqual(initial.best);
    expect(progress.previousBest).toEqual(initial.previousBest);
    expect(progress.epoch).toBe(initial.epoch);
    expect(progress.unlockCredit).toBe(initial.unlockCredit);
    expect(progress.retiredPasses).toEqual(initial.retiredPasses);
    for (const id of initial.unlocked) expect(progress.unlocked).toContain(id);
    for (const id of additions) {
      expect(progress.best[id]).toBeUndefined();
      expect(progress.previousBest?.[id]).toBeUndefined();
    }
    if (passedCount === oldOrder.length) expect(new Set(progress.unlocked)).toEqual(new Set(role.order));

    // Complete available material, including inserted songs, without granting
    // a score merely because old progress opened access to it.
    for (let attempts = 0; attempts < role.order.length; attempts++) {
      const next = role.order.find(id => progress.unlocked.includes(id) && !progress.best[id]?.passed);
      if (!next) break;
      const before = progress.unlocked.length;
      recordRun(role.storageKey, progress, next, role.order, passing);
      expect(progress.unlocked.length - before).toBeLessThanOrEqual(1);
    }
    expect(new Set(progress.unlocked)).toEqual(new Set(role.order));
    expect(role.order.every(id => progress.best[id]?.passed)).toBe(true);
    const first = additions[0];
    expect(recordRun(role.storageKey, progress, first, role.order, passing).unlocked).toBeNull();
  });

  it.each([false, true])('imports the Drift course (already corrected=%s) without scores for replacement or inserted songs', corrected => {
    const source = corrected
      ? role.id === 'melody' ? 'playtune.musicality.v1' : 'playbacking.musicality.v1'
      : role.id === 'melody' ? 'playtune.v2' : 'playbacking.v1';
    const oldIds = oldOrder.map(id => id === 'hopscotch' ? 'drift' : id);
    const oldSave: Progress = {
      unlocked: [...oldIds],
      best: Object.fromEntries(oldIds.map(id => [id, { ...oldRecord }])),
      epoch: 4,
      ...(role.id === 'chords' ? { unlockCredit: 0 } : {}),
    };
    localStorage.setItem('pianoball.' + source, JSON.stringify(oldSave));
    const progress = loadProgress(role.storageKey, role.order);
    expect(progress.retiredPasses).toEqual(['drift']);
    expect(progress.best.drift).toBeUndefined();
    expect(progress.best.hopscotch).toBeUndefined();
    for (const id of additions) {
      expect(progress.best[id]).toBeUndefined();
      expect(progress.previousBest?.[id]).toBeUndefined();
    }
    for (const id of oldOrder.filter(id => id !== 'hopscotch')) {
      if (!corrected && revised.includes(id)) {
        expect(progress.best[id]).toBeUndefined();
        expect(progress.previousBest?.[id]).toEqual(oldRecord);
      } else expect(progress.best[id]).toEqual(oldRecord);
    }
    expect(progress.unlocked).toHaveLength(role.id === 'chords' ? 22 : 24);
    expect(progress.unlocked).toEqual(expect.arrayContaining(oldOrder.filter(id => id !== 'hopscotch')));
    expect(JSON.parse(localStorage.getItem('pianoball.' + source)!)).toEqual(oldSave);
    expect(loadProgress(role.storageKey, role.order)).toEqual(progress);
  });

  it('preserves new-song performances from the expanded upstream course while archiving revised old charts', () => {
    const source = role.id === 'melody' ? 'playtune.v3' : 'playbacking.v2';
    const best = Object.fromEntries(role.order.map(id => [id, { ...oldRecord }]));
    const initial: Progress = { unlocked: [...role.order], best, epoch: 8,
      retiredPasses: ['drift'], ...(role.id === 'chords' ? { unlockCredit: 2 } : {}) };
    localStorage.setItem('pianoball.' + source, JSON.stringify(initial));
    const progress = loadProgress(role.storageKey, role.order);
    expect(progress.unlocked).toEqual(role.order);
    expect(progress.retiredPasses).toEqual(['drift']);
    expect(progress.unlockCredit).toBe(initial.unlockCredit);
    for (const id of role.order) {
      if (revised.includes(id)) {
        expect(progress.best[id]).toBeUndefined();
        expect(progress.previousBest?.[id]).toEqual(oldRecord);
      } else {
        expect(progress.best[id]).toEqual(oldRecord);
        expect(progress.previousBest?.[id]).toBeUndefined();
      }
    }
    for (const id of additions) {
      const result = recordRun(role.storageKey, progress, id, role.order, passing);
      expect(result.previous).toEqual(oldRecord);
      expect(result.best.plays).toBe(5);
      expect(result.unlocked).toBeNull();
    }
    expect(JSON.parse(localStorage.getItem('pianoball.' + source)!)).toEqual(initial);
    localStorage.setItem('pianoball.' + source, JSON.stringify({ unlocked: [], best: {}, epoch: 99 }));
    expect(loadProgress(role.storageKey, role.order)).toEqual(progress);
  });

  it('resets to the existing opening three and does not resurrect retired access from stale progress', () => {
    saveProgress(role.storageKey, {
      unlocked: [...role.order], best: { [additions[0]]: oldRecord }, epoch: 2,
      retiredPasses: ['drift'], ...(role.id === 'chords' ? { unlockCredit: 2 } : {}),
    });
    const stale = loadProgress(role.storageKey, role.order);
    const fresh = resetProgress(role.storageKey, role.order);
    expect(fresh.unlocked).toEqual(oldOrder.slice(0, 3));
    expect(fresh.best).toEqual({});
    expect(fresh.retiredPasses).toBeUndefined();
    expect(fresh.epoch).toBe(3);
    recordRun(role.storageKey, stale, role.order[0], role.order, passing);
    const reloaded = loadProgress(role.storageKey, role.order);
    expect(reloaded.best[additions[0]]).toBeUndefined();
    expect(reloaded.retiredPasses).toBeUndefined();
    expect(reloaded.unlocked).toEqual(role.order.slice(0, 4));
    expect(reloaded.unlockCredit ?? 0).toBe(0);
  });
});
