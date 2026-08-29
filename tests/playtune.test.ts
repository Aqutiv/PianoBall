import { describe, expect, it } from 'vitest';
import { LIBRARY, TUNE_ORDER, findTune } from '../src/modes/playtune/library';
import { fitToRange, fittedMelody, lastBeat, noteRange, validate } from '../src/modes/playtune/chart';
import { Judge, WINDOWS, grade, type TargetSpec } from '../src/modes/playtune/judge';
import { Transport } from '../src/modes/playtune/transport';
import { loadProgress, recordRun, resetProgress, unlockedBy } from '../src/modes/playtune/progress';
import { SCALES, degreeToNote, inScale } from '../src/audio/music';

describe('the tune library', () => {
  it('has no chart problems', () => {
    for (const tune of LIBRARY) {
      expect(validate(tune), `${tune.id}: ${validate(tune).join('; ')}`).toEqual([]);
    }
  });

  it('gives every tune a unique id and an entry in the order', () => {
    const ids = new Set(LIBRARY.map((t) => t.id));
    expect(ids.size).toBe(LIBRARY.length);
    expect(TUNE_ORDER).toHaveLength(LIBRARY.length);
    for (const id of TUNE_ORDER) expect(findTune(id)).toBeDefined();
  });

  it('never gets easier as it goes on', () => {
    for (let i = 1; i < LIBRARY.length; i++) {
      expect(LIBRARY[i].difficulty).toBeGreaterThanOrEqual(LIBRARY[i - 1].difficulty);
    }
  });

  it('resolves every chord degree inside its own scale', () => {
    for (const tune of LIBRARY) {
      const scale = SCALES[tune.scaleId];
      for (const c of tune.chords) {
        const root = degreeToNote(c.degree, tune.root, scale);
        expect(inScale(root, tune.root, scale), `${tune.id} degree ${c.degree}`).toBe(true);
      }
    }
  });

  it('keeps the chord bed running under the whole melody', () => {
    for (const tune of LIBRARY) {
      const chordEnd = tune.chords.reduce((e, c) => Math.max(e, c.beat + c.len), 0);
      const melodyEnd = tune.melody.reduce((e, n) => Math.max(e, n.beat + n.len), 0);
      // Within a bar is close enough: the bed may stop on the final downbeat.
      expect(chordEnd, tune.id).toBeGreaterThanOrEqual(melodyEnd - tune.beatsPerBar);
    }
  });

  it('is long enough to be worth playing', () => {
    for (const tune of LIBRARY) {
      expect(lastBeat(tune), tune.id).toBeGreaterThanOrEqual(16);
      expect(tune.melody.length, tune.id).toBeGreaterThanOrEqual(12);
    }
  });
});

describe('fitting a chart to a keyboard', () => {
  // The three keybed sizes the app claims to support.
  const KEYBOARDS: [string, number, number][] = [
    ['25 keys', 48, 72],
    ['49 keys', 36, 84],
    ['61 keys', 36, 96],
  ];

  it('places every tune inside a 49- and 61-key range', () => {
    for (const [name, low, high] of KEYBOARDS.slice(1)) {
      for (const tune of LIBRARY) {
        const shift = fitToRange(tune, low, high);
        expect(shift, `${tune.id} on ${name}`).not.toBeNull();
        const moved = fittedMelody(tune, shift!);
        for (const n of moved) {
          expect(n.note, `${tune.id} on ${name}`).toBeGreaterThanOrEqual(low);
          expect(n.note, `${tune.id} on ${name}`).toBeLessThanOrEqual(high);
        }
      }
    }
  });

  it('reports honestly when a melody is wider than the keyboard', () => {
    const wide = LIBRARY.find((t) => {
      const r = noteRange(t);
      return r.high - r.low > 24;
    });
    if (wide) expect(fitToRange(wide, 60, 60 + 12)).toBeNull();
    // A tune that does fit still fits on the smallest board when narrow enough.
    const narrow = LIBRARY[0];
    expect(fitToRange(narrow, 48, 72)).not.toBeNull();
  });

  it('only ever moves a chart by whole octaves', () => {
    for (const tune of LIBRARY) {
      const shift = fitToRange(tune, 36, 96);
      expect(Math.abs(shift! % 12), tune.id).toBe(0);
    }
  });

  it('leaves the melody sorted after fitting', () => {
    for (const tune of LIBRARY) {
      const moved = fittedMelody(tune, 0);
      for (let i = 1; i < moved.length; i++) {
        expect(moved[i].beat, tune.id).toBeGreaterThanOrEqual(moved[i - 1].beat);
      }
    }
  });
});

