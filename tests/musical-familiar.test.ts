import { describe, expect, it } from 'vitest';
import { SCALES, inScale } from '../src/audio/music';
import { fitToRange, harmonyProblems, lastBeat, validate, type Tune } from '../src/modes/playtune/chart';
import { findChordEntry } from '../src/modes/playtune/library/chordcurve';
import { FAMILIAR_TUNES, FRERE_JACQUES, DRUNKEN_SAILOR, CAN_CAN, BLUE_DANUBE, THE_ENTERTAINER } from '../src/modes/playtune/library/familiar';
import { FIRST_LIGHT, DRIFT, TWO_HANDS } from '../src/modes/playtune/library/originals';
import { CHORD_GROUND, CHORD_MARCH } from '../src/modes/playtune/library/studies';

const current = [...FAMILIAR_TUNES, FIRST_LIGHT, DRIFT, TWO_HANDS, CHORD_GROUND, CHORD_MARCH];
const melodyAt = (tune: Tune, beat: number) => tune.melody.filter(n => n.beat === beat).map(n => n.note);
const backingAt = (tune: Tune, beat: number) => tune.backingNotes!.filter(n => n.beat === beat).map(n => n.note);
const lowestAt = (tune: Tune, beat: number) => Math.min(...backingAt(tune, beat));

