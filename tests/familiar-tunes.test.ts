import { describe, expect, it } from 'vitest';
import { compilePublishedCatalog } from '../src/content/export';
import { chordNotes, degreeToNote, SCALES } from '../src/audio/music';
import { fitToRange, fitted, lastBeat, type ChartNote } from '../src/modes/playtune/chart';
import { LIBRARY, TUNE_ORDER, findTune } from '../src/modes/playtune/library';
import { CLASSICS } from '../src/modes/playtune/library/classics';
import { CHORD_CURVE, CHORD_ORDER, findChordEntry } from '../src/modes/playtune/library/chordcurve';
import { FAMILIAR_TUNES, FRERE_JACQUES, DRUNKEN_SAILOR, CAN_CAN, BLUE_DANUBE, THE_ENTERTAINER } from '../src/modes/playtune/library/familiar';
import { LEGACY_ORDERS } from '../src/modes/playtune/legacyOrder';
import { ROLES } from '../src/modes/playtune/role';

const additions = ['yankee-doodle', 'la-bamba', 'irish-washerwoman'];
const ids = ['frere-jacques', 'drunken-sailor', 'can-can', 'blue-danube', 'the-entertainer'];
const end = (notes: readonly { beat: number; len: number }[]) => Math.max(...notes.map(n => n.beat + n.len));
const phrase = (notes: ChartNote[], start: number, len: number) => notes
  .filter(n => n.beat >= start && n.beat < start + len).map(n => ({ ...n, beat: n.beat - start }));

