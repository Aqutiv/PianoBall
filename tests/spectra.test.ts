import { describe, expect, it } from 'vitest';
import {
  REGISTERS, SPECTRA, registerOf, spectrum, spectrumKey, type SpectrumRef,
} from '../src/audio/spectra';

const RATES = [48000, 44100];

describe('the spectra', () => {
  it('files every note into one of four registers, in order', () => {
    expect(registerOf(21)).toBe(0);
    expect(registerOf(47)).toBe(0);
    expect(registerOf(48)).toBe(1);
    expect(registerOf(71)).toBe(1);
    expect(registerOf(72)).toBe(2);
    expect(registerOf(83)).toBe(2);
    expect(registerOf(84)).toBe(3);
    expect(registerOf(108)).toBe(3);
  });

  it('gives every generator a fundamental, no DC, and a peak of one', () => {
    for (const gen of SPECTRA) {
      for (const r of REGISTERS) {
        for (const rate of RATES) {
          const { real, imag } = spectrum({ gen }, r, rate);
          expect(real.length, `${gen}/${r}`).toBe(imag.length);
          expect(real[0]).toBe(0);
          expect(imag[0]).toBe(0);
          expect(imag[1], `${gen}/${r} has no fundamental`).toBeGreaterThan(0);
          let peak = 0;
          for (const a of imag) {
            expect(Number.isFinite(a)).toBe(true);
            expect(a).toBeGreaterThanOrEqual(0);
            peak = Math.max(peak, a);
          }
          expect(peak, `${gen}/${r}`).toBeCloseTo(1, 6);
        }
      }
    }
  });

  it('writes fewer partials the higher the register, and none past Nyquist', () => {
    for (const rate of RATES) {
      let last = Infinity;
      for (const r of REGISTERS) {
        const partials = spectrum({ gen: 'piano' }, r, rate).imag.length - 1;
        expect(partials, `register ${r}`).toBeLessThanOrEqual(last);
        last = partials;
      }
      expect(spectrum({ gen: 'piano' }, 3, rate).imag.length - 1).toBeLessThanOrEqual(8);
      // C8 is the top of the top register; its partials have to fit under half the rate.
      const top = 4186.01;
      expect(spectrum({ gen: 'saw' }, 3, rate).imag.length - 1).toBeLessThanOrEqual(Math.floor(rate / 2 / top) - 1);
    }
  });

  it('makes a saw of one over k', () => {
    const { imag } = spectrum({ gen: 'saw', params: [1] }, 0, 48000);
    expect(imag.length).toBeGreaterThan(40);
    for (let k = 1; k < imag.length; k++) expect(imag[k]).toBeCloseTo(1 / k, 6);
  });

  it('puts a vowel where its formant is', () => {
    // An 'ah' has its first formant near 800 Hz. In the middle register the
    // third partial of the centre note (C4, 261.6 Hz) sits at 785 Hz.
    const { imag } = spectrum({ gen: 'formant' }, 1, 48000);
    let best = 1;
    for (let k = 1; k < imag.length; k++) if (imag[k] > imag[best]) best = k;
    expect(best).toBe(3);
  });

  it('lands the drawbars on the right harmonics, three decibels a step', () => {
    const sub = spectrum({ gen: 'drawbar', params: [8, 0, 0, 0, 0, 0, 0, 0, 0] }, 1, 48000).imag;
    expect(sub[1]).toBeCloseTo(1, 6);
    for (let k = 2; k < sub.length; k++) expect(sub[k]).toBe(0);

    const flute = spectrum({ gen: 'drawbar', params: [0, 0, 8, 0, 0, 0, 0, 0, 0] }, 1, 48000).imag;
    expect(flute[2]).toBeCloseTo(1, 6);
    expect(flute[1]).toBe(0);

    const full = spectrum({ gen: 'drawbar', params: [8, 8, 8, 8, 8, 8, 8, 8, 8] }, 0, 48000).imag;
    for (const h of [1, 2, 3, 4, 6, 8, 10, 12, 16]) expect(full[h], `harmonic ${h}`).toBeCloseTo(1, 6);
    expect(full[5]).toBe(0);

    const half = spectrum({ gen: 'drawbar', params: [8, 0, 4, 0, 0, 0, 0, 0, 0] }, 0, 48000).imag;
    expect(20 * Math.log10(half[2] / half[1])).toBeCloseTo(-12, 6);
  });

  it('keys its cache by generator, parameters and register', () => {
    const a: SpectrumRef = { gen: 'pulse', params: [0.3] };
    expect(spectrumKey(a, 1)).toBe(spectrumKey({ gen: 'pulse', params: [0.3] }, 1));
    expect(spectrumKey(a, 1)).not.toBe(spectrumKey(a, 2));
    expect(spectrumKey(a, 1)).not.toBe(spectrumKey({ gen: 'pulse', params: [0.5] }, 1));
    expect(spectrumKey({ gen: 'saw' }, 0)).not.toBe(spectrumKey({ gen: 'pulse' }, 0));
  });
});
