import { describe, expect, it } from 'vitest';
import { COMP_PATTERNS, compEvents, type CompEvent, type CompPattern } from '../src/audio/comp';

/** A plain C major triad, already voiced, plus the root the bass plays from. */
const VOICED = [60, 64, 67];
const ROOT = 48;

function events(
  pattern: CompPattern, chordLen: number, beatsPerBar: number, barPhase = 0,
): CompEvent[] {
  return compEvents(pattern, VOICED, ROOT, chordLen, beatsPerBar, barPhase);
}

/**
 * Where the pattern struck a bass note, which is its sense of the downbeat.
 *
 * The short attack is what separates these from the quiet sustained root that
 * runs underneath every rhythmic pattern: same note, different job.
 */
function bassAt(evs: readonly CompEvent[]): number[] {
  return evs
    .filter((e) => e.notes.length === 1 && e.notes[0] === ROOT - 12 && e.attack < 0.1)
    .map((e) => e.offset);
}

describe('accompaniment patterns', () => {
  it('keeps every event inside the chord it belongs to', () => {
    for (const pattern of COMP_PATTERNS) {
      for (const [len, per] of [[4, 4], [3, 3], [1, 3], [6, 6], [9, 9], [1.5, 3]] as const) {
        for (const ev of events(pattern, len, per)) {
          expect(ev.offset, `${pattern} ${len}/${per}`).toBeGreaterThanOrEqual(0);
          expect(ev.offset, `${pattern} ${len}/${per}`).toBeLessThan(len);
          // The sustained layers deliberately overlap the next chord a little so
          // the harmony does not gap; nothing may run past that.
          expect(ev.offset + ev.len, `${pattern} ${len}/${per}`).toBeLessThanOrEqual(len * 1.06);
          expect(ev.len, `${pattern} ${len}/${per}`).toBeGreaterThan(0);
          expect(ev.gain, `${pattern} ${len}/${per}`).toBeGreaterThan(0);
          expect(ev.attack, `${pattern} ${len}/${per}`).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('always puts a floor under the chord, struck or swelled', () => {
    for (const pattern of COMP_PATTERNS) {
      const evs = events(pattern, 4, 4);
      expect(evs.length, pattern).toBeGreaterThan(0);
      const under = evs.filter((e) => e.offset === 0 && e.notes.includes(ROOT - 12));
      expect(under.length, pattern).toBeGreaterThan(0);
    }
  });

  it('never stacks two bass notes on the same moment', () => {
    for (const pattern of COMP_PATTERNS) {
      for (const phase of [0, 1, 2, 3]) {
        const at = bassAt(events(pattern, 3, 4, phase));
        expect(new Set(at).size, `${pattern} phase ${phase}`).toBe(at.length);
      }
    }
  });

  it('leaves a chord with no notes alone', () => {
    for (const pattern of COMP_PATTERNS) {
      expect(compEvents(pattern, [], ROOT, 4, 4), pattern).toEqual([]);
      expect(compEvents(pattern, VOICED, ROOT, 0, 4), pattern).toEqual([]);
    }
  });

  it('plays a sustain as one swell and nothing else', () => {
    const evs = events('sustain', 4, 4);
    expect(evs).toHaveLength(2);
    // A swell rises over most of its own length; that is what makes it a swell
    // rather than the struck chords every other pattern is built from.
    for (const ev of evs) expect(ev.attack).toBeGreaterThan(1);
  });

  it('puts the waltz bass on one and the chords on two and three', () => {
    const evs = events('waltz', 3, 3);
    expect(bassAt(evs)).toEqual([0]);
    const chords = evs.filter((e) => e.notes.length === VOICED.length && e.attack < 0.1);
    expect(chords.map((e) => e.offset)).toEqual([1, 2]);
  });

  it('puts the march bass on the strong beats', () => {
    expect(bassAt(events('march', 4, 4))).toEqual([0, 2]);
  });

  it('gives each group of three its own bass note in compound time', () => {
    expect(bassAt(events('compound', 9, 9))).toEqual([0, 3, 6]);
    expect(bassAt(events('compound', 6, 6))).toEqual([0, 3]);
  });

  it('rolls a chord in quavers, or in crotchets when the tempo has no room', () => {
    const rolled = (p: CompPattern) =>
      events(p, 4, 4).filter((e) => e.notes.length === 1 && e.notes[0] !== ROOT - 12);
    expect(rolled('arpeggio').map((e) => e.offset)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    expect(rolled('broken').map((e) => e.offset)).toEqual([0, 1, 2, 3]);
    // Up and back down again, so a rolled chord turns around rather than jumping
    // an octave every time it runs out of notes.
    expect(rolled('broken').map((e) => e.notes[0])).toEqual([60, 64, 67, 64]);
  });

  it('finds the bar line when the tune started before it', () => {
    // Amazing Grace: one beat of pickup, so the chart's beat 1 is the downbeat
    // and its beat 0 is the last beat of an imaginary bar before it.
    const pickup = events('waltz', 1, 3, -1);
    expect(bassAt(pickup)).toEqual([0]);

    // The chord on the bar line itself gets the bass in the same place, and the
    // one starting on the second beat of a bar does not pretend it is a downbeat.
    expect(bassAt(events('waltz', 3, 3, 0))).toEqual([0]);
    // A chord that starts on the second beat still gets a floor under it, but
    // the bar line is not where it starts, so nothing pretends otherwise.
    expect(bassAt(events('waltz', 2, 3, 1))).toEqual([0]);
    expect(bassAt(events('march', 2, 4, 2))).toEqual([0]);
  });
});
