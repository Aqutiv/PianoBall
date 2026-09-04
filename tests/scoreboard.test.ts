import { describe, expect, it } from 'vitest';
import {
  REVEAL_SECONDS, Reveal, TIMING, bucketRun, formatCount, formatShare, formatTime,
  type VerdictTone,
} from '../src/ui/scoreboard';
import { stingLength, type Sting } from '../src/audio/sting';
import { tuneSting } from '../src/modes/playtune/sting';
import { SCALES } from '../src/audio/music';

const run = (n: number, fill: VerdictTone = 'perfect'): VerdictTone[] =>
  Array.from({ length: n }, () => fill);

describe('run map bucketing', () => {
  it('leaves a short run one tick per note', () => {
    const notes: VerdictTone[] = ['perfect', 'good', 'ok', 'miss'];
    expect(bucketRun(notes, 118)).toEqual(notes);
  });

  it('never draws more ticks than it was given room for', () => {
    expect(bucketRun(run(400), 118)).toHaveLength(118);
    expect(bucketRun(run(119), 118)).toHaveLength(118);
    expect(bucketRun(run(1), 118)).toHaveLength(1);
  });

  it('covers the whole run, so the last note reaches the last tick', () => {
    const notes = run(400);
    notes[399] = 'miss';
    expect(bucketRun(notes, 118).at(-1)).toBe('miss');
  });

  it('keeps the worst verdict in a bucket rather than averaging it away', () => {
    // One fluffed note in two hundred is the thing worth seeing, and it sits
    // where it happened rather than being diluted by its neighbours.
    const notes = run(200);
    notes[100] = 'miss';
    const ticks = bucketRun(notes, 20);
    expect(ticks.filter((t) => t === 'miss')).toHaveLength(1);
    expect(ticks[10]).toBe('miss');
  });

  it('ranks miss above wrong above ok above good', () => {
    expect(bucketRun(['good', 'perfect'], 1)).toEqual(['good']);
    expect(bucketRun(['ok', 'good'], 1)).toEqual(['ok']);
    expect(bucketRun(['wrong', 'ok'], 1)).toEqual(['wrong']);
    expect(bucketRun(['miss', 'wrong'], 1)).toEqual(['miss']);
  });

  it('reads a note that never resolved as the miss it was', () => {
    expect(bucketRun([null], 1)).toEqual(['miss']);
    expect(bucketRun([null, 'perfect'], 1)).toEqual(['miss']);
  });

  it('has nothing to draw for an empty run or no room', () => {
    expect(bucketRun([], 118)).toEqual([]);
    expect(bucketRun(run(4), 0)).toEqual([]);
  });
});

describe('the reveal clock', () => {
  it('holds every phase inside 0..1', () => {
    const r = new Reveal();
    for (let i = 0; i < 400; i++) {
      const v = r.phase(TIMING.ring.at, TIMING.ring.len);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      r.advance(1 / 60);
    }
  });

  it('starts a phase at nothing and finishes it at everything', () => {
    const r = new Reveal();
    expect(r.phase(TIMING.ring.at, TIMING.ring.len)).toBe(0);
    r.t = TIMING.ring.at;
    expect(r.phase(TIMING.ring.at, TIMING.ring.len)).toBe(0);
    r.t = TIMING.ring.at + TIMING.ring.len / 2;
    expect(r.phase(TIMING.ring.at, TIMING.ring.len)).toBeCloseTo(0.5, 5);
    r.t = TIMING.ring.at + TIMING.ring.len;
    expect(r.phase(TIMING.ring.at, TIMING.ring.len)).toBe(1);
  });

  it('settles every phase at once, which is what reduced motion asks for', () => {
    const r = new Reveal();
    r.settle();
    for (const p of [TIMING.head, TIMING.ring, TIMING.map, TIMING.badge, TIMING.banner]) {
      expect(r.phase(p.at, p.len)).toBe(1);
    }
    // Including the last of a long stagger, which is what REVEAL_SECONDS has to
    // clear for a run with every optional row present.
    const last = TIMING.rows.at + TIMING.rows.step * 7;
    expect(r.phase(last, TIMING.rows.len)).toBe(1);
  });

  it('stops counting once there is nothing left to move', () => {
    const r = new Reveal();
    for (let i = 0; i < 600; i++) r.advance(1 / 60);
    expect(r.done).toBe(true);
    expect(r.t).toBeLessThan(REVEAL_SECONDS + 1);
  });
});

