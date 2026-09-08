import { describe, expect, it } from 'vitest';
import { chordNotes, degreeToNote, inScale, SCALES } from '../src/audio/music';
import { fitToRange, harmonyProblems, lastBeat, validate, type ChartNote } from '../src/modes/playtune/chart';
import { LA_BAMBA, LA_BAMBA_BACKING } from '../src/modes/playtune/library/laBamba';
import { rhythmEvents } from '../src/modes/playtune/rhythm';

const inQuarters = (notes: ChartNote[]) => notes.map(n => ({ ...n, beat: n.beat / 2, len: n.len / 2 }));

describe('La Bamba traditional vocal excerpt', () => {
  it('keeps the printed pickup, tied syncopation, triplets, and response cadence', () => {
    const tune = { ...LA_BAMBA, melody: inQuarters(LA_BAMBA.melody) };
    expect(tune.pickup).toBe(2.5);
    // SEP/ConArte p. 66, Voz 1: five pickup C5s, then B4/G4, transposed G→C.
    expect(tune.melody.slice(0, 7)).toEqual([
      { beat: 0, len: 0.25, note: 65 }, { beat: 0.25, len: 0.25, note: 65 },
      { beat: 0.5, len: 0.25, note: 65 }, { beat: 0.75, len: 0.25, note: 65 },
      { beat: 1, len: 0.25, note: 65 }, { beat: 1.25, len: 0.5, note: 64 },
      { beat: 1.75, len: 0.5, note: 60 },
    ]);
    expect(tune.melody.find(n => n.beat === 7)).toEqual({ beat: 7, len: 0.5, note: 62 });
    expect(tune.melody.some(n => n.beat === 7.25)).toBe(false);
    const triplets = tune.melody.filter(n => n.beat >= 12.25 && n.beat < 13.25);
    expect(triplets).toHaveLength(3);
    triplets.forEach((n, i) => {
      expect(n.beat).toBeCloseTo(12.25 + i / 3);
      expect(n.len).toBe(1 / 3);
      expect(n.note).toBe(65);
    });
    expect(tune.melody.at(-1)).toEqual({ beat: 71.25, len: 1 / 3, note: 55 });
  });

  it('repeats the complete sourced phrase without adding the next copla or padding it to sixteen bars', () => {
    const first = inQuarters(LA_BAMBA.melody).filter(n => n.beat < 36);
    const second = inQuarters(LA_BAMBA.melody).filter(n => n.beat >= 36);
    expect(first).toHaveLength(80);
    expect(second).toHaveLength(first.length);
    second.forEach((n, i) => {
      expect(n.note).toBe(first[i].note);
      expect(n.len).toBe(first[i].len);
      expect(n.beat - 36).toBeCloseTo(first[i].beat);
    });
    const cadenceEnd = first.at(-1)!.beat + first.at(-1)!.len;
    expect(cadenceEnd).toBeCloseTo(35 + 7 / 12);
    expect(second[0].beat - cadenceEnd).toBeCloseTo(5 / 12);
    expect(lastBeat(LA_BAMBA)).toBe(144);
    expect(lastBeat(LA_BAMBA) * 60 / LA_BAMBA.bpm).toBeGreaterThan(40);
    expect(lastBeat(LA_BAMBA) * 60 / LA_BAMBA.bpm).toBeLessThan(90);
  });

  it('keeps both playable parts within the input timing floor and a 25-key keyboard', () => {
    expect(LA_BAMBA.bpm).toBe(120);
    expect(LA_BAMBA.beatsPerBar).toBe(8);
    expect(lastBeat(LA_BAMBA) * 60 / LA_BAMBA.bpm).toBeCloseTo(72);
    for (const notes of [LA_BAMBA.melody, LA_BAMBA_BACKING]) {
      expect(fitToRange(notes, 48, 72)).not.toBeNull();
      const onsets = [...new Set(notes.map(n => n.beat))].sort((a, b) => a - b);
      for (let i = 1; i < onsets.length; i++) {
        expect((onsets[i] - onsets[i - 1]) * 60_000 / LA_BAMBA.bpm).toBeGreaterThanOrEqual(220);
      }
      expect(notes.every(n => inScale(n.note, 60, SCALES.ionian))).toBe(true);
    }
    expect(LA_BAMBA.voiceId).toBe('felt-piano');
    expect(LA_BAMBA.bedVoiceId).toBe('nylon-guitar');
    expect(LA_BAMBA.backingNotes).not.toBe(LA_BAMBA_BACKING);
    expect(LA_BAMBA_BACKING.length).toBeLessThan(LA_BAMBA.backingNotes!.length);
  });

  it('aligns the independent bass/chord part to the pickup and its moving harmony', () => {
    expect(validate(LA_BAMBA)).toEqual([]);
    expect(harmonyProblems(LA_BAMBA)).toEqual([]);
    expect(LA_BAMBA_BACKING[0].beat).toBe(2.5);
    const firstBar = [...new Set(LA_BAMBA_BACKING.filter(n => n.beat < 10.5).map(n => n.beat))];
    expect(firstBar).toEqual([2.5, 4.5, 6.5, 8.5]);
    expect(LA_BAMBA.backingNotes!.some(n => n.beat === 3.5)).toBe(true);
    expect(LA_BAMBA_BACKING.some(n => n.beat === 3.5)).toBe(false);
    for (const n of LA_BAMBA_BACKING) {
      const c = LA_BAMBA.chords.find(c => c.beat <= n.beat && c.beat + c.len > n.beat)!;
      const tones = chordNotes(degreeToNote(c.degree, 60, SCALES.ionian), c.quality).map(p => p % 12);
      expect(tones).toContain(n.note % 12);
      expect(n.beat + n.len).toBeLessThanOrEqual(c.beat + c.len);
    }
    expect(LA_BAMBA.chords.at(-1)!.degree).toBe(4);
    expect(Math.max(...LA_BAMBA_BACKING.map(n => n.beat + n.len))).toBe(144);
  });

  it('uses finite, quiet duple accents and leaves the pickup and final cadence free of drums', () => {
    const hits = rhythmEvents(LA_BAMBA.rhythm);
    expect(LA_BAMBA.rhythm!.sections).toEqual([]);
    expect(new Set(hits.map(h => h.voice))).toEqual(new Set(['rim', 'shaker']));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every(h => h.gain <= 0.1 && h.beat >= 2.5 && h.beat < 142.5)).toBe(true);
    const firstBar = hits.filter(h => h.beat < 10.5);
    expect(firstBar.filter(h => h.voice === 'rim').map(h => h.beat)).toEqual([2.5, 6.5]);
    expect(firstBar.filter(h => h.voice === 'shaker')).toHaveLength(8);
  });
});