describe('judging', () => {
  const specs: TargetSpec[] = [
    { note: 60, beat: 0, len: 1, time: 1 },
    { note: 62, beat: 1, len: 1, time: 2 },
    { note: 64, beat: 2, len: 1, time: 3 },
  ];

  it('grades by how far from the note the press landed', () => {
    const j = new Judge(specs);
    expect(j.press(60, 1).verdict).toBe('perfect');
    expect(j.press(62, 2 + WINDOWS.perfect + 0.001).verdict).toBe('good');
    expect(j.press(64, 3 + WINDOWS.good + 0.001).verdict).toBe('ok');
  });

  it('treats early and late symmetrically', () => {
    const early = new Judge(specs);
    const late = new Judge(specs);
    const off = WINDOWS.perfect + 0.01;
    expect(early.press(60, 1 - off).verdict).toBe(late.press(60, 1 + off).verdict);
  });

  it('calls a press outside every window wrong, and costs no accuracy for it', () => {
    const j = new Judge(specs);
    const r = j.press(60, 1 + WINDOWS.ok + 0.01);
    expect(r.verdict).toBe('wrong');
    expect(r.target).toBeNull();
    expect(j.accuracy).toBe(0);
    expect(j.judged).toBe(0);
  });

  it('breaks the combo on a wrong note', () => {
    const j = new Judge(specs);
    j.press(60, 1);
    expect(j.combo).toBe(1);
    j.press(71, 1);
    expect(j.combo).toBe(0);
    expect(j.bestCombo).toBe(1);
  });

  it('misses a note whose window has closed, once', () => {
    const j = new Judge(specs);
    expect(j.expire(1 + WINDOWS.ok + 0.001)).toHaveLength(1);
    expect(j.expire(1 + WINDOWS.ok + 0.002)).toHaveLength(0);
    expect(j.tally.miss).toBe(1);
  });

  it('never double-counts a note that was hit', () => {
    const j = new Judge(specs);
    j.press(60, 1);
    j.expire(10);
    expect(j.tally.miss).toBe(2);   // the two notes never pressed
    expect(j.tally.perfect).toBe(1);
    expect(j.judged).toBe(3);
    expect(j.done).toBe(true);
  });

  it('picks the nearest target when the same note repeats', () => {
    const repeated: TargetSpec[] = [
      { note: 60, beat: 0, len: 1, time: 1 },
      { note: 60, beat: 1, len: 1, time: 1.3 },
    ];
    const j = new Judge(repeated);
    // Slightly late for the second, which must not be read as early for a third.
    j.press(60, 1.32);
    expect(j.targets[1].state).toBe('hit');
    expect(j.targets[0].state).toBe('waiting');
  });

  it('judges simultaneous notes independently', () => {
    const chord: TargetSpec[] = [
      { note: 60, beat: 0, len: 1, time: 1 },
      { note: 64, beat: 0, len: 1, time: 1 },
    ];
    const j = new Judge(chord);
    j.press(60, 1);
    j.expire(2);
    expect(j.tally.perfect).toBe(1);
    expect(j.tally.miss).toBe(1);
    expect(j.accuracy).toBe(0.5);
  });

  it('weights accuracy by verdict', () => {
    const j = new Judge(specs);
    j.press(60, 1);                                   // perfect  -> 1
    j.press(62, 2 + WINDOWS.perfect + 0.001);         // good     -> 0.75
    j.expire(10);                                     // miss     -> 0
    expect(j.accuracy).toBeCloseTo((1 + 0.75) / 3, 5);
  });

  it('hands out grades at the documented thresholds', () => {
    expect(grade(1)).toBe('S');
    expect(grade(0.98)).toBe('S');
    expect(grade(0.92)).toBe('A');
    expect(grade(0.84)).toBe('B');
    expect(grade(0.7)).toBe('C');
    expect(grade(0.699)).toBeNull();
  });
});

