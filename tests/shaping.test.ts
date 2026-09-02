import { describe, expect, it } from 'vitest';
import {
  EXACT, NO_TRACK, PEDAL_DOWN, PEDAL_UP, bodyMixFor, humanize, keyFactors, makeRng, pedalRelease,
  stretchCents, unisonDetunes, velocityPeak,
} from '../src/audio/shaping';

describe('the pedal', () => {
  it('leaves a release alone when up, stretches it half down, and holds when down', () => {
    expect(pedalRelease(0.3, 0)).toBe(0.3);
    expect(pedalRelease(0.3, PEDAL_UP - 0.01)).toBe(0.3);
    expect(pedalRelease(0.3, PEDAL_DOWN)).toBe(Infinity);
    expect(pedalRelease(0.3, 1)).toBe(Infinity);
    let last = 0.3;
    for (let p = PEDAL_UP; p < PEDAL_DOWN; p += 0.05) {
      const r = pedalRelease(0.3, p);
      expect(r).toBeGreaterThanOrEqual(last);
      expect(Number.isFinite(r)).toBe(true);
      last = r;
    }
    expect(last).toBeGreaterThan(1);
  });

  it('opens the board with the pedal, from a little to all of it', () => {
    expect(bodyMixFor(0)).toBeCloseTo(0.35, 6);
    expect(bodyMixFor(1)).toBeCloseTo(1, 6);
    expect(bodyMixFor(0.5)).toBeGreaterThan(bodyMixFor(0.25));
    expect(bodyMixFor(2)).toBeCloseTo(1, 6);
  });
});

describe('velocity', () => {
  it('rises with the strike, on the old line and in decibels alike', () => {
    for (const db of [undefined, 24, 36]) {
      let last = -1;
      for (let v = 0; v <= 1.0001; v += 0.05) {
        const p = velocityPeak(v, db);
        expect(p, `v ${v} at ${db}`).toBeGreaterThan(last);
        last = p;
      }
      // Every curve meets at the top, so a voice in decibels is no louder.
      expect(velocityPeak(1, db)).toBeCloseTo(0.36, 6);
    }
    // A range in decibels means what it says: the softest strike is that far down.
    expect(20 * Math.log10(velocityPeak(0, 30) / velocityPeak(1, 30))).toBeCloseTo(-30, 6);
    expect(velocityPeak(0)).toBeCloseTo(0.06, 6);
  });
});

describe('key tracking', () => {
  it('is nothing at C4 and doubles or halves per octave by its exponent', () => {
    expect(keyFactors({ decay: -1, bright: 0.5 }, 60)).toEqual({ ...NO_TRACK });
    const up = keyFactors({ decay: -1, bright: 0.5, level: -0.25 }, 72);
    expect(up.decay).toBeCloseTo(0.5, 6);
    expect(up.bright).toBeCloseTo(Math.SQRT2, 6);
    expect(up.level).toBeCloseTo(Math.pow(2, -0.25), 6);
    expect(up.release).toBe(1);
    expect(up.noise).toBe(1);
    expect(keyFactors({ decay: -1 }, 48).decay).toBeCloseTo(2, 6);
    expect(keyFactors(undefined, 100)).toBe(NO_TRACK);
  });
});

describe('stretch', () => {
  it('sharpens above the middle, flattens below, and more the further out', () => {
    expect(stretchCents(2, 60)).toBe(0);
    expect(stretchCents(2, 72)).toBeCloseTo(2, 6);
    expect(stretchCents(2, 84)).toBeCloseTo(8, 6);
    expect(stretchCents(2, 48)).toBeCloseTo(-2, 6);
    expect(stretchCents(2, 36)).toBeCloseTo(-8, 6);
    expect(stretchCents(undefined, 96)).toBe(0);
  });
});

describe('unison', () => {
  it('spreads its voices about the pitch, summing to nothing', () => {
    expect(unisonDetunes(1, 10)).toEqual([0]);
    expect(unisonDetunes(2, 10)).toEqual([-5, 5]);
    expect(unisonDetunes(3, 10)).toEqual([-10, 0, 10]);
    expect(unisonDetunes(3, 0)).toEqual([0]);
    for (const n of [1, 2, 3]) expect(unisonDetunes(n, 7).reduce((a, b) => a + b, 0)).toBeCloseTo(0, 9);
  });
});

describe('humanize', () => {
  it('drifts within its bounds, scaled by the amount, and not at all at zero', () => {
    const rng = makeRng(42);
    for (let i = 0; i < 200; i++) {
      const h = humanize(rng, 1);
      expect(Math.abs(h.detune)).toBeLessThanOrEqual(2.5);
      expect(Math.abs(h.attack - 1)).toBeLessThanOrEqual(0.15);
      expect(Math.abs(h.level - 1)).toBeLessThanOrEqual(0.06);
      expect(Math.abs(h.bright - 1)).toBeLessThanOrEqual(0.05);
      const half = humanize(rng, 0.5);
      expect(Math.abs(half.detune)).toBeLessThanOrEqual(1.25);
    }
    expect(humanize(rng, 0)).toBe(EXACT);
  });

  it('draws the same drift for the same seed', () => {
    const a = makeRng(7);
    const b = makeRng(7);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
    expect(makeRng(8)()).not.toBe(makeRng(7)());
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
