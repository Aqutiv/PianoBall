import { describe, expect, it } from 'vitest';
import {
  ODE_TO_JOY, TWINKLE, AMAZING_GRACE, SCARBOROUGH_FAIR, GREENSLEEVES,
  FUR_ELISE, LONDONDERRY_AIR, MINUET_IN_G, GYMNOPEDIE, CANON_IN_D, JESU_JOY,
} from '../src/modes/playtune/library/classics';
import { harmonyProblems, lastBeat, validate } from '../src/modes/playtune/chart';
import { SCALES } from '../src/audio/music';
import { APPROACH_BPM_CAP } from '../src/modes/playtune/transport';
import { DEFAULT_PLAYTUNE } from '../src/modes/playtune/settings';

const CLASSICS = [ODE_TO_JOY, TWINKLE, AMAZING_GRACE, SCARBOROUGH_FAIR, GREENSLEEVES,
  FUR_ELISE, LONDONDERRY_AIR, MINUET_IN_G, GYMNOPEDIE, CANON_IN_D, JESU_JOY];
const pitches = (t: typeof FUR_ELISE, from: number, to: number) => t.melody
  .filter(n => n.beat >= from && n.beat < to).map(n => n.note);

describe('source-correct classical arrangements', () => {
  it('has complete, valid explicit performance parts with declared accidentals', () => {
    for (const t of CLASSICS) {
      expect(validate(t), t.id).toEqual([]);
      expect(harmonyProblems(t), t.id).toEqual([]);
      expect(t.backingNotes?.length, t.id).toBeGreaterThan(0);
      const end = Math.max(...t.chords.map(c => c.beat + c.len));
      const allowed = new Set<number>([...SCALES[t.scaleId], ...(t.borrows ?? [])]);
      for (const n of [...t.melody, ...t.backingNotes!]) {
        expect(n.beat + n.len, `${t.id} part overrun at ${n.beat}`).toBeLessThanOrEqual(end + 1e-6);
        expect(allowed.has((n.note - t.root + 1200) % 12), `${t.id} undeclared pitch ${n.note}`).toBe(true);
        expect(n.gain, t.id).toBeGreaterThan(0);
        expect(n.gain, t.id).toBeLessThanOrEqual(0.05);
      }
      expect(lastBeat(t), t.id).toBe(end);
    }
  });

  it('preserves readable note spacing at the authored practice tempos', () => {
    for (const t of CLASSICS) {
      const onsets = [...new Set(t.melody.map(n => n.beat))];
      for (let i = 1; i < onsets.length; i++) {
        expect((onsets[i] - onsets[i - 1]) * 60 / t.bpm, t.id).toBeGreaterThanOrEqual(0.22);
      }
      const leadSeconds = DEFAULT_PLAYTUNE.leadBeats * 60 / Math.min(t.bpm, APPROACH_BPM_CAP);
      const horizon = leadSeconds * t.bpm / 60;
      for (const beat of onsets) {
        expect(t.melody.filter(n => n.beat >= beat && n.beat < beat + horizon).length, t.id).toBeLessThanOrEqual(8);
      }
    }
  });

  it('gives Für Elise its real pickup, rests, left-hand octaves and first ending', () => {
    expect(FUR_ELISE.pickup).toBe(1);
    expect(lastBeat(FUR_ELISE)).toBe(24);
    expect(pitches(FUR_ELISE, 0, 4)).toEqual([76, 75, 76, 75, 76, 71, 74, 72]);
    expect(FUR_ELISE.melody.find(n => n.beat === 4)).toMatchObject({ note: 69, len: 1 });
    expect(FUR_ELISE.melody.some(n => n.beat === 5)).toBe(false);
    expect(FUR_ELISE.backingNotes!.filter(n => n.beat < 4 || (n.beat >= 13 && n.beat < 16))).toEqual([]);
    expect(FUR_ELISE.backingNotes!.filter(n => n.beat >= 7 && n.beat < 8.5).map(n => n.note)).toEqual([40, 52, 56]);
    expect(FUR_ELISE.melody.at(-1)).toMatchObject({ beat: 22, len: 2, note: 69 });
    expect(FUR_ELISE.backingNotes!.every(n => n.beat + n.soundingLen! <= 24)).toBe(true);
  });

  it('restores Satie’s delayed entrance, natural G and uninterrupted four-bar tie', () => {
    expect(GYMNOPEDIE.melody[0]).toMatchObject({ beat: 7, note: 78, len: 1 });
    expect(pitches(GYMNOPEDIE, 7, 15)).toEqual([78, 81, 79, 78, 73, 71, 73, 74]);
    expect(GYMNOPEDIE.melody.at(-1)).toMatchObject({ beat: 18, note: 66, len: 12 });
    expect(GYMNOPEDIE.backingNotes!.filter(n => n.beat === 1).map(n => n.note)).toEqual([59, 62, 66]);
    expect(GYMNOPEDIE.backingNotes!.some(n => n.beat === 2)).toBe(false);
  });

  it('retains the Minuet half cadence and completes the sixteen-bar answer', () => {
    expect(lastBeat(MINUET_IN_G)).toBe(48);
    expect(MINUET_IN_G.chords.find(c => c.beat === 21)).toMatchObject({ degree: 4, len: 3 });
    expect(MINUET_IN_G.melody.at(-1)).toMatchObject({ beat: 45, note: 67, len: 3 });
    expect(MINUET_IN_G.backingNotes!.filter(n => n.beat >= 21 && n.beat < 24).map(n => n.note)).toEqual([62, 50, 60, 59, 57]);
  });

  it('keeps Greensleeves dotted figures, its raised sixth, and the first dominant ending', () => {
    expect(GREENSLEEVES.melody.find(n => n.beat === 4)).toMatchObject({ note: 76, len: 1.5 });
    expect(GREENSLEEVES.melody.find(n => n.beat === 5.5)).toMatchObject({ note: 77, len: 0.5 });
    expect(GREENSLEEVES.chords.filter(c => c.beat >= 19 && c.beat < 25).every(c => c.degree === 4 && c.quality === 'maj')).toBe(true);
    expect(GREENSLEEVES.melody.some(n => n.note === 66)).toBe(true);
  });

  it('restores the familiar hymn and folk contours rather than invented substitutes', () => {
    expect(pitches(AMAZING_GRACE, 22, 28)).toEqual([71, 74, 71, 74, 71, 67]);
    expect(pitches(SCARBOROUGH_FAIR, 0, 13)).toEqual([69, 69, 76, 76, 71, 72, 71, 69]);
    expect(pitches(SCARBOROUGH_FAIR, 13, 22)).toEqual([76, 79, 81, 79, 76, 78, 74, 76]);
    expect(pitches(LONDONDERRY_AIR, 0, 1.5)).toEqual([71, 72, 74]);
    expect(LONDONDERRY_AIR.melody.at(-1)).toMatchObject({ beat: 29.5, note: 72, len: 2 });
  });

  it('synchronizes Pachelbel’s real quarter-note ground and canonic entrances', () => {
    expect(lastBeat(CANON_IN_D)).toBe(36);
    expect(CANON_IN_D.chords.slice(0, 8).map(c => [c.beat, c.len])).toEqual(Array.from({ length: 8 }, (_, i) => [i, 1]));
    expect(CANON_IN_D.backingNotes!.filter(n => n.beat < 8).map(n => n.note)).toEqual([50, 45, 47, 42, 43, 38, 43, 45]);
    expect(pitches(CANON_IN_D, 16, 20)).toEqual([62, 66, 69, 67, 66, 62, 66, 64]);
    expect(CANON_IN_D.backingNotes!.filter(n => n.beat === 8).map(n => n.note)).toContain(78);
  });

  it('uses Bach’s actual ritornello and independently written inner voices', () => {
    expect(lastBeat(JESU_JOY)).toBe(75);
    expect(pitches(JESU_JOY, 0, 9)).toEqual([67, 69, 71, 74, 72, 72, 76, 74]);
    expect(pitches(JESU_JOY, 9, 18)).toEqual([74, 79, 78, 79, 74, 71, 67, 69, 71]);
    expect(pitches(JESU_JOY, 54, 63)).toEqual([64, 74, 72, 71, 69, 67, 62, 67, 66]);
    expect(JESU_JOY.melody.at(-1)).toMatchObject({ beat: 72, note: 79, len: 3 });
    expect(JESU_JOY.melody).toHaveLength(new Set(JESU_JOY.melody.map(n => n.beat)).size);
    expect(JESU_JOY.backingNotes!.some(n => n.beat === 5.25 && n.note === 66 && n.len === 0.75)).toBe(true);
  });
});