describe('formatting', () => {
  it('writes a duration as minutes and seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9)).toBe('0:09');
    expect(formatTime(154)).toBe('2:34');
    expect(formatTime(-3)).toBe('0:00');
  });

  it('writes a multiplier the way the HUD does', () => {
    expect(formatCount(3.5, 'multiplier')).toBe('\u00d73.5');
    expect(formatCount(1, 'multiplier')).toBe('\u00d71.0');
  });

  it('groups a score and rounds a share', () => {
    expect(formatCount(12480)).toBe((12480).toLocaleString());
    expect(formatShare(0.9249)).toBe('92%');
    expect(formatShare(1.4)).toBe('100%');
    expect(formatShare(-1)).toBe('0%');
  });
});

describe('the cadence a finished tune resolves on', () => {
  const C4 = 60;
  const at = (s: Sting) => s.notes.map((n) => n.at);
  const notes = (s: Sting) => s.notes.map((n) => n.note - C4 - 12);

  it('climbs to the octave on a pass, and past it on a best', () => {
    expect(notes(tuneSting(C4, SCALES.ionian, 0.5, 'pass'))).toEqual([0, 4, 7, 12]);
    expect(notes(tuneSting(C4, SCALES.ionian, 0.5, 'best'))).toEqual([0, 4, 7, 12, 16]);
  });

  it('turns around and comes down when the run fell short', () => {
    const short = notes(tuneSting(C4, SCALES.ionian, 0.5, 'short'));
    expect(short).toEqual([12, 7, 4]);
    // It has to stop somewhere that is not home, or a failed run resolves.
    expect(short.at(-1)).not.toBe(0);
    expect(short.at(-1)).not.toBe(12);
  });

  it('dulls as it falls, and opens as it climbs', () => {
    const short = tuneSting(C4, SCALES.ionian, 0.5, 'short').notes.map((n) => n.bright);
    expect(short[0]).toBeGreaterThan(short[short.length - 1]);
    const pass = tuneSting(C4, SCALES.ionian, 0.5, 'pass').notes.map((n) => n.bright);
    expect(pass[pass.length - 1]).toBeGreaterThan(pass[0]);
  });

  it('takes the third of the mode, not the third entry of the scale', () => {
    // The trap this guards: `minorPentatonic[2]` is 5, a fourth. A cadence
    // built by index would resolve onto the wrong note in exactly the tunes
    // whose scale is most audible.
    expect(SCALES.minorPentatonic[2]).toBe(5);
    expect(notes(tuneSting(C4, SCALES.minorPentatonic, 0.5, 'pass'))).toEqual([0, 3, 7, 12]);
    expect(notes(tuneSting(C4, SCALES.aeolian, 0.5, 'pass'))).toEqual([0, 3, 7, 12]);
    expect(notes(tuneSting(C4, SCALES.lydian, 0.5, 'pass'))).toEqual([0, 4, 7, 12]);
  });

  it('is punctuation rather than a coda, at any tempo', () => {
    for (const beat of [60 / 40, 60 / 200]) {
      const s = tuneSting(C4, SCALES.ionian, beat, 'best');
      expect(at(s)).toEqual([...at(s)].sort((a, b) => a - b));
      expect(new Set(at(s)).size).toBe(s.notes.length);
      expect(stingLength(s)).toBeLessThanOrEqual(0.8);
    }
  });

  it('never asks for a gain that would clip or a pan off the field', () => {
    for (const outcome of ['best', 'pass', 'short'] as const) {
      for (const n of tuneSting(C4, SCALES.dorian, 0.5, outcome).notes) {
        expect(n.gain).toBeGreaterThan(0);
        expect(n.gain).toBeLessThanOrEqual(1);
        expect(Math.abs(n.pan)).toBeLessThanOrEqual(1);
        expect(n.bright).toBeGreaterThan(0);
        expect(n.bright).toBeLessThanOrEqual(1);
      }
    }
  });
});
