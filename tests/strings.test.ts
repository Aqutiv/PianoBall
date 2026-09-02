import { describe, expect, it } from 'vitest';
import {
  Lru, STRING_MAX_SECONDS, renderString, stringSeconds, velocityBucket, type StringSpec,
} from '../src/audio/strings';
import { makeRng } from '../src/audio/shaping';

const HARP: StringSpec = {
  decay: 2.4, keyTrack: -0.6, damp: 0.35, stretch: 0.5, pick: 0.2, bright: 2000, velBright: 8000,
};
const RATES = [48000, 44100];

function rms(x: Float32Array, from: number, to: number, rate: number): number {
  const a = Math.round(from * rate);
  const b = Math.min(x.length, Math.round(to * rate));
  let e = 0;
  for (let i = a; i < b; i++) e += x[i] * x[i];
  return Math.sqrt(e / Math.max(1, b - a));
}

/** Zero crossings per second over a window: a rough brightness. */
function crossings(x: Float32Array, from: number, to: number, rate: number): number {
  const a = Math.round(from * rate);
  const b = Math.min(x.length, Math.round(to * rate));
  let n = 0;
  for (let i = a + 1; i < b; i++) if ((x[i] >= 0) !== (x[i - 1] >= 0)) n++;
  return (n * rate) / Math.max(1, b - a);
}

/**
 * The pitch, by autocorrelation around the expected period, with the peak
 * interpolated between samples so a fraction of a sample can be seen.
 */
function pitchOf(x: Float32Array, expected: number, rate: number): number {
  const from = Math.round(0.05 * rate);
  const span = Math.round(0.25 * rate);
  const period = rate / expected;
  const lo = Math.floor(period * 0.9);
  const hi = Math.ceil(period * 1.1);
  const corr = new Float64Array(hi + 2);
  for (let lag = lo - 1; lag <= hi + 1; lag++) {
    let c = 0;
    for (let i = from; i < from + span; i++) c += x[i] * x[i + lag];
    corr[lag] = c;
  }
  let best = lo;
  for (let lag = lo; lag <= hi; lag++) if (corr[lag] > corr[best]) best = lag;
  const y0 = corr[best - 1], y1 = corr[best], y2 = corr[best + 1];
  const denom = y0 - 2 * y1 + y2;
  const shift = denom === 0 ? 0 : (0.5 * (y0 - y2)) / denom;
  return rate / (best + shift);
}

const cents = (a: number, b: number) => 1200 * Math.log2(a / b);

describe('a rendered string', () => {
  it('is in tune with the oscillators, at either sample rate', () => {
    for (const rate of RATES) {
      for (const note of [48, 60, 72, 84]) {
        const expected = 440 * Math.pow(2, (note - 69) / 12);
        const x = renderString(HARP, note, 2, rate, makeRng(1));
        expect(Math.abs(cents(pitchOf(x, expected, rate), expected)), `${note} at ${rate}`).toBeLessThan(4);
      }
    }
  });

  it('rings, and dies away from the top down', () => {
    const rate = 48000;
    const x = renderString(HARP, 60, 2, rate, makeRng(2));
    expect(rms(x, 0, 0.1, rate)).toBeGreaterThan(rms(x, 0.5, 0.6, rate));
    expect(rms(x, 0.5, 0.6, rate)).toBeGreaterThan(rms(x, 1.0, 1.1, rate));
    expect(rms(x, 1.0, 1.1, rate)).toBeGreaterThan(0);
    // Brighter at the pluck than a second later: the loop's lowpass at work.
    expect(crossings(x, 0.01, 0.1, rate)).toBeGreaterThan(crossings(x, 1.0, 1.1, rate));
  });

  it('plucks brighter the harder it is struck, and elsewhere along the string', () => {
    const rate = 48000;
    const soft = renderString(HARP, 60, 0, rate, makeRng(3));
    const hard = renderString(HARP, 60, 3, rate, makeRng(3));
    expect(crossings(hard, 0.005, 0.1, rate)).toBeGreaterThan(crossings(soft, 0.005, 0.1, rate));
    const near = renderString({ ...HARP, pick: 0.08 }, 60, 2, rate, makeRng(4));
    const middle = renderString({ ...HARP, pick: 0.45 }, 60, 2, rate, makeRng(4));
    expect(crossings(near, 0.005, 0.1, rate)).not.toBeCloseTo(crossings(middle, 0.005, 0.1, rate), 0);
  });

  it('rings shorter up the keyboard, and never past its cap', () => {
    const rate = 44100;
    const low = renderString(HARP, 36, 2, rate, makeRng(5));
    const high = renderString(HARP, 84, 2, rate, makeRng(5));
    const quietBy = (x: Float32Array) => {
      const top = rms(x, 0, 0.05, rate);
      for (let t = 0.05; t < x.length / rate; t += 0.05) if (rms(x, t, t + 0.05, rate) < top * 0.01) return t;
      return x.length / rate;
    };
    expect(quietBy(high)).toBeLessThan(quietBy(low));
    expect(stringSeconds(HARP, 84)).toBeLessThan(stringSeconds(HARP, 36));
    expect(low.length).toBeLessThanOrEqual(STRING_MAX_SECONDS * rate);
    expect(stringSeconds({ ...HARP, decay: 20 }, 36)).toBe(STRING_MAX_SECONDS);
  });

  it('stays inside full scale and is finite everywhere', () => {
    for (const bucket of [0, 3] as const) {
      const x = renderString(HARP, 60, bucket, 48000, makeRng(6));
      for (let i = 0; i < x.length; i++) {
        expect(Number.isFinite(x[i])).toBe(true);
        expect(Math.abs(x[i])).toBeLessThanOrEqual(1);
      }
    }
  });

  it('files a velocity into one of four plucks', () => {
    expect(velocityBucket(0)).toBe(0);
    expect(velocityBucket(0.3)).toBe(1);
    expect(velocityBucket(0.6)).toBe(2);
    expect(velocityBucket(0.99)).toBe(3);
    expect(velocityBucket(1)).toBe(3);
    expect(velocityBucket(2)).toBe(3);
  });
});

describe('the string cache', () => {
  it('forgets its oldest entries first, by count', () => {
    const lru = new Lru<number>(3, 1e9);
    lru.set('a', 1, 10);
    lru.set('b', 2, 10);
    lru.set('c', 3, 10);
    // Reading a makes it the newest, so b is the one to go.
    expect(lru.get('a')).toBe(1);
    lru.set('d', 4, 10);
    expect(lru.size).toBe(3);
    expect(lru.get('b')).toBeUndefined();
    expect(lru.get('a')).toBe(1);
    expect(lru.get('d')).toBe(4);
  });

  it('forgets by weight too, and keeps its books straight', () => {
    const lru = new Lru<string>(100, 250);
    lru.set('a', 'a', 100);
    lru.set('b', 'b', 100);
    expect(lru.bytes).toBe(200);
    lru.set('c', 'c', 100);
    expect(lru.size).toBe(2);
    expect(lru.bytes).toBe(200);
    expect(lru.get('a')).toBeUndefined();
    lru.set('b', 'B', 50);
    expect(lru.bytes).toBe(150);
    expect(lru.get('b')).toBe('B');
    lru.clear();
    expect(lru.size).toBe(0);
    expect(lru.bytes).toBe(0);
  });
});
