import { describe, expect, it } from 'vitest';
import { writtenNoteEvent } from '../src/audio/written';
import { compileCatalog, compilePublishedCatalog } from '../src/content/export';
import { validateCatalog, type CatalogV1, type CourseEntryV1 } from '../src/content/schema';
import type { Tune, TuneRhythm } from '../src/modes/playtune/chart';
import { HOPSCOTCH } from '../src/modes/playtune/library/hopscotch';
import { ROLES } from '../src/modes/playtune/role';
import { rhythmEvents } from '../src/modes/playtune/rhythm';

const provenance = { sourceCommit: null, sourceDirty: null };
const published = compilePublishedCatalog(provenance);
const compileTune = (tune: Tune) => compileCatalog(provenance, [
  { ...ROLES.melody, tunes: [tune], order: [tune.id] }, ROLES.chords,
]);
const minimal = (): CatalogV1 => ({
  ...provenance, schemaVersion: 1,
  entries: [{
    ...structuredClone(published.entries[0]),
    playerNotes: [{ beat: 0, len: 4, note: 60 }], backingEvents: [],
    drumEvents: [{ beat: 0, voice: 'kick', gain: 0.3 }],
  }],
});

describe('authored rhythm content export', () => {
  it('exports the browser drum arrangement in both roles without changing schema version', () => {
    expect(published.schemaVersion).toBe(1);
    for (const role of Object.values(ROLES)) {
      for (const tune of role.tunes) {
        const entry = published.entries.find((e) => e.id === tune.id && e.role === role.id)!;
        if (tune.rhythm === undefined) {
          expect(Object.hasOwn(entry, 'drumEvents'), `${role.id}:${tune.id}`).toBe(false);
        } else {
          expect(entry.drumEvents).toEqual(rhythmEvents(tune.rhythm, tune.pickup ?? 0));
        }
      }
    }
    const hopscotch = published.entries.filter((entry) => entry.id === HOPSCOTCH.id);
    expect(hopscotch.map((entry) => entry.role)).toEqual(['melody', 'chords']);
    expect(hopscotch[0].drumEvents!.length).toBeGreaterThan(0);
    expect(hopscotch[0].drumEvents).toEqual(hopscotch[1].drumEvents);
  });

  it('preserves pickup phase and muted overrides, and owns the exported hit objects', () => {
    const tune = structuredClone(HOPSCOTCH);
    tune.pickup = 1;
    tune.rhythm = {
      sections: [{ beat: 0, len: 4, patternId: 'pop', gain: 0.4 }],
      hits: [{ beat: 1, voice: 'kick', gain: 0 }, { beat: 4, voice: 'rim', gain: 0.2 }],
    };
    const before = structuredClone(tune.rhythm);
    const events = compileTune(tune).entries[0].drumEvents!;
    expect(events).toEqual(rhythmEvents(tune.rhythm, 1));
    expect(events).toContainEqual({ beat: 0, voice: 'snare', gain: 0.4 });
    expect(events.some((event) => event.beat === 1 && event.voice === 'kick')).toBe(false);
    events.find((event) => event.beat === 4 && event.voice === 'rim')!.gain = 0.9;
    expect(tune.rhythm).toEqual(before);
  });

  it('labels authored accompaniment as chords and the automatic tune as melody, preserving sound parameters', () => {
    for (const role of Object.values(ROLES)) {
      const tune = role.tunes.find((t) => t.id === HOPSCOTCH.id)!;
      const entry = published.entries.find((e) => e.id === tune.id && e.role === role.id)!;
      const expected = role.backing(tune).notes!.map((note) => {
        const { offset: _offset, ...event } = writtenNoteEvent(note);
        return { ...event, beat: note.beat, part: role.id === 'melody' ? 'chord' : 'melody' };
      });
      expect(entry.backingEvents).toEqual(expected);
    }
  });

  it.each([
    ['beat', NaN], ['beat', Infinity], ['beat', -1], ['beat', 64],
    ['gain', NaN], ['gain', Infinity], ['gain', -0.1], ['gain', 1.1],
    ['voice', 'missing-drum'], ['voice', 'toString'],
  ])('rejects invalid authored hit %s before expansion', (field, value) => {
    const tune = structuredClone(HOPSCOTCH);
    tune.rhythm = {
      sections: [], hits: [{ beat: 0, voice: 'kick', gain: 0.3, [field]: value }],
    } as TuneRhythm;
    expect(() => compileTune(tune)).toThrow(/melody:hopscotch.*rhythm|melody:hopscotch.*drum voice/);
  });

  it.each([
    ['beat', NaN], ['beat', Infinity], ['len', Infinity], ['len', NaN],
    ['gain', NaN], ['gain', Infinity],
  ])('rejects nonfinite authored section %s before entering pattern loops', (field, value) => {
    const tune = structuredClone(HOPSCOTCH);
    tune.rhythm = { sections: [{ beat: 0, len: 4, patternId: 'pop', gain: 0.3, [field]: value }] };
    expect(() => compileTune(tune)).toThrow(/melody:hopscotch.*rhythm/);
  });
});