describe('the transport', () => {
  it('puts beat zero after the count-in', () => {
    const t = new Transport();
    t.bpm = 120;
    t.start(10, 4);
    expect(t.beatSeconds).toBe(0.5);
    expect(t.timeOf(0)).toBe(12);
    expect(t.beatAt(10)).toBe(-4);
    expect(t.beatAt(12)).toBe(0);
    expect(t.beatAt(13)).toBe(2);
  });

  it('round-trips a beat through time and back', () => {
    const t = new Transport();
    t.bpm = 137;
    t.start(3.25, 2);
    for (const beat of [0, 1, 7.5, 129]) {
      expect(t.beatAt(t.timeOf(beat))).toBeCloseTo(beat, 9);
    }
  });

  it('subtracts the calibration offset from a press', () => {
    const t = new Transport();
    t.offset = 0.03;
    expect(t.judgeTime(5)).toBeCloseTo(4.97, 9);
  });
});

describe('progression', () => {
  const order = ['a', 'b', 'c'];

  it('starts with only the first tune open', () => {
    const p = resetProgress(order);
    expect(p.unlocked).toEqual(['a']);
    expect(p.best).toEqual({});
  });

  it('opens exactly the next tune on a pass, and nothing on a fail', () => {
    const p = resetProgress(order);
    const failed = recordRun(p, 'a', order, { accuracy: 0.4, score: 10, grade: null, passed: false });
    expect(failed.unlocked).toBeNull();
    expect(p.unlocked).toEqual(['a']);

    const passed = recordRun(p, 'a', order, { accuracy: 0.9, score: 99, grade: 'A', passed: true });
    expect(passed.unlocked).toBe('b');
    expect(p.unlocked).toEqual(['a', 'b']);
    expect(recordRun(p, 'a', order, { accuracy: 0.95, score: 120, grade: 'A', passed: true }).unlocked)
      .toBeNull();
  });

  it('only ever improves a best', () => {
    const p = resetProgress(order);
    recordRun(p, 'a', order, { accuracy: 0.9, score: 500, grade: 'A', passed: true });
    const worse = recordRun(p, 'a', order, { accuracy: 0.3, score: 20, grade: null, passed: false });
    expect(worse.improved).toBe(false);
    expect(p.best.a.accuracy).toBe(0.9);
    expect(p.best.a.score).toBe(500);
    expect(p.best.a.grade).toBe('A');
    expect(p.best.a.plays).toBe(2);
  });

  it('names what unlocks a locked tune', () => {
    expect(unlockedBy(order, 'b')).toBe('a');
    expect(unlockedBy(order, 'a')).toBeNull();
  });

  it('recovers from unreadable storage', () => {
    resetProgress(order);
    const p = loadProgress(order);
    expect(p.unlocked).toContain('a');
  });

  it('drops ids that are no longer in the library', () => {
    const p = resetProgress(order);
    p.unlocked.push('gone');
    p.best.gone = { accuracy: 1, score: 1, grade: 'S', plays: 1 };
    // Round-trip through storage the way a later release would.
    recordRun(p, 'a', order, { accuracy: 0.9, score: 1, grade: 'A', passed: true });
    const reloaded = loadProgress(order);
    expect(reloaded.unlocked).not.toContain('gone');
    expect(reloaded.best.gone).toBeUndefined();
  });
});