describe('five familiar additions', () => {
  it('retains all familiar additions, with the backing course ordered independently', () => {
    expect(FAMILIAR_TUNES.map(t => t.id)).toEqual(ids);
    expect(LIBRARY).toHaveLength(22);
    expect(CHORD_CURVE).toHaveLength(22);
    expect(CHORD_ORDER.slice(0, 3)).toEqual(['frere-jacques', 'ode-to-joy', 'chord-ground']);
    for (const role of Object.values(ROLES)) {
      expect(new Set(role.order).size).toBe(role.order.length);
      if (role.id === 'melody') expect(role.order.filter(id => !ids.includes(id) && !additions.includes(id))).toEqual(LEGACY_ORDERS.playtune.map(id => id === 'drift' ? 'hopscotch' : id));
      for (const [i, id] of ids.entries()) {
        const tune = findTune(id)!;
        expect(tune.origin).toBe('classic');
        expect(CLASSICS).toContain(tune);
        expect(role.order.filter(x => x === id)).toHaveLength(1);
        expect(role.card(tune).difficulty).toBe(role.id === 'melody' ? i + 1 : [1,2,4,4,5][i]);
        const peers = role.tunes.filter(t => !ids.includes(t.id) && !additions.includes(t.id) && role.card(t).difficulty === i + 1);
        for (const peer of role.id === 'melody' ? peers : []) expect(role.order.indexOf(peer.id)).toBeLessThan(role.order.indexOf(id));
        expect(findChordEntry(id)?.tune).toBe(tune);
      }
    }
    expect(TUNE_ORDER.filter(id => ids.includes(id))).toEqual(ids);
  });

  it('publishes all ten role entries in schema v1 with their own teaching and pass marks', () => {
    const catalog = compilePublishedCatalog({ sourceCommit: null, sourceDirty: null });
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.entries).toHaveLength(44);
    expect(catalog.entries.filter(e => ids.includes(e.id))).toHaveLength(10);
    for (const [i, id] of ids.entries()) {
      const melody = catalog.entries.find(e => e.id === id && e.role === 'melody')!;
      const chords = catalog.entries.find(e => e.id === id && e.role === 'chords')!;
      expect(melody.pass).toBe([0.6, 0.63, 0.65, 0.67, 0.7][i]);
      expect(chords.pass).toBe([0.55, 0.6, 0.67, 0.67, 0.7][i]);
      expect(melody.teaches).not.toBe(chords.teaches);
      expect(melody.playerNotes.length).toBeGreaterThan(0);
      expect(chords.playerNotes.length).toBeGreaterThan(0);
      expect(chords.backingEvents.filter(e => e.part === 'melody')).toHaveLength(findTune(id)!.melody.length);
    }
  });

  it.each(FAMILIAR_TUNES)('$id is a complete 40–90 second passage with continuous harmony and a cadence', tune => {
    const length = lastBeat(tune);
    expect(length * 60 / tune.bpm).toBeGreaterThanOrEqual(40);
    expect(length * 60 / tune.bpm).toBeLessThanOrEqual(90);
    expect(end(tune.melody)).toBe(length);
    expect(end(tune.chords)).toBe(length);
    expect((length - (tune.pickup ?? 0)) % tune.beatsPerBar).toBe(0);
    expect(tune.melody[0].beat).toBe(0);
    expect(tune.chords[0].beat).toBe(0);
    for (let i = 1; i < tune.chords.length; i++) {
      expect(tune.chords[i].beat).toBe(tune.chords[i - 1].beat + tune.chords[i - 1].len);
    }
    const final = tune.chords.at(-1)!;
    expect(final.degree).toBe(0);
    const tones = chordNotes(degreeToNote(final.degree, tune.root, SCALES[tune.scaleId]), final.quality).map(n => n % 12);
    expect(tones).toContain(tune.melody.at(-1)!.note % 12);
  });

  it('preserves phrase lengths, repeats, the waltz rests, and the ragtime pickup and ties', () => {
    expect(FAMILIAR_TUNES.map(lastBeat)).toEqual([64, 128, 128, 96, 129]);
    expect(FAMILIAR_TUNES.map(t => t.bpm)).toEqual([80, 108, 112, 120, 120]);
    expect(phrase(FRERE_JACQUES.melody, 0, 32)).toEqual(phrase(FRERE_JACQUES.melody, 32, 32));
    expect(phrase(DRUNKEN_SAILOR.melody, 0, 64)).toEqual(phrase(DRUNKEN_SAILOR.melody, 64, 64));
    expect(phrase(CAN_CAN.melody, 0, 32)).toEqual(phrase(CAN_CAN.melody, 96, 32));
    expect(CAN_CAN.melody.slice(8, 12).map(n => n.note)).toEqual([77, 81, 84, 81]);
    expect(BLUE_DANUBE.melody.filter(n => n.beat < 6).map(n => n.beat)).toEqual([0, 1, 2, 3, 5]);
    expect(THE_ENTERTAINER.pickup).toBe(1);
    expect(THE_ENTERTAINER.melody.slice(0, 3)).toEqual([
      { note: 62, beat: 0, len: 0.5 }, { note: 63, beat: 0.5, len: 0.5 }, { note: 64, beat: 1, len: 0.5 },
    ]);
    expect(THE_ENTERTAINER.melody.find(n => n.beat === 4.5)).toEqual({ note: 72, beat: 4.5, len: 3 });
    expect(THE_ENTERTAINER.melody.some(n => n.beat === 5)).toBe(false);
    expect(phrase(THE_ENTERTAINER.melody, 1, 60)).toEqual(phrase(THE_ENTERTAINER.melody, 65, 60));
  });

  it('checks octave fits on small and full-size controllers', () => {
    for (const role of Object.values(ROLES)) for (const tune of FAMILIAR_TUNES) {
      const chart = role.chart(tune);
      for (const [low, count] of [[48, 25], [48, 32], [36, 49], [36, 61], [28, 76], [21, 88]]) {
        const high = low + count - 1;
        const shift = fitToRange(chart, low, high);
        expect(shift, `${role.id}:${tune.id}, ${count} keys`).not.toBeNull();
        expect(Math.abs(shift! % 12)).toBe(0);
        for (const n of fitted(chart, shift!)) {
          expect(n.note).toBeGreaterThanOrEqual(low);
          expect(n.note).toBeLessThanOrEqual(high);
        }
      }
    }
  });
});
