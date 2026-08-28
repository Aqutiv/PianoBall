import { describe, it, expect } from 'vitest';
import {
  SCALES, chordNotes, snapToScale, inScale, scaleDegree, degreeToNote,
  identifyChord, Groove,
} from '../src/audio/music';

const D = 62;
const PENT = SCALES.minorPentatonic;

describe('scales', () => {
  it('leaves in-scale notes alone', () => {
    for (const s of PENT) expect(snapToScale(D + s, D, PENT)).toBe(D + s);
  });

  it('snaps off-scale notes to the nearest scale tone in the same octave', () => {
    expect(snapToScale(D + 1, D, PENT)).toBe(D);       // Eb -> D
    expect(snapToScale(D + 4, D, PENT)).toBe(D + 3);   // F# -> F
    expect(snapToScale(D + 6, D, PENT)).toBe(D + 5);   // Ab -> G
    expect(snapToScale(D + 11, D, PENT)).toBe(D + 10); // C# -> C, not down an octave
  });

  it('snaps across octaves without transposing', () => {
    expect(snapToScale(D + 13, D, PENT)).toBe(D + 12);
    expect(snapToScale(D - 1, D, PENT)).toBe(D - 2);
    // Never further than a semitone and a half from where it started.
    for (let n = 0; n < 128; n++) {
      expect(Math.abs(snapToScale(n, D, PENT) - n)).toBeLessThanOrEqual(2);
    }
  });

  it('never returns an off-scale note, for any input', () => {
    for (let n = 0; n < 128; n++) expect(inScale(snapToScale(n, D, PENT), D, PENT)).toBe(true);
  });

  it('round-trips degrees', () => {
    for (let deg = 0; deg < 12; deg++) {
      const note = degreeToNote(deg, D, PENT);
      expect(scaleDegree(note, D, PENT)).toBe(deg % PENT.length);
    }
  });
});

describe('chords', () => {
  it('builds the expected triads', () => {
    expect(chordNotes(D, 'min')).toEqual([62, 65, 69]);
    expect(chordNotes(D, 'maj')).toEqual([62, 66, 69]);
    expect(chordNotes(D, 'min7')).toEqual([62, 65, 69, 72]);
  });

  it('names chords in any inversion', () => {
    expect(identifyChord([60, 64, 67])).toBe('C');
    expect(identifyChord([64, 67, 72])).toBe('C');   // first inversion
    expect(identifyChord([67, 72, 76])).toBe('C');   // second inversion
    expect(identifyChord([62, 65, 69])).toBe('Dmin');
    expect(identifyChord([62, 65, 69, 72])).toBe('Dmin7');
  });

  it('ignores octave doubling', () => {
    expect(identifyChord([60, 64, 67, 72, 76])).toBe('C');
  });

  it('returns null for things that are not chords', () => {
    expect(identifyChord([60, 61])).toBeNull();
    expect(identifyChord([60, 61, 62])).toBeNull();
  });
});

describe('groove', () => {
  const g = new Groove(120);   // 0.5 s per beat, 0.25 s per eighth

  it('measures distance to the nearest subdivision', () => {
    expect(g.offsetAt(0)).toBeCloseTo(0, 9);
    expect(g.offsetAt(0.25)).toBeCloseTo(0, 9);
    expect(g.offsetAt(0.30)).toBeCloseTo(0.05, 9);
    expect(g.offsetAt(0.20)).toBeCloseTo(-0.05, 9);
  });

  it('builds a streak on the grid and breaks it off the grid', () => {
    g.reset();
    for (let i = 0; i < 8; i++) expect(g.judge(i * 0.25 + 0.02)).toBe(true);
    expect(g.streak).toBe(8);
    expect(g.multiplier).toBe(3);
    expect(g.judge(2.125)).toBe(false);   // exactly between two eighths
    expect(g.streak).toBe(0);
    expect(g.multiplier).toBe(1);
  });

  it('caps the multiplier', () => {
    g.reset();
    for (let i = 0; i < 200; i++) g.judge(i * 0.25);
    expect(g.multiplier).toBe(6);
  });
});
