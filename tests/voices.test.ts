import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../src/audio/engine';
import {
  BED_FAMILIES, BED_VOICES, DEFAULT_BED_VOICE, DEFAULT_LEAD_VOICE,
  LEAD_FAMILIES, LEAD_VOICES, findBedVoice, findLeadVoice,
} from '../src/audio/voices';

const OSC_TYPES = ['sine', 'square', 'sawtooth', 'triangle'];

describe('the instrument bank', () => {
  it('has no repeated id, in either bank', () => {
    const ids = new Set<string>();
    for (const v of [...LEAD_VOICES, ...BED_VOICES]) {
      expect(ids.has(v.id), `duplicate id ${v.id}`).toBe(false);
      ids.add(v.id);
    }
  });

  it('names every voice and files it under a family the picker knows', () => {
    for (const v of LEAD_VOICES) {
      expect(v.name.length, v.id).toBeGreaterThan(0);
      expect(LEAD_FAMILIES.includes(v.family), `${v.id}/${v.family}`).toBe(true);
    }
    for (const v of BED_VOICES) {
      expect(v.name.length, v.id).toBeGreaterThan(0);
      expect(BED_FAMILIES.includes(v.family), `${v.id}/${v.family}`).toBe(true);
    }
  });

  it('lists its voices in family order, so the picker groups without sorting', () => {
    for (const [bank, families] of [
      [LEAD_VOICES, LEAD_FAMILIES], [BED_VOICES, BED_FAMILIES],
    ] as const) {
      // A family that reappears after another has begun would be split into
      // two groups by the picker, which reads as two lists with one name.
      const seen: string[] = [];
      for (const v of bank) {
        if (seen[seen.length - 1] !== v.family) {
          expect(seen.includes(v.family), `${v.family} is interrupted`).toBe(false);
          seen.push(v.family);
        }
      }
      expect(seen).toEqual([...families]);
    }
  });

  it('builds every voice from oscillators a browser actually has', () => {
    for (const v of [...LEAD_VOICES, ...BED_VOICES]) {
      expect(v.spec.layers.length, `${v.id} has no layers`).toBeGreaterThan(0);
      // Four is the cap: the polyphony budget is written around a voice about
      // the size of the signature one, and this is what keeps it there.
      expect(v.spec.layers.length, `${v.id} is too many layers`).toBeLessThanOrEqual(4);
      for (const l of v.spec.layers) {
        expect(OSC_TYPES.includes(l.type), `${v.id}: ${l.type}`).toBe(true);
        expect(l.ratio, `${v.id} ratio`).toBeGreaterThan(0);
        expect(l.level, `${v.id} level`).toBeGreaterThan(0);
        expect(Math.abs(l.detune ?? 0), `${v.id} detune`).toBeLessThanOrEqual(100);
      }
    }
  });

  it('keeps every voice in the same loudness band, so picking one is not a volume knob', () => {
    for (const v of LEAD_VOICES) {
      const sum = v.spec.layers.reduce((n, l) => n + l.level + (l.velLevel ?? 0), 0);
      expect(sum * v.spec.gain, `${v.id} sums to ${sum}`).toBeGreaterThan(0.55);
      expect(sum * v.spec.gain, `${v.id} sums to ${sum}`).toBeLessThan(1.35);
    }
    for (const v of BED_VOICES) {
      const sum = v.spec.layers.reduce((n, l) => n + l.level, 0);
      expect(sum * v.spec.gain, `${v.id} sums to ${sum}`).toBeGreaterThan(1.4);
      expect(sum * v.spec.gain, `${v.id} sums to ${sum}`).toBeLessThan(2.4);
    }
  });

  it('gives every key voice an envelope that can actually be played', () => {
    for (const v of LEAD_VOICES) {
      const { attack, decay, sustain, release } = v.spec.env;
      expect(attack, `${v.id} attack`).toBeGreaterThan(0);
      // `decay` is measured from the strike, not from the top of the attack,
      // so a decay inside the attack would ask the envelope to go backwards.
      expect(decay, `${v.id} decays before it has arrived`).toBeGreaterThan(attack);
      expect(sustain, `${v.id} sustain`).toBeGreaterThan(0);
      expect(sustain, `${v.id} sustain`).toBeLessThanOrEqual(1);
      // Anything shorter than this is a click rather than a release.
      expect(release, `${v.id} release`).toBeGreaterThanOrEqual(0.05);
    }
  });

  it('opens and settles every filter somewhere audible', () => {
    for (const v of LEAD_VOICES) {
      const f = v.spec.filter;
      for (const [name, n] of Object.entries(f)) {
        expect(Number.isFinite(n), `${v.id} ${name}`).toBe(true);
        expect(n, `${v.id} ${name}`).toBeGreaterThan(0);
      }
    }
    for (const v of BED_VOICES) {
      const f = v.spec.filter;
      // A struck chord has to open brighter and sooner than a swell, or a
      // stab is gone before the filter has finished arriving.
      expect(f.startStruck, `${v.id} struck start`).toBeGreaterThan(f.start);
      expect(f.peakStruck, `${v.id} struck peak`).toBeGreaterThan(f.peak);
      expect(f.peak, `${v.id} peak`).toBeGreaterThan(f.start);
      expect(f.q, `${v.id} q`).toBeGreaterThan(0);
    }
  });

  it('falls back rather than throwing on an id it no longer has', () => {
    expect(findLeadVoice('a-voice-we-dropped').id).toBe(DEFAULT_LEAD_VOICE);
    expect(findBedVoice('a-bed-we-dropped').id).toBe(DEFAULT_BED_VOICE);
    // And still finds the ones it does have, including the last one written.
    for (const v of LEAD_VOICES) expect(findLeadVoice(v.id).id).toBe(v.id);
    for (const v of BED_VOICES) expect(findBedVoice(v.id).id).toBe(v.id);
  });
});

