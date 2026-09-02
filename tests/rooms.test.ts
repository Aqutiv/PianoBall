import { describe, expect, it } from 'vitest';
import {
  BOARD_MODES, CAB, HALL, HALL_LITE, boardImpulse, onePoleHigh, onePoleLow, roomImpulse,
} from '../src/audio/rooms';
import { makeRng } from '../src/audio/shaping';

const RATES = [48000, 44100];

/** Mean square over a window of seconds. */
function energy(x: Float32Array, from: number, to: number, rate: number): number {
  const a = Math.round(from * rate);
  const b = Math.min(x.length, Math.round(to * rate));
  let e = 0;
  for (let i = a; i < b; i++) e += x[i] * x[i];
  return e / Math.max(1, b - a);
}

/** Magnitude at one frequency (Goertzel), so a mode can be found without an FFT. */
function magnitude(x: Float32Array, freq: number, rate: number): number {
  const w = (2 * Math.PI * freq) / rate;
  const c = 2 * Math.cos(w);
  let s0 = 0, s1 = 0, s2 = 0;
  for (let i = 0; i < x.length; i++) {
    s0 = x[i] + c * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2);
}

function firstSound(x: Float32Array): number {
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > 1e-6) return i;
  return -1;
}

describe('a rendered room', () => {
  it('is silent until the pre-delay has passed, then reflects', () => {
    for (const rate of RATES) {
      for (const spec of [HALL, CAB]) {
        const [l, r] = roomImpulse(spec, rate, makeRng(1));
        for (const ch of [l, r]) {
          const at = firstSound(ch);
          expect(at, `${rate}`).toBeGreaterThanOrEqual(spec.predelay * rate);
          // The first reflection, give or take its jitter and its width.
          expect(at, `${rate}`).toBeLessThan((spec.predelay + spec.early.from + 0.001) * rate);
        }
      }
    }
  });

  it('decays, and its top end dies before its bottom', () => {
    const rate = 48000;
    const [l] = roomImpulse(HALL, rate, makeRng(2));
    // The reflections are there before the tail is, and the tail then falls.
    expect(energy(l, 0.02, 0.06, rate)).toBeGreaterThan(0);
    expect(energy(l, 0.1, 0.15, rate)).toBeGreaterThan(energy(l, 1, 1.05, rate));
    expect(energy(l, 1, 1.05, rate)).toBeGreaterThan(energy(l, 2, 2.05, rate));
    expect(energy(l, 2, 2.05, rate)).toBeGreaterThan(0);

    // How much of each band is left after a second, relative to its start.
    const hi = onePoleHigh(l, 3000, rate);
    const lo = onePoleLow(l, 250, rate);
    const left = (x: Float32Array) => energy(x, 1, 1.2, rate) / energy(x, 0.1, 0.3, rate);
    expect(left(hi)).toBeLessThan(left(lo));
  });

  it('is different in each ear', () => {
    const rate = 48000;
    const [l, r] = roomImpulse(HALL, rate, makeRng(3));
    const from = Math.round(0.1 * rate);
    let lr = 0, ll = 0, rr = 0;
    for (let i = from; i < l.length; i++) {
      lr += l[i] * r[i];
      ll += l[i] * l[i];
      rr += r[i] * r[i];
    }
    expect(Math.abs(lr) / Math.sqrt(ll * rr)).toBeLessThan(0.3);
  });

  it('makes the cabinet a smaller room than the hall', () => {
    const rate = 44100;
    const [hall] = roomImpulse(HALL, rate, makeRng(4));
    const [cab] = roomImpulse(CAB, rate, makeRng(4));
    const [lite] = roomImpulse(HALL_LITE, rate, makeRng(4));
    expect(cab.length).toBeLessThan(hall.length);
    expect(lite.length).toBeLessThan(hall.length);
    expect(cab.length).toBeLessThanOrEqual(0.4 * rate);
    // By the end of its tail the box has gone quiet: sixty decibels down.
    expect(energy(cab, 0.3, 0.36, rate)).toBeLessThan(energy(cab, 0.02, 0.05, rate) * 1e-3);
  });

  it('peaks at half scale, the same in both channels, and repeats for a seed', () => {
    const rate = 48000;
    const [l, r] = roomImpulse(CAB, rate, makeRng(5));
    const [l2] = roomImpulse(CAB, rate, makeRng(5));
    let max = 0;
    for (const ch of [l, r]) for (let i = 0; i < ch.length; i++) max = Math.max(max, Math.abs(ch[i]));
    expect(max).toBeCloseTo(0.5, 5);
    expect(l2).toEqual(l);
    for (const ch of [l, r]) for (let i = 0; i < ch.length; i++) expect(Number.isFinite(ch[i])).toBe(true);
  });
});

describe('the soundboard', () => {
  it('rings at its modes and not between them', () => {
    const rate = 48000;
    const [l] = boardImpulse(rate, makeRng(6));
    for (const f of [BOARD_MODES[0], BOARD_MODES[5], BOARD_MODES[10]]) {
      const between = f * 1.09;
      expect(magnitude(l, f, rate), `${f} Hz`).toBeGreaterThan(magnitude(l, between, rate) * 2);
    }
  });

  it('is short, and its lows outlast its highs', () => {
    const rate = 44100;
    const [l] = boardImpulse(rate, makeRng(7));
    expect(l.length).toBeLessThanOrEqual(0.6 * rate);
    const late = (f: number) => {
      const from = Math.round(0.3 * rate);
      return magnitude(l.subarray(from), f, rate) / magnitude(l.subarray(0, from), f, rate);
    };
    expect(late(BOARD_MODES[0])).toBeGreaterThan(late(BOARD_MODES[BOARD_MODES.length - 1]));
  });
});
