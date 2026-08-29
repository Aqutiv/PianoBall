import { describe, it, expect } from 'vitest';
import {
  SCALES, MODES, findMode, chordNotes, snapToScale, inScale, scaleDegree, degreeToNote,
  identifyChord, retuneNote, voiceLead, Groove,
} from '../src/audio/music';
import { pitchClass } from '../src/midi/notes';
import { buildTable } from '../src/game/table/schema';
import { AURORA } from '../src/game/table/tables/aurora';

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

describe('modes', () => {
  it('offers a catalogue of scales, each with a loop of its own', () => {
    expect(MODES.length).toBeGreaterThan(1);
    for (const m of MODES) {
      expect(m.scale).toEqual([...SCALES[m.id]]);
      // Four chords advancing every couple of bars comes round too fast.
      expect(m.progression.length).toBeGreaterThanOrEqual(6);
    }
  });

  it('resolves every chord of every progression', () => {
    for (const m of MODES) {
      for (const step of m.progression) {
        expect(step.degree).toBeGreaterThanOrEqual(0);
        expect(step.degree).toBeLessThan(m.scale.length);
        const root = degreeToNote(step.degree, D, m.scale);
        const chord = chordNotes(root, step.quality);
        expect(chord.length).toBeGreaterThanOrEqual(3);
        expect(chord[0]).toBe(root);
      }
    }
  });

  it('looks a mode up by id, and finds nothing for a stale one', () => {
    expect(findMode('lydian')?.scale).toEqual([...SCALES.lydian]);
    expect(findMode('no-such-mode')).toBeUndefined();
  });
});

describe('retuning the playfield', () => {
  const table = buildTable(AURORA);
  const root = AURORA.music.root;
  const home = findMode(AURORA.music.mode)!;
  const notes = table.elements
    .map((e) => e.note)
    .filter((n): n is number => n !== null);

  const into = (note: number, scale: readonly number[]) =>
    retuneNote(note, root, home.scale, root, scale);

  it('leaves the table alone in the scale it was written in', () => {
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) expect(into(n, home.scale)).toBe(n);
  });

  it('lands every note in the new scale, in its own register', () => {
    for (const mode of MODES) {
      for (const n of notes) {
        const out = into(n, mode.scale);
        expect(inScale(out, root, mode.scale)).toBe(true);
        expect(Math.abs(out - n)).toBeLessThanOrEqual(3);
      }
    }
  });

  it('keeps each target group on distinct pitches, whatever the scale', () => {
    for (const group of ['bank', 'lanes']) {
      const members = table.elements.filter((e) => e.group === group && e.note !== null);
      expect(members.length).toBeGreaterThan(1);
      for (const mode of MODES) {
        const out = members.map((e) => into(e.note!, mode.scale));
        expect(new Set(out).size).toBe(members.length);
      }
    }
  });

  it('never compounds, however many times the scale changes', () => {
    for (const n of notes) {
      let out = n;
      for (const mode of [...MODES, ...MODES]) out = into(n, mode.scale);
      expect(into(n, home.scale)).toBe(n);
      expect(out).toBe(into(n, MODES[MODES.length - 1].scale));
    }
  });
});

describe('voice leading', () => {
  it('passes the first chord through untouched', () => {
    expect(voiceLead([], [62, 65, 69])).toEqual([62, 65, 69]);
  });

  it('changes the octaves and nothing else', () => {
    const chord = chordNotes(69, 'min');
    const led = voiceLead([62, 65, 69], chord);
    expect(led).toEqual([...led].sort((a, b) => a - b));
    expect(new Set(led.map(pitchClass))).toEqual(new Set(chord.map(pitchClass)));
  });

  it('never lets the bed leap, for any chord of any mode', () => {
    const prev = [62, 65, 69];
    const centre = (62 + 65 + 69) / 3;
    for (const m of MODES) {
      for (const step of m.progression) {
        const chord = chordNotes(degreeToNote(step.degree, D, m.scale) - 12, step.quality);
        for (const n of voiceLead(prev, chord)) {
          expect(Math.abs(n - centre)).toBeLessThanOrEqual(6);
        }
      }
    }
  });
});