describe('the sound the app has always made', () => {
  // These are not style: they are the numbers `noteOn` and `pad` were written
  // with before either had a bank to pick from. The same synth in all three
  // modes is the app's identity, and a picker is no reason to lose it.

  it('is the first thing in each bank, and the default', () => {
    expect(LEAD_VOICES[0].id).toBe(DEFAULT_LEAD_VOICE);
    expect(BED_VOICES[0].id).toBe(DEFAULT_BED_VOICE);
  });

  it('still plays a saw, a square seven and a half cents up, and a sub', () => {
    const spec = findLeadVoice(DEFAULT_LEAD_VOICE).spec;

    expect(spec.layers).toEqual([
      { type: 'sawtooth', ratio: 1, level: 0.5 },
      { type: 'square', ratio: 1, level: 0.18, velLevel: 0.2, detune: 7.5 },
      { type: 'triangle', ratio: 0.5, level: 0.24 },
    ]);
    expect(spec.noise).toBeUndefined();
    // freq * (1.6 + v² * 11), Q 3.2 + 3v, settling at freq * (1.1 + 2.4v).
    expect(spec.filter).toEqual({
      base: 1.6, track: 11, q: 3.2, qVel: 3, settle: 1.1, settleVel: 2.4, settleTime: 0.35,
    });
    expect(spec.env).toEqual({ attack: 0.004, decay: 0.16, sustain: 0.34, release: 0.22 });
    // Peak (0.06 + 0.3v), sends (0.2 + 0.14v) and (0.1 + 0.14v) — the trims
    // that reproduce those exactly once the shared velocity tilt is applied.
    expect(spec.gain).toBe(1);
    expect(spec.reverb).toBe(0.2);
    expect(spec.delay).toBe(0.1);
  });

  it('still beds it on two saws six cents apart', () => {
    const spec = findBedVoice(DEFAULT_BED_VOICE).spec;

    expect(spec.layers).toEqual([
      { type: 'sawtooth', ratio: 1, level: 1, detune: -6 },
      { type: 'sawtooth', ratio: 1, level: 1, detune: 6 },
    ]);
    expect(spec.filter).toEqual({
      start: 420, startStruck: 900, peak: 1100, peakStruck: 1700, end: 500, q: 1.4,
    });
    expect(spec.gain).toBe(1);
  });
});

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe('which instrument the engine is holding', () => {
  beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('starts on the defaults, so a mode that never asks gets the app sound', () => {
    const engine = new AudioEngine();

    expect(engine.leadVoice).toBe(DEFAULT_LEAD_VOICE);
    expect(engine.bedVoice).toBe(DEFAULT_BED_VOICE);
  });

  it('takes a voice and reports back the one it took', () => {
    const engine = new AudioEngine();
    engine.setLeadVoice('electric-piano');
    engine.setBedVoice('strings');

    expect(engine.leadVoice).toBe('electric-piano');
    expect(engine.bedVoice).toBe('strings');
  });

  it('lands on the default rather than throwing on an id it does not have', () => {
    const engine = new AudioEngine();
    engine.setLeadVoice('electric-piano');
    engine.setLeadVoice('a-voice-we-dropped');
    engine.setBedVoice('a-bed-we-dropped');

    expect(engine.leadVoice).toBe(DEFAULT_LEAD_VOICE);
    expect(engine.bedVoice).toBe(DEFAULT_BED_VOICE);
  });

  it('is not written to storage, so one mode cannot lend its sound to another', () => {
    const engine = new AudioEngine();
    engine.setLeadVoice('tubular-bell');
    engine.setBedVoice('analog-brass');

    // Freestyle restores the defaults on the way out; a fresh engine — which
    // is what the next page load is — must not come back holding a bell.
    expect(new AudioEngine().leadVoice).toBe(DEFAULT_LEAD_VOICE);
    expect(new AudioEngine().bedVoice).toBe(DEFAULT_BED_VOICE);
    expect(JSON.stringify(engine.settings)).not.toContain('tubular-bell');
  });
});