describe('optional drum wire acceptance', () => {
  const changes: [string, (entry: CourseEntryV1) => void][] = [
    ['drumEvents', (e) => { e.drumEvents = undefined; }],
    ['drumEvents', (e) => { e.drumEvents = null as never; }],
    ['drumEvents', (e) => { e.drumEvents = Array(20_001).fill(e.drumEvents![0]); }],
    ['drumEvents[0]', (e) => { e.drumEvents = new Array(1); }],
    ['drumEvents[0].beat', (e) => { e.drumEvents![0].beat = NaN; }],
    ['drumEvents[0].beat', (e) => { e.drumEvents![0].beat = Infinity; }],
    ['drumEvents[0].beat', (e) => { e.drumEvents![0].beat = -1; }],
    ['drumEvents[0].beat', (e) => { e.drumEvents![0].beat = 65_537; }],
    ['drumEvents[0].beat', (e) => { e.drumEvents![0].beat = '1' as never; }],
    ['drumEvents[0].gain', (e) => { e.drumEvents![0].gain = NaN; }],
    ['drumEvents[0].gain', (e) => { e.drumEvents![0].gain = Infinity; }],
    ['drumEvents[0].gain', (e) => { e.drumEvents![0].gain = -0.1; }],
    ['drumEvents[0].gain', (e) => { e.drumEvents![0].gain = 1.1; }],
    ['drumEvents[0].voice', (e) => { e.drumEvents![0].voice = 'missing' as never; }],
    ['drumEvents[0].voice', (e) => { e.drumEvents![0].voice = 'toString' as never; }],
    ['drumEvents[0].voice', (e) => { e.drumEvents![0].voice = 1 as never; }],
    ['drumEvents[1].beat', (e) => {
      e.drumEvents = [{ beat: 1, voice: 'kick', gain: 0.3 }, { beat: 0, voice: 'snare', gain: 0.3 }];
    }],
  ];
  it.each(changes)('rejects invalid %s with entry identity and field', (field, change) => {
    const catalog = minimal();
    change(catalog.entries[0]);
    expect(() => validateCatalog(catalog)).toThrow(field);
    expect(() => validateCatalog(catalog)).toThrow(/entries\[0\] \(melody:.*\)/);
  });

  it('accepts absent/empty drums, simultaneous voices, and reader beat/gain boundaries', () => {
    const catalog = minimal(), entry = catalog.entries[0];
    delete entry.drumEvents;
    expect(() => validateCatalog(catalog)).not.toThrow();
    entry.drumEvents = [];
    expect(() => validateCatalog(catalog)).not.toThrow();
    entry.drumEvents = [
      { beat: 0, voice: 'kick', gain: 0 },
      { beat: 65_536, voice: 'snare', gain: 1 },
      { beat: 65_536, voice: 'hat', gain: 0.3 },
    ];
    expect(() => validateCatalog(catalog)).not.toThrow();
  });

  it('counts each drum hit toward the existing catalog expansion limit', () => {
    const catalog = minimal(), entry = catalog.entries[0];
    entry.backingEvents = Array.from({ length: 15_624 }, () => ({
      beat: 0, len: 4, notes: Array(16).fill(60), gain: 0.05, attack: 0.02, part: 'chord' as const,
    }));
    entry.drumEvents = Array.from({ length: 15 }, () => ({ beat: 0, voice: 'kick' as const, gain: 0.3 }));
    expect(() => validateCatalog(catalog)).not.toThrow(); // 249,984 backing + 1 player + 15 drums.
    entry.drumEvents.push({ beat: 0, voice: 'snare', gain: 0.3 });
    expect(() => validateCatalog(catalog)).toThrow(/expanded note count exceeds 250000/);
  });
});
