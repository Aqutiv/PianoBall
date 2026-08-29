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

describe('chord vocabulary', () => {
  const C = 60;
  /** Build a voicing from intervals above middle C. */
  const on = (...iv: number[]) => iv.map((i) => C + i);

  it('names every seventh chord in common use', () => {
    expect(identifyChord(on(0, 4, 7, 11))).toBe('Cmaj7');
    expect(identifyChord(on(0, 3, 7, 10))).toBe('Cmin7');
    expect(identifyChord(on(0, 4, 7, 10))).toBe('C7');
    expect(identifyChord(on(0, 3, 6, 10))).toBe('Cmin7b5');
    expect(identifyChord(on(0, 3, 6, 9))).toBe('Cdim7');
    expect(identifyChord(on(0, 3, 7, 11))).toBe('CminMaj7');
    expect(identifyChord(on(0, 4, 8, 10))).toBe('C7#5');
    expect(identifyChord(on(0, 4, 8, 11))).toBe('Cmaj7#5');
    expect(identifyChord(on(0, 5, 7, 10))).toBe('C7sus4');
  });

  it('names sixths, and does not confuse one with a minor seventh', () => {
    // The same four pitch classes either way round; the bass decides.
    expect(identifyChord(on(0, 4, 7, 9))).toBe('C6');
    expect(identifyChord([57, 60, 64, 67])).toBe('Amin7');
    expect(identifyChord(on(0, 3, 7, 9))).toBe('Cmin6');
  });

  it('names a chord for the highest step of the stack it reaches', () => {
    // A full thirteenth carries a ninth and an eleventh underneath it, and is
    // still called a thirteenth rather than a seventh with three additions.
    expect(identifyChord([60, 63, 67, 70, 74, 77, 81])).toBe('Cmin13');
    expect(identifyChord([60, 64, 67, 70, 74, 77, 81])).toBe('C13');
    expect(identifyChord([60, 64, 67, 71, 74, 77, 81])).toBe('Cmaj13');
    expect(identifyChord([60, 64, 67, 70, 74, 77])).toBe('C11');
    expect(identifyChord([60, 63, 67, 70, 74, 77])).toBe('Cmin11');
    // A thirteenth is still a thirteenth when the eleventh is left out, which
    // on a dominant is the usual way to play it.
    expect(identifyChord([60, 64, 67, 70, 74, 81])).toBe('C13');
  });

  it('reads the voicings that leave the fifth out of an extended chord', () => {
    expect(identifyChord([60, 64, 71, 74])).toBe('Cmaj9');
    expect(identifyChord([60, 63, 70, 74])).toBe('Cmin9');
    // Still readable with the third underneath rather than the root.
    expect(identifyChord([64, 60, 71, 74])).toBe('Cmaj9');
    expect(identifyChord([64, 60, 70])).toBe('C7');
  });

  it('names extensions rather than giving up on them', () => {
    expect(identifyChord(on(0, 4, 7, 11, 14))).toBe('Cmaj9');
    expect(identifyChord(on(0, 3, 7, 10, 14))).toBe('Cmin9');
    expect(identifyChord(on(0, 4, 7, 10, 14))).toBe('C9');
    expect(identifyChord(on(0, 4, 7, 10, 14, 21))).toBe('C13');
    expect(identifyChord(on(0, 3, 7, 10, 14, 17))).toBe('Cmin11');
    expect(identifyChord(on(0, 4, 7, 9, 14))).toBe('C6/9');
    expect(identifyChord(on(0, 2, 4, 7))).toBe('Cadd9');
    expect(identifyChord(on(0, 2, 3, 7))).toBe('Cmin(add9)');
  });

  it('names altered dominants', () => {
    expect(identifyChord(on(0, 4, 7, 10, 13))).toBe('C7(b9)');
    expect(identifyChord(on(0, 4, 7, 10, 15))).toBe('C7(#9)');
    expect(identifyChord(on(0, 4, 7, 10, 18))).toBe('C7(#11)');
    expect(identifyChord(on(0, 4, 7, 10, 20))).toBe('C7(b13)');
  });

  it('reads a voicing with the fifth left out', () => {
    expect(identifyChord(on(0, 4, 10))).toBe('C7');
    expect(identifyChord(on(0, 4, 11))).toBe('Cmaj7');
    expect(identifyChord(on(0, 3, 10))).toBe('Cmin7');
  });

  it('will not drop a tone that defines the chord', () => {
    // Without its flat fifth this is not half-diminished, and there is no
    // reading of two notes plus a tension that is worth a name.
    expect(identifyChord([60, 63, 70])).not.toBe('Cmin7b5');
    // An altered fifth is never optional the way a perfect fifth is.
    expect(identifyChord(on(0, 4, 11))).not.toBe('Cmaj7#5');
  });

  it('lets the bass name a symmetrical chord', () => {
    // A diminished seventh has four identical faces; whichever is underneath
    // is the one being played.
    expect(identifyChord([60, 63, 66, 69])).toBe('Cdim7');
    expect(identifyChord([63, 66, 69, 72])).toBe('D#dim7');
    expect(identifyChord([60, 64, 68])).toBe('Caug');
    expect(identifyChord([64, 68, 72])).toBe('Eaug');
  });

  it('prefers a whole chord to a gapped one, even against the bass', () => {
    // C, E, A with C underneath is A minor in first inversion — not a sixth
    // chord that happens to be missing its fifth.
    expect(identifyChord([60, 64, 69])).toBe('Amin');
    // Same argument for a quartal stack: F sus4 over C is complete, whereas
    // C7sus4 would be missing its fifth.
    expect(identifyChord([60, 65, 70])).toBe('Fsus4');
  });

  it('still refuses a cluster', () => {
    expect(identifyChord([60, 61, 62])).toBeNull();
    expect(identifyChord([60, 61, 62, 63])).toBeNull();
    expect(identifyChord([60, 61, 62, 63, 64, 65])).toBeNull();
    expect(identifyChord([60, 67])).toBeNull();
  });

  it('will not take two tensions a semitone apart as a stack', () => {
    // A chord has a flat ninth or a natural ninth, never both — and no other
    // reading of these five notes is worth asserting either.
    expect(identifyChord([60, 61, 62, 64, 67])).toBeNull();
  });

  it('only stacks two or more tensions on a seventh', () => {
    // An added ninth on a triad is a real thing; a triad carrying two colour
    // tones is a handful of notes with a name forced onto it.
    expect(identifyChord([60, 64, 67, 74])).toBe('Cadd9');
    expect(identifyChord([60, 65, 67, 78, 81])).toBeNull();
  });

  it('names the whole-tone dominant, which is what those six notes spell', () => {
    expect(identifyChord([60, 62, 64, 66, 68, 70])).toBe('C7#5(9,#11)');
  });

  it('is unmoved by octave doubling and spread', () => {
    expect(identifyChord([60, 64, 67, 72, 76, 79])).toBe('C');
    expect(identifyChord([36, 64, 79, 91])).toBe('C');
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

describe('the beginner scales', () => {
  it('offers a plain major and a plain minor', () => {
    expect(SCALES.ionian).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(SCALES.aeolian).toEqual([0, 2, 3, 5, 7, 8, 10]);
    expect(MODES.map((m) => m.label)).toContain('major');
    expect(MODES.map((m) => m.label)).toContain('natural minor');
  });

  it('spells C major and A minor from the notes anyone would name', () => {
    const C = 60, A = 57;
    // The white keys, from each of the two places a beginner starts.
    for (const n of [0, 2, 4, 5, 7, 9, 11]) {
      expect(inScale(C + n, C, SCALES.ionian)).toBe(true);
      expect(inScale(C + n, A, SCALES.aeolian)).toBe(true);
    }
    // And nothing black belongs to either.
    for (const n of [1, 3, 6, 8, 10]) {
      expect(inScale(C + n, C, SCALES.ionian)).toBe(false);
    }
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
