import { describe, expect, it } from 'vitest';
import { DRUM_SPECS, METAL_RATIOS, type DrumVoice } from '../src/audio/drums';
import { PATTERNS } from '../src/audio/patterns';

describe('the drum bank', () => {
  it('still has a voice for every lane in the library, and a crash for the table', () => {
    for (const p of PATTERNS) {
      for (const voice of Object.keys(p.lanes)) expect(DRUM_SPECS[voice as DrumVoice], `${p.id}/${voice}`).toBeDefined();
    }
    expect(DRUM_SPECS.crash).toBeDefined();
    expect(DRUM_SPECS.crash.metal).toBeDefined();
  });

  it('builds its cymbals from metal, and keeps every cymbal ringing under two seconds', () => {
    for (const voice of ['hat', 'openhat', 'ride', 'crash'] as const) {
      const m = DRUM_SPECS[voice].metal;
      expect(m, voice).toBeDefined();
      expect(m!.ratios.length, voice).toBeGreaterThanOrEqual(4);
      expect(m!.ratios.length, voice).toBeLessThanOrEqual(6);
      for (let i = 1; i < m!.ratios.length; i++) expect(m!.ratios[i], voice).toBeGreaterThan(m!.ratios[i - 1]);
      expect(m!.bp, voice).toBeGreaterThan(m!.hp);
      expect(m!.decay, voice).toBeLessThanOrEqual(2);
      expect(m!.gain, voice).toBeGreaterThan(0);
    }
    expect(METAL_RATIOS).toHaveLength(6);
    expect(METAL_RATIOS[0]).toBe(1);
  });

  it('keeps the touch-sensitivity of every voice within reason', () => {
    for (const [name, spec] of Object.entries(DRUM_SPECS)) {
      if (spec.velBright !== undefined) {
        expect(spec.velBright, name).toBeGreaterThanOrEqual(0);
        expect(spec.velBright, name).toBeLessThanOrEqual(1.5);
      }
      if (spec.velDecay !== undefined) {
        expect(spec.velDecay, name).toBeGreaterThanOrEqual(0);
        expect(spec.velDecay, name).toBeLessThanOrEqual(0.6);
      }
      if (spec.click) {
        expect(spec.click.decay, name).toBeLessThanOrEqual(0.02);
        expect(spec.click.gain, name).toBeGreaterThan(0);
      }
      if (spec.wires) {
        expect(spec.wires.decay, name).toBeLessThanOrEqual(0.5);
        expect(spec.wires.freq, name).toBeGreaterThan(spec.wires.hp);
      }
    }
  });

  it('gives the kick a beater, the snare its wires, and the toms a skin', () => {
    expect(DRUM_SPECS.kick.click).toBeDefined();
    expect(DRUM_SPECS.snare.wires).toBeDefined();
    expect(DRUM_SPECS.tomLo.tone.length).toBeGreaterThanOrEqual(3);
    expect(DRUM_SPECS.tomHi.tone.length).toBeGreaterThanOrEqual(3);
    // The head's modes at 1.53 and 2.16 times the fundamental.
    for (const tom of [DRUM_SPECS.tomLo, DRUM_SPECS.tomHi]) {
      const f = tom.tone[0][0];
      expect(tom.tone[1][0] / f).toBeCloseTo(1.53, 1);
      expect(tom.tone[2][0] / f).toBeCloseTo(2.16, 1);
    }
  });
});
