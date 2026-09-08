import { describe, expect, it } from 'vitest';
import { fitToRange, fitted, harmonyProblems, lastBeat, validate, type ChartNote } from '../src/modes/playtune/chart';
import { rhythmEvents } from '../src/modes/playtune/rhythm';
import {
  IRISH_WASHERWOMAN, IRISH_WASHERWOMAN_BACKING, MARCHING_JIG_TUNES,
  YANKEE_DOODLE, YANKEE_DOODLE_BACKING,
} from '../src/modes/playtune/library/marchingJig';

const phrase = (notes: readonly ChartNote[], from: number, len: number) => notes
  .filter(n => n.beat >= from && n.beat < from + len)
  .map(({ beat, len, note }) => ({ beat: beat - from, len, note }));
const end = (notes: readonly { beat: number; len: number }[]) => Math.max(...notes.map(n => n.beat + n.len));

// These checks follow the inspected historical scores, not generated snapshots.
// Source edition/page and reduction choices are in docs/traditional-marching-jig.md.
describe('the historical march and jig', () => {
  it('keeps Stewart’s pickup, three statements, and dotted chorus figures', () => {
    // Compare the source in quarter units; playback uses equivalent eighths.
    const sourceNotes = YANKEE_DOODLE.melody.map(({ beat, len, note }) => ({ beat: beat / 2, len: len / 2, note }));
    expect(YANKEE_DOODLE.bpm).toBe(132);
    expect(YANKEE_DOODLE.beatsPerBar).toBe(4);
    expect(YANKEE_DOODLE.pickup).toBe(1);
    expect(lastBeat(YANKEE_DOODLE)).toBe(97);
    expect(sourceNotes.slice(0, 9)).toEqual([
      { beat: 0, len: .5, note: 55 },
      { beat: .5, len: .5, note: 60 }, { beat: 1, len: .5, note: 60 },
      { beat: 1.5, len: .5, note: 62 }, { beat: 2, len: .5, note: 64 },
      { beat: 2.5, len: .5, note: 60 }, { beat: 3, len: .5, note: 60 },
      { beat: 3.5, len: .5, note: 59 }, { beat: 4, len: .5, note: 55 },
    ]);
    expect(phrase(sourceNotes, 16.5, 2)).toEqual([
      { beat: 0, len: .75, note: 57 }, { beat: .75, len: .25, note: 57 },
      { beat: 1, len: .5, note: 57 }, { beat: 1.5, len: .5, note: 55 },
    ]);
    // The source’s third system is a varied chorus, not an extra copy of A.
    expect(phrase(sourceNotes, 32.5, 6)).toEqual(phrase(sourceNotes, 16.5, 6));
    expect(phrase(sourceNotes, 38.5, 2)).toEqual([
      { beat: 0, len: 1, note: 52 }, { beat: 1, len: 1, note: 55 },
    ]);
    expect(sourceNotes.at(-1)).toEqual({ beat: 46.5, len: 2, note: 60 });
  });

  it('keeps O’Neill’s complete AABB, pickups, and five-eighth closing bars', () => {
    const sourceNotes = IRISH_WASHERWOMAN.melody.map(({ beat, len, note }) => ({ beat, len, note }));
    expect(IRISH_WASHERWOMAN.bpm).toBe(132);
    expect(IRISH_WASHERWOMAN.beatsPerBar).toBe(6);
    expect(IRISH_WASHERWOMAN.pickup).toBe(1);
    expect(lastBeat(IRISH_WASHERWOMAN)).toBe(192);
    expect(sourceNotes.slice(0, 3)).toEqual([
      { beat: 0, len: .5, note: 74 }, { beat: .5, len: .5, note: 72 },
      { beat: 1, len: 1, note: 71 },
    ]);
    expect(phrase(IRISH_WASHERWOMAN.melody, 0, 48)).toEqual(phrase(IRISH_WASHERWOMAN.melody, 48, 48));
    expect(phrase(IRISH_WASHERWOMAN.melody, 96, 48)).toEqual(phrase(IRISH_WASHERWOMAN.melody, 144, 48));
    expect(sourceNotes.find(n => n.beat === 96)).toEqual({ beat: 96, len: 1, note: 79 });
    for (const from of [43, 91, 139, 187]) {
      expect(phrase(IRISH_WASHERWOMAN.melody, from, 5)).toEqual([
        { beat: 0, len: 1, note: 71 }, { beat: 1, len: 1, note: 67 },
        { beat: 2, len: 1, note: 67 }, { beat: 3, len: 2, note: 67 },
      ]);
    }
  });

  it.each(MARCHING_JIG_TUNES)('$id has complete harmony, an authentic meter, and no extra ending bar', tune => {
    expect(validate(tune)).toEqual([]);
    expect(harmonyProblems(tune)).toEqual([]);
    expect(end(tune.melody)).toBe(lastBeat(tune));
    expect(end(tune.chords)).toBe(lastBeat(tune));
    expect(end(tune.backingNotes!)).toBe(lastBeat(tune));
    expect(tune.chords[0].beat).toBe(0);
    for (let i = 1; i < tune.chords.length; i++) {
      expect(tune.chords[i].beat).toBe(tune.chords[i - 1].beat + tune.chords[i - 1].len);
    }
    expect(lastBeat(tune) * 60 / tune.bpm).toBeGreaterThanOrEqual(40);
    expect(lastBeat(tune) * 60 / tune.bpm).toBeLessThanOrEqual(90);
  });

  it('uses independent playable backing parts and keeps every role reachable', () => {
    for (const [tune, backing] of [
      [YANKEE_DOODLE, YANKEE_DOODLE_BACKING],
      [IRISH_WASHERWOMAN, IRISH_WASHERWOMAN_BACKING],
    ] as const) {
      expect(backing).not.toEqual(tune.backingNotes);
      expect(end(backing)).toBe(lastBeat(tune));
      for (const notes of [tune.melody, backing]) {
        const onsets = [...new Set(notes.map(n => n.beat))].sort((a, b) => a - b);
        for (let i = 1; i < onsets.length; i++) {
          expect((onsets[i] - onsets[i - 1]) * 60 / tune.bpm).toBeGreaterThanOrEqual(.22);
        }
        for (const [low, count] of [[48, 25], [48, 32], [36, 49], [36, 61], [28, 76], [21, 88]]) {
          const high = low + count - 1;
          const shift = fitToRange(notes, low, high);
          expect(shift, `${tune.id}/${count} keys`).not.toBeNull();
          for (const note of fitted(notes, shift!)) {
            expect(note.note).toBeGreaterThanOrEqual(low);
            expect(note.note).toBeLessThanOrEqual(high);
          }
        }
      }
    }
  });

  it('starts percussion on the first downbeat and accents the jig in two', () => {
    for (const tune of MARCHING_JIG_TUNES) {
      expect(tune.rhythm?.sections).toEqual([]);
      const hits = rhythmEvents(tune.rhythm, tune.pickup);
      expect(hits[0].beat).toBe(tune.pickup);
      expect(hits.every(h => h.beat >= tune.pickup! && h.beat < lastBeat(tune))).toBe(true);
      expect(new Set(hits.map(h => `${h.voice}@${h.beat}`)).size).toBe(hits.length);
    }
    expect(new Set(rhythmEvents(YANKEE_DOODLE.rhythm, 1).map(h => h.voice))).toEqual(new Set(['kick', 'snare']));
    const hits = rhythmEvents(IRISH_WASHERWOMAN.rhythm, 1);
    expect(hits.filter(h => h.voice === 'tomLo').every(h => (h.beat - 1) % 3 === 0)).toBe(true);
    expect(new Set(hits.map(h => h.voice))).toEqual(new Set(['tomLo', 'rim']));
  });
});


