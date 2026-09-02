import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../src/audio/engine';
import {
  BED_FAMILIES, BED_VOICES, DEFAULT_BED_VOICE, DEFAULT_LEAD_VOICE,
  LEAD_FAMILIES, LEAD_VOICES, findBedVoice, findLeadVoice, noises,
} from '../src/audio/voices';
import { SPECTRA } from '../src/audio/spectra';

const LAYER_TYPES = ['sine', 'square', 'sawtooth', 'triangle', 'spectrum'];

/** Oscillators a voice will put in the graph for one note, operators and unison included. */
const sourcesOf = (layers: readonly { level: number; fm?: unknown }[], unison?: { voices: number }) =>
  layers.reduce((n, l) => n + 1 + (l.fm ? 1 : 0), 0) * (unison?.voices ?? 1);

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
        expect(LAYER_TYPES.includes(l.type), `${v.id}: ${l.type}`).toBe(true);
        // A spectrum layer names a table the generator library has; a basic
        // wave names none, so a table nobody plays cannot sit there unheard.
        if (l.type === 'spectrum') {
          expect(SPECTRA.includes(l.spectrum?.gen as never), `${v.id} spectrum ${l.spectrum?.gen}`).toBe(true);
        } else {
          expect(l.spectrum, `${v.id} names a spectrum on a ${l.type}`).toBeUndefined();
        }
        expect(l.ratio, `${v.id} ratio`).toBeGreaterThan(0);
        expect(l.level, `${v.id} level`).toBeGreaterThan(0);
        expect(Math.abs(l.detune ?? 0), `${v.id} detune`).toBeLessThanOrEqual(100);
      }
    }
  });

  it('keeps every voice inside the polyphony budget, unison and all', () => {
    // Forty-eight voices of about this size is what the audio thread is
    // budgeted for. Unison multiplies every layer and an operator is a source
    // of its own, so a three-string piano is legal and a supersaw in unison
    // is not.
    for (const v of LEAD_VOICES) {
      const n = sourcesOf(v.spec.layers, v.spec.unison) + noises(v.spec.noise).length;
      expect(n, `${v.id} is ${n} sources`).toBeLessThanOrEqual(8);
    }
    for (const v of BED_VOICES) {
      const n = sourcesOf(v.spec.layers, v.spec.unison);
      expect(n, `${v.id} is ${n} sources`).toBeLessThanOrEqual(8);
    }
  });

  it('keeps every knob it was given somewhere sensible', () => {
    const within = (id: string, name: string, n: number | undefined, lo: number, hi: number) => {
      if (n === undefined) return;
      expect(n, `${id} ${name}`).toBeGreaterThanOrEqual(lo);
      expect(n, `${id} ${name}`).toBeLessThanOrEqual(hi);
    };
    for (const v of LEAD_VOICES) {
      const s = v.spec;
      within(v.id, 'velDb', s.velDb, 12, 36);
      within(v.id, 'attackVel', s.attackVel, 0, 0.9);
      within(v.id, 'stretch', s.stretch, 0, 4);
      within(v.id, 'humanize', s.humanize, 0, 1);
      within(v.id, 'body', s.body, 0, 1);
      within(v.id, 'damper decay', s.damper?.decay, 0.005, 0.3);
      within(v.id, 'unison cents', s.unison?.cents, 0.5, 20);
      if (s.lfo) {
        within(v.id, 'lfo rate', s.lfo.rate, 0.1, 12);
        within(v.id, 'lfo delay', s.lfo.delay, 0, 2);
        within(v.id, 'lfo rate2', s.lfo.rate2, 0.1, 12);
        // Depth means what the target needs: a fraction, cents, or hertz.
        const top = { tremolo: 1, rotary: 1, vibrato: 50, filter: 3000 }[s.lfo.target];
        within(v.id, `${s.lfo.target} depth`, s.lfo.depth, 0, top);
      }
      for (const [name, n] of Object.entries(s.keyTrack ?? {})) within(v.id, `keyTrack ${name}`, n, -1.5, 1.5);
      for (const l of s.layers) {
        within(v.id, 'velCurve', l.velCurve, 0, 4);
        within(v.id, 'layer attack', l.attack, 0, 2);
        within(v.id, 'layer hold', l.hold, 0, 2);
      }
      for (const n of noises(s.noise)) {
        within(v.id, 'noise pitchTrack', n.pitchTrack, 0.1, 40);
        within(v.id, 'noise attack', n.attack, 0, 0.5);
        within(v.id, 'noise delay', n.delay, 0, 1);
        within(v.id, 'noise velCurve', n.velCurve, 0, 4);
      }
    }
    for (const v of BED_VOICES) within(v.id, 'unison cents', v.spec.unison?.cents, 0.5, 20);
  });

  it('lets organs and synths hold their pitch while everything else drifts', () => {
    for (const v of LEAD_VOICES) {
      const steady = v.family === 'Organ' || v.family === 'Synth';
      expect(v.spec.humanize ?? 1, `${v.id}`).toBe(steady ? 0 : 1);
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

  it('makes everything in the plucked family actually pluck', () => {
    // The bed's length belongs to whoever scheduled the chord, so a voice that
    // does not say it strikes gets the swell-and-fade every pad gets. Naming a
    // family Plucked and leaving that in place is how the first pass shipped a
    // nylon guitar that faded in over a third of the bar.
    for (const v of BED_VOICES) {
      const plucks = v.spec.pluck !== undefined;
      expect(plucks, `${v.id} is ${v.family} but does not pluck`).toBe(v.family === 'Plucked');
      if (plucks) {
        expect(v.spec.pluck, `${v.id} pluck`).toBeGreaterThan(0.2);
        expect(v.spec.pluck, `${v.id} rings longer than a bar`).toBeLessThanOrEqual(4);
      }
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

describe('the default sound', () => {
  // The same sound in all three modes is the app's identity, and a picker is
  // no reason to lose it. The default is the piano, and it is pinned by its
  // character rather than its numbers, because the numbers are tuned by ear.

  it('is the first thing in each bank', () => {
    expect(LEAD_VOICES[0].id).toBe(DEFAULT_LEAD_VOICE);
    expect(DEFAULT_LEAD_VOICE).toBe('grand');
    expect(BED_VOICES[0].id).toBe(DEFAULT_BED_VOICE);
    expect(DEFAULT_BED_VOICE).toBe('warm');
  });

  it('is a piano: strings in unison, a hammer, a damper and a board', () => {
    const s = findLeadVoice('grand').spec;
    expect(s.layers[0].type).toBe('spectrum');
    expect(s.layers[0].spectrum?.gen).toBe('piano');
    expect(s.unison?.voices).toBe(3);
    expect(s.keyTrack?.decay ?? 0).toBeLessThan(0);
    expect(s.velDb ?? 0).toBeGreaterThanOrEqual(24);
    expect(s.stretch ?? 0).toBeGreaterThan(0);
    expect(s.body ?? 0).toBeGreaterThan(0);
    expect(noises(s.noise).some((n) => (n.pitchTrack ?? 0) > 0)).toBe(true);
    expect(s.damper).toBeDefined();
  });
});

describe('the classic sound', () => {
  // These are not style: they are the numbers `noteOn` and `pad` were written
  // with before either had a bank to pick from. The synth the app grew up with
  // is kept exactly, under its own name, whatever the default has become.

  it('is still in the bank, right behind the default', () => {
    const v = findLeadVoice('signature');
    expect(v.id).toBe('signature');
    expect(v.name).toBe('PianoBall Classic');
    expect(LEAD_VOICES[1].id).toBe('signature');
  });

  it('still plays a saw, a square seven and a half cents up, and a sub', () => {
    const spec = findLeadVoice('signature').spec;

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
    // A pad, not a pluck: it swells and fades with the attack it is handed.
    expect(spec.pluck).toBeUndefined();
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