describe('reviewed familiar and original arrangements', () => {
  it.each(current)('$id has a bounded, explicitly voiced performance independent of the playable part', tune => {
    expect(validate(tune)).toEqual([]);
    expect(harmonyProblems(tune)).toEqual([]);
    const notes = tune.backingNotes!;
    expect(notes.length).toBeGreaterThan(0);
    const seen = new Set<string>();
    for (const [i, n] of notes.entries()) {
      expect(n.beat).toBeGreaterThanOrEqual(0);
      expect(n.len).toBeGreaterThan(0);
      expect(n.beat + n.len).toBeLessThanOrEqual(lastBeat(tune));
      expect(n.beat + (n.soundingLen ?? n.len)).toBeLessThanOrEqual(lastBeat(tune));
      expect(n.gain).toBeGreaterThan(0);
      expect(n.gain).toBeLessThanOrEqual(tune.id === 'drunken-sailor' ? 0.1 : 0.05);
      if (i) expect(n.beat).toBeGreaterThanOrEqual(notes[i - 1].beat);
      const key = `${n.beat}:${n.note}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
    const playable = findChordEntry(tune.id)?.role.notes;
    if (playable) expect(notes).not.toEqual(playable);
  });

  it.each(current)('$id preserves playable timing and at most two simultaneous melody notes', tune => {
    const beats = [...new Set(tune.melody.map(n => n.beat))];
    for (let i = 1; i < beats.length; i++) expect((beats[i] - beats[i - 1]) * 60_000 / tune.bpm).toBeGreaterThanOrEqual(220);
    for (const beat of beats) {
      expect(beats.filter(b => b >= beat && b < beat + 4).length).toBeLessThanOrEqual(8);
      expect(melodyAt(tune, beat).length).toBeLessThanOrEqual(2);
    }
  });

  it('restores the Spina waltz upper melody, with documented response octaves and chromatic approach', () => {
    // Printed p.4, Waltz 1: bars 6,9,18-19 and the final eight bars.
    expect(melodyAt(BLUE_DANUBE, 17)).toEqual([81]); // A5, not B5.
    expect(melodyAt(BLUE_DANUBE, 26)).toEqual([71]); // C#-E-B arpeggio.
    expect([51, 53, 54, 56].map(b => melodyAt(BLUE_DANUBE, b)[0])).toEqual([62, 74, 74, 69]);
    expect(BLUE_DANUBE.melody.find(n => n.beat === 75)).toMatchObject({ note: 71, len: 4 });
    expect([79, 80, 81, 85, 86].map(b => melodyAt(BLUE_DANUBE, b)[0])).toEqual([68, 69, 78, 74, 66]);
    expect(lastBeat(BLUE_DANUBE)).toBe(96);
    expect(fitToRange(BLUE_DANUBE.melody, 48, 79)).not.toBeNull();
    expect(fitToRange(BLUE_DANUBE.melody, 48, 72)).not.toBeNull();
  });

  it('preserves Strauss bass inversions instead of substituting different chords', () => {
    expect(BLUE_DANUBE.backingNotes!.some(n => n.beat < 3)).toBe(false);
    expect(BLUE_DANUBE.chords.find(c => c.beat === 51)).toMatchObject({ degree: 0, quality: 'maj' });
    expect(lowestAt(BLUE_DANUBE, 51)).toBe(54); // D/F#.
    expect(backingAt(BLUE_DANUBE, 52)).toEqual([57, 62, 66]);
    expect(BLUE_DANUBE.chords.find(c => c.beat === 75)).toMatchObject({ degree: 4, quality: 'dom7' });
    expect(lowestAt(BLUE_DANUBE, 75)).toBe(52); // A7/E.
    expect(backingAt(BLUE_DANUBE, 76)).toEqual([57, 61, 67]);
  });

  it('retains Spina bass register after the high response, independently of the compact player range', () => {
    // Original piano p.4, Waltz1 bars20-24. These are performance pitches;
    // the playable bass course can independently fit its controller range.
    for (const beat of [57, 60]) {
      expect(backingAt(BLUE_DANUBE, beat)).toEqual([42]); // F#2, not F#3.
      expect(backingAt(BLUE_DANUBE, beat + 1)).toEqual([45, 50, 54]);
      expect(backingAt(BLUE_DANUBE, beat + 2)).toEqual([45, 50, 54]);
    }
    for (const beat of [63, 66]) {
      expect(backingAt(BLUE_DANUBE, beat)).toEqual([43]); // G2.
      expect(backingAt(BLUE_DANUBE, beat + 1)).toEqual([47, 50, 52]);
    }
    expect(backingAt(BLUE_DANUBE, 69)).toEqual([43, 47, 50, 52]);
    expect([72, 73, 74].map(beat => backingAt(BLUE_DANUBE, beat))).toEqual([[52], [55], [59]]);
    expect(backingAt(BLUE_DANUBE, 87)).toEqual([43, 47, 50, 52]);
    expect(backingAt(BLUE_DANUBE, 90)).toEqual([45, 52, 55]);
    expect(BLUE_DANUBE.borrows).toContain(6); // The source's G# approach to A.
  });

  it('retains Joplin ties and the source descending/walking bass and minor-subdominant turn', () => {
    expect(THE_ENTERTAINER.pickup).toBe(1);
    expect(THE_ENTERTAINER.melody.find(n => n.beat === 4.5)).toMatchObject({ note: 72, len: 3 });
    // Original bars 10-11: F-E-Eb-D, including the passing chromatic bass.
    expect([21, 23, 24, 25].map(b => lowestAt(THE_ENTERTAINER, b))).toEqual([41, 40, 39, 38]);
    expect([30, 31, 32].map(b => lowestAt(THE_ENTERTAINER, b))).toEqual([43, 45, 47]);
    // Original bar18: F/A to Fm/Ab. The chord root remains F.
    expect([53, 55].map(b => lowestAt(THE_ENTERTAINER, b))).toEqual([33, 32]);
    expect(backingAt(THE_ENTERTAINER, 54)).toEqual([53, 57, 60]);
    expect(backingAt(THE_ENTERTAINER, 56)).toEqual([53, 56, 60]);
  });

  it('lands Frere Jacques on the tonic under both final bell answers', () => {
    for (const beat of [30, 62]) {
      expect(FRERE_JACQUES.backingNotes!.filter(n => n.beat === beat && n.len === 2).map(n => n.note)).toContain(48);
      expect(melodyAt(FRERE_JACQUES, beat)).toEqual([60]);
    }
  });

  it('preserves traditional modal color and gives dance repetitions different expression', () => {
    expect(DRUNKEN_SAILOR.melody.some(n => n.note === 71)).toBe(true);
    expect(DRUNKEN_SAILOR.backingNotes!.every(n => inScale(n.note, 62, SCALES.dorian))).toBe(true);
    expect(CAN_CAN.melody.slice(8, 12).map(n => n.note)).toEqual([77, 81, 84, 81]);
    const opening = CAN_CAN.backingNotes!.find(n => n.beat === 0)!;
    const response = CAN_CAN.backingNotes!.find(n => n.beat === 32)!;
    expect(opening.note).toBe(response.note);
    expect(opening.gain).not.toBe(response.gain);
    expect(opening.soundingLen).toBeLessThan(opening.len);
  });

  it('composes Two Hands in D Aeolian with the original top line and a consonant final tonic/fifth dyad', () => {
    expect(TWO_HANDS.melody.every(n => inScale(n.note, 62, SCALES.aeolian))).toBe(true);
    for (const n of TWO_HANDS.melody.filter(n => n.beat < 32)) {
      const repeat = TWO_HANDS.melody.filter(r => r.beat === n.beat + 32);
      expect(repeat).toHaveLength(2);
      expect(Math.max(...repeat.map(r => r.note))).toBe(n.note);
      expect(repeat.every(r => r.len === n.len)).toBe(true);
    }
    expect(melodyAt(TWO_HANDS, 62)).toEqual([57, 62]);
  });

  it('supports First Light held F without an early E and preserves Drift sustained texture', () => {
    const heldF = FIRST_LIGHT.melody.find(n => n.beat === 12)!;
    expect(heldF).toMatchObject({ note: 65, len: 4 });
    const duringF = FIRST_LIGHT.backingNotes!.filter(n => n.beat < 16 && n.beat + n.len > 12);
    expect(duringF.some(n => n.note % 12 === 4)).toBe(false);
    expect(FIRST_LIGHT.chords.find(c => c.beat === 16)).toMatchObject({ degree: 3, quality: 'min' });
    expect(DRIFT.voiceId).toBe('glass');
    expect(DRIFT.bedVoiceId).toBe('glass-pad');
    expect(DRIFT.backingNotes!.every(n => n.len >= 4 && n.attack === 0.7)).toBe(true);
    expect(DRIFT.backingNotes!.some(n => n.len === 8)).toBe(true);
  });

  it('makes the studies harmonic sentences follow their melodies', () => {
    expect(CHORD_GROUND.chords.map(c => c.degree)).toEqual([0, 0, 4, 4, 0, 4, 4, 0]);
    expect(CHORD_GROUND.chords.filter(c => c.degree === 4).every(c => c.quality === 'dom7')).toBe(true);
    expect(CHORD_MARCH.chords.find(c => c.beat === 16)).toMatchObject({ degree: 0, quality: 'maj' });
    expect(CHORD_MARCH.chords.find(c => c.beat === 20)).toMatchObject({ degree: 3, quality: 'maj' });
  });
});
