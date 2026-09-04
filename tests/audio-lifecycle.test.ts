import { describe, expect, it, vi } from 'vitest';
import { cancelFrom, holdAtTime } from '../src/audio/automation';
import { AudioEngine } from '../src/audio/engine';
import { findBedVoice } from '../src/audio/voices';
import { HALL, HALL_LITE } from '../src/audio/rooms';

interface FakeParam {
  value: number;
  cancelAndHoldAtTime: ReturnType<typeof vi.fn>;
  cancelScheduledValues: ReturnType<typeof vi.fn>;
  exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  setValueAtTime: ReturnType<typeof vi.fn>;
  setTargetAtTime: ReturnType<typeof vi.fn>;
}

interface FakeNode {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

interface FakeGainNode extends FakeNode {
  gain: FakeParam;
}

interface FakeFilterNode extends FakeNode {
  type: string;
  frequency: FakeParam;
  Q: { value: number };
}

interface FakeSource {
  detune: FakeParam;
  stop: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  emitEnded(): void;
}

interface FakeVoice {
  note: number;
  startedAt: number;
  sources: FakeSource[];
  filter: { frequency: FakeParam };
  amp: { gain: FakeParam };
  panner: object;
  freq: number;
  k: object;
  release: number;
  damper?: object;
  taps: { lfo: FakeNode; gain: FakeNode }[];
  releasing: boolean;
  stopAt: number | null;
  remainingSources: number;
  retired: boolean;
}

interface EngineInternals {
  active: FakeVoice[];
  voices: Map<number, FakeVoice>;
  sustained: Set<number>;
  pedal: number;
  fading: { voice: FakeVoice; at: number }[];
  bendSource: { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };
  lfoVibrato: { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };
  lfoColour: { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };
  release(voice: FakeVoice, seconds: number, damp?: boolean, reprieve?: number): void;
  trackVoice(voice: FakeVoice): void;
  pruneVoices(t: number): void;
  retrigger(note: number, t: number): void;
  recatch(t: number): void;
  cull(): void;
  prepareNoise(
    into: object, noise: object, freq: number, velocity: number, key: object,
    strength?: number,
  ): (at: number) => void;
}

interface GraphInternals {
  leadOut: Record<'dry' | 'hall' | 'cab' | 'delay' | 'body', FakeNode>;
  padDuck: FakeGainNode;
  padGen: FakeNode;
  lfoColour: FakeNode;
  addLayer: ReturnType<typeof vi.fn>;
}

function param(value = 0.25): FakeParam {
  return {
    value,
    cancelAndHoldAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
  } as FakeParam;
}

function connectable<T extends object>(value: T): T & FakeNode {
  return Object.assign(value, { connect: vi.fn((to: unknown) => to), disconnect: vi.fn() });
}

function source(): FakeSource {
  let ended: (() => void) | null = null;
  return {
    detune: param(),
    stop: vi.fn(),
    addEventListener: vi.fn((type: string, listener: () => void) => {
      if (type === 'ended') ended = listener;
    }),
    emitEnded() {
      const listener = ended;
      ended = null;
      listener?.();
    },
  };
}

function graphHarness(now = 1, voices: { lead?: string; bed?: string } = {}) {
  const engine = new AudioEngine();
  if (voices.lead) engine.setLeadVoice(voices.lead);
  if (voices.bed) engine.setBedVoice(voices.bed);

  const gains: FakeGainNode[] = [];
  const filters: FakeFilterNode[] = [];
  const ctx = {
    currentTime: now,
    sampleRate: 48000,
    state: 'running',
    createBiquadFilter: vi.fn(() => {
      const filter = connectable({ type: 'lowpass', frequency: param(), Q: { value: 0 } });
      filters.push(filter);
      return filter;
    }),
    createGain: vi.fn(() => {
      const gain = connectable({ gain: param(1) });
      gains.push(gain);
      return gain;
    }),
    createStereoPanner: vi.fn(() => connectable({ pan: { value: 0 } })),
  };
  engine.ctx = ctx as unknown as AudioContext;
  engine.ready = true;

  const state = engine as unknown as EngineInternals & GraphInternals;
  state.leadOut = {
    dry: connectable({}), hall: connectable({}), cab: connectable({}),
    delay: connectable({}), body: connectable({}),
  };
  state.padDuck = connectable({ gain: param(1) });
  state.padGen = connectable({});
  state.lfoColour = connectable({});
  return { engine, state, gains, filters, ctx };
}

function voice(note: number, startedAt = 0, releasing = false, stopAt: number | null = null): FakeVoice {
  const sources = [source()];
  return {
    note,
    startedAt,
    sources,
    filter: { frequency: param() },
    amp: { gain: param() },
    panner: {},
    freq: 440,
    k: {},
    release: 0.3,
    taps: [],
    releasing,
    stopAt,
    remainingSources: sources.length,
    retired: false,
  };
}

function connector() {
  return { connect: vi.fn(), disconnect: vi.fn() };
}

function harness(now = 1) {
  const clock = { currentTime: now, sampleRate: 48000, state: 'running' };
  const engine = new AudioEngine();
  engine.ctx = clock as unknown as AudioContext;
  engine.ready = true;
  const state = engine as unknown as EngineInternals;
  state.bendSource = connector();
  state.lfoVibrato = connector();
  state.lfoColour = connector();
  return { clock, engine, state };
}

describe('holding gain automation', () => {
  it('cancels natively but still pins the value itself', () => {
    const gain = param(0.23);

    holdAtTime(gain as unknown as AudioParam, 4);

    expect(gain.cancelAndHoldAtTime).toHaveBeenCalledWith(4);
    expect(gain.cancelScheduledValues).not.toHaveBeenCalled();
    // The native hold writes a value back only where it truncates an event that
    // is still running. On a note whose attack and decay are over it holds
    // nothing, and the release ramp then anchors on the end of the decay.
    expect(gain.setValueAtTime).toHaveBeenCalledWith(0.23, 4);
  });

  it('leaves a future hold to the native operation, which knows the value there', () => {
    const gain = param(0.23);

    cancelFrom(gain as unknown as AudioParam, 4);

    expect(gain.cancelAndHoldAtTime).toHaveBeenCalledWith(4);
    // A `setTargetAtTime` anchors itself wherever it starts, so it needs no pin
    // — and pinning would write the level as it stands now at a time still to
    // come, which is not the same number.
    expect(gain.setValueAtTime).not.toHaveBeenCalled();
    expect(gain.cancelScheduledValues).not.toHaveBeenCalled();
  });

  it('captures the current value before the compatibility cancellation', () => {
    const calls: string[] = [];
    let current = 0.23;
    const gain = {
      get value() { calls.push('read'); return current; },
      set value(value: number) { current = value; },
      cancelAndHoldAtTime: undefined,
      cancelScheduledValues: (at: number) => { calls.push(`cancel:${at}`); current = 1; },
      setValueAtTime: (value: number, at: number) => { calls.push(`set:${value}:${at}`); },
    } as unknown as AudioParam;

    holdAtTime(gain, 4);

    expect(calls).toEqual(['read', 'cancel:4', 'set:0.23:4']);
  });
});

describe('short noise envelopes', () => {
  it('stays muted while building and schedules an immediate burst in the future', () => {
    let now = 1;
    const source = connectable({ buffer: null as object | null, start: vi.fn() });
    const filter = connectable({ type: 'lowpass', frequency: param(), Q: { value: 0 } });
    const gain = connectable({ gain: param(1) });
    const ctx = {
      get currentTime() { return now; },
      sampleRate: 48000,
      createBufferSource: vi.fn(() => { now += 0.003; return source; }),
      createBiquadFilter: vi.fn(() => { now += 0.003; return filter; }),
      createGain: vi.fn(() => { now += 0.003; return gain; }),
    };
    const engine = new AudioEngine();
    engine.ctx = ctx as unknown as AudioContext;
    const state = engine as unknown as EngineInternals & { noise: object };
    state.noise = {};

    const startBurst = state.prepareNoise(
      connectable({}), { freq: 2400, q: 2, decay: 0.006, gain: 0.05 },
      440, 1, { noise: 1 }, 0.12,
    );

    const start = now + 256 / 48000;
    expect(gain.gain.value).toBe(0.0001);
    expect(source.start).not.toHaveBeenCalled();
    startBurst(start);
    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0.0001, start);
    expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenNthCalledWith(1, 0.006, start + 0.002);
    expect(source.start).toHaveBeenCalledWith(start, expect.any(Number), 0.028);
  });
});

describe('voice attack envelopes', () => {
  it('starts a key chain silent before any voice layer can start', () => {
    const { engine, state, gains } = graphHarness(1, { lead: 'sub-bass' });
    const gainAtSourceStart: number[] = [];
    state.addLayer = vi.fn(() => {
      gainAtSourceStart.push(gains[0]!.gain.value);
      return [];
    });

    engine.noteOn(60, 0.5);

    expect(gainAtSourceStart.length).toBeGreaterThan(0);
    expect(gainAtSourceStart.every((value) => value === 0.0001)).toBe(true);
  });

  it('anchors the audible attack after a slow voice graph has been built', () => {
    const { engine, state, gains, ctx } = graphHarness(1, { lead: 'sub-bass' });
    state.addLayer = vi.fn(() => {
      ctx.currentTime = 1.008;
      return [];
    });

    engine.noteOn(60, 0.5);

    const gain = gains[0]!.gain;
    expect(gain.setValueAtTime).toHaveBeenCalledWith(0.0001, 1.008);
    expect(gain.exponentialRampToValueAtTime.mock.calls[0]![1]).toBeGreaterThan(1.008);
    expect(state.active[0]!.startedAt).toBe(1.008);
  });

  it('starts prepared key noise and its voice envelope at one guarded onset', () => {
    const { engine, state, gains, ctx } = graphHarness(1, { lead: 'grand' });
    const startBurst = vi.fn();
    state.addLayer = vi.fn(() => []);
    state.prepareNoise = vi.fn(() => {
      ctx.currentTime = 1.008;
      return startBurst;
    });

    engine.noteOn(60, 0.5);

    const onset = 1.008 + 256 / 48000;
    expect(gains[0]!.gain.setValueAtTime).toHaveBeenCalledWith(0.0001, onset);
    expect(startBurst).toHaveBeenCalledWith(onset);
    expect(state.active[0]!.startedAt).toBe(onset);
  });

  it('keeps a slow plucked pad on its finite pluck envelope', () => {
    const spec = findBedVoice('nylon-guitar').spec;
    const { engine, state, gains, filters } = graphHarness(1, { bed: 'nylon-guitar' });
    state.addLayer = vi.fn(() => [{ stop: vi.fn() }]);

    engine.pad([60], 5, 0.1, 5, 1.75);

    const gain = gains[0]!.gain;
    expect(gain.setValueAtTime).toHaveBeenCalledWith(0.0001, 5);
    expect(gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    expect(gain.exponentialRampToValueAtTime).toHaveBeenNthCalledWith(1, 0.1 * spec.gain, 5.006);
    expect(gain.exponentialRampToValueAtTime).toHaveBeenNthCalledWith(2, 0.0001, 5 + spec.pluck!);

    const frequency = filters[0]!.frequency;
    expect(frequency.setValueAtTime).toHaveBeenCalledWith(spec.filter.startStruck, 5);
    expect(frequency.linearRampToValueAtTime).toHaveBeenNthCalledWith(1, spec.filter.peakStruck, 5.02);
    expect(frequency.linearRampToValueAtTime).toHaveBeenNthCalledWith(2, spec.filter.end, 5 + spec.pluck!);
  });

  it('keeps short plucked comp events struck', () => {
    const spec = findBedVoice('nylon-guitar').spec;
    const { engine, state, gains, filters } = graphHarness(1, { bed: 'nylon-guitar' });
    state.addLayer = vi.fn(() => [{ stop: vi.fn() }]);

    engine.pad([60], 2, 0.1, 5, 0.01);

    const gain = gains[0]!.gain;
    expect(gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    expect(gain.exponentialRampToValueAtTime).toHaveBeenNthCalledWith(1, 0.1 * spec.gain, 5.006);
    expect(gain.exponentialRampToValueAtTime).toHaveBeenNthCalledWith(2, 0.0001, 6.7);

    const frequency = filters[0]!.frequency;
    expect(frequency.setValueAtTime).toHaveBeenCalledWith(spec.filter.startStruck, 5);
    expect(frequency.linearRampToValueAtTime).toHaveBeenNthCalledWith(1, spec.filter.peakStruck, 5.02);
  });
});

describe('key voice release tracking', () => {
  it('keeps a release live until its source stop time, then prunes it', () => {
    const { clock, state } = harness();
    const held = voice(60);
    state.active.push(held);
    state.voices.set(60, held);
    state.trackVoice(held);

    state.release(held, 0.3, false);

    expect(state.active).toEqual([held]);
    expect(held.stopAt).toBeCloseTo(1.32);
    expect(held.amp.gain.cancelAndHoldAtTime).toHaveBeenCalledWith(1);
    expect(held.sources[0].stop).toHaveBeenCalledWith(held.stopAt);
    // Modulation remains part of the audible release instead of snapping back
    // to neutral while the voice is still loud.
    expect(state.bendSource.disconnect).not.toHaveBeenCalled();
    expect(state.lfoVibrato.disconnect).not.toHaveBeenCalled();
    expect(state.lfoColour.disconnect).not.toHaveBeenCalled();

    clock.currentTime = 1.321;
    state.pruneVoices(clock.currentTime);
    expect(state.active).toEqual([]);
    expect(state.voices.has(60)).toBe(false);
    expect(state.bendSource.disconnect).toHaveBeenCalledWith(held.sources[0].detune);
    expect(state.lfoVibrato.disconnect).toHaveBeenCalledWith(held.sources[0].detune);
    expect(state.lfoColour.disconnect).toHaveBeenCalledWith(held.filter.frequency);

    state.pruneVoices(clock.currentTime);
    expect(state.bendSource.disconnect).toHaveBeenCalledOnce();
    expect(state.lfoVibrato.disconnect).toHaveBeenCalledOnce();
    expect(state.lfoColour.disconnect).toHaveBeenCalledOnce();

    // A queued source event may arrive after clock pruning won the race.
    held.sources[0].emitEnded();
    expect(state.bendSource.disconnect).toHaveBeenCalledOnce();
    expect(state.lfoVibrato.disconnect).toHaveBeenCalledOnce();
    expect(state.lfoColour.disconnect).toHaveBeenCalledOnce();
  });

  it('anchors the release on the level the note is at, not on the last envelope event', () => {
    const { state } = harness();
    const held = voice(60);
    held.amp.gain.value = 0.42;
    state.active.push(held);
    state.voices.set(60, held);

    state.release(held, 0.3, false);

    // A held note has no automation left: its attack and decay are long over.
    // Unpinned, the release ramp anchors on the end of the decay instead, so it
    // starts already spent and cuts the note off inside a sample rather than
    // letting it go — and the longer the key was held the worse it gets.
    const gain = held.amp.gain;
    expect(gain.setValueAtTime).toHaveBeenCalledWith(0.42, 1);
    expect(gain.setValueAtTime.mock.invocationCallOrder[0])
      .toBeLessThan(gain.exponentialRampToValueAtTime.mock.invocationCallOrder[0]);
  });

  it('retires an idle release only after every source has ended', () => {
    const { state } = harness();
    const held = voice(60);
    held.sources = [source(), source()];
    held.remainingSources = held.sources.length;
    const lfo = connector();
    const gain = connector();
    held.taps = [{ lfo, gain }];
    state.active.push(held);
    state.voices.set(60, held);
    state.sustained.add(60);
    state.fading.push({ voice: held, at: 1 });
    state.trackVoice(held);

    state.release(held, 0.08, false);
    held.sources[0].emitEnded();

    expect(state.active).toEqual([held]);
    expect(state.voices.get(60)).toBe(held);
    expect(lfo.disconnect).not.toHaveBeenCalled();

    held.sources[1].emitEnded();

    expect(state.active).toEqual([]);
    expect(state.voices.has(60)).toBe(false);
    expect(state.sustained.has(60)).toBe(false);
    expect(state.fading).toEqual([]);
    expect(state.bendSource.disconnect).toHaveBeenCalledTimes(2);
    expect(state.lfoVibrato.disconnect).toHaveBeenCalledTimes(2);
    expect(state.lfoColour.disconnect).toHaveBeenCalledOnce();
    expect(lfo.disconnect).toHaveBeenCalledWith(gain);
    expect(gain.disconnect).toHaveBeenCalledOnce();
  });

  it('preserves a naturally ended finite voice until its key is released', async () => {
    const { state } = harness();
    const held = voice(60);
    state.active.push(held);
    state.voices.set(60, held);
    state.trackVoice(held);

    held.sources[0].emitEnded();

    expect(held.remainingSources).toBe(0);
    expect(state.active).toEqual([held]);
    expect(state.voices.get(60)).toBe(held);
    expect(state.bendSource.disconnect).not.toHaveBeenCalled();

    state.release(held, 0.08, false);
    // Mirrors the recatch bookkeeping performed by note-off/pedal-up in the
    // same call stack. The queued cleanup must remove this stale entry too.
    state.fading.push({ voice: held, at: 1 });
    await Promise.resolve();

    expect(state.active).toEqual([]);
    expect(state.voices.has(60)).toBe(false);
    expect(state.fading).toEqual([]);
    expect(state.bendSource.disconnect).toHaveBeenCalledOnce();
  });

  it('does not retain a silent finite voice when its key lifts under sustain', async () => {
    const { engine, state } = harness();
    const held = voice(60);
    state.active.push(held);
    state.voices.set(60, held);
    state.trackVoice(held);
    held.sources[0].emitEnded();
    state.pedal = 1;

    engine.noteOff(60);
    await Promise.resolve();

    expect(state.active).toEqual([]);
    expect(state.voices.has(60)).toBe(false);
    expect(state.sustained.has(60)).toBe(false);
    expect(state.bendSource.disconnect).toHaveBeenCalledOnce();
  });

  it('retires a finite voice that ends after its key lifts under sustain', () => {
    const { engine, state } = harness();
    const held = voice(60);
    state.active.push(held);
    state.voices.set(60, held);
    state.trackVoice(held);
    state.pedal = 1;

    engine.noteOff(60);
    expect(state.active).toEqual([held]);
    expect(state.voices.get(60)).toBe(held);
    expect(state.sustained.has(60)).toBe(true);

    held.sources[0].emitEnded();

    expect(state.active).toEqual([]);
    expect(state.voices.has(60)).toBe(false);
    expect(state.sustained.has(60)).toBe(false);
    expect(state.bendSource.disconnect).toHaveBeenCalledOnce();
  });

  it('does not let an ended tail retire a newer strike of the same pitch', () => {
    const { state } = harness();
    const oldTail = voice(60);
    const newStrike = voice(60, 1.01);
    state.active.push(oldTail, newStrike);
    state.voices.set(60, newStrike);
    state.sustained.add(60);
    state.trackVoice(oldTail);

    state.release(oldTail, 0.02, false);
    oldTail.sources[0].emitEnded();

    expect(state.active).toEqual([newStrike]);
    expect(state.voices.get(60)).toBe(newStrike);
    expect(state.sustained.has(60)).toBe(true);
  });

  it('disconnects voice-owned motion only after its release is silent', () => {
    const { clock, state } = harness();
    const held = voice(60);
    const lfo = connector();
    const gain = connector();
    held.taps = [{ lfo, gain }];
    state.active.push(held);
    state.voices.set(60, held);

    state.release(held, 0.08, false);

    expect(lfo.disconnect).not.toHaveBeenCalled();
    expect(gain.disconnect).not.toHaveBeenCalled();

    clock.currentTime = held.stopAt! + 0.001;
    state.pruneVoices(clock.currentTime);

    expect(lfo.disconnect).toHaveBeenCalledOnce();
    expect(lfo.disconnect).toHaveBeenCalledWith(gain);
    expect(gain.disconnect).toHaveBeenCalledOnce();
  });

  it('crossfades every same-note tail while leaving other pitches ringing', () => {
    const { state } = harness();
    const oldTail = voice(60, 0, true, 3);
    const held = voice(60, 0.5);
    const resonance = voice(64, 0.25, true, 3);
    state.active.push(oldTail, resonance, held);
    state.voices.set(60, held);
    state.sustained.add(60);
    state.fading.push({ voice: oldTail, at: 0.9 });

    state.retrigger(60, 1);

    expect(oldTail.stopAt).toBeCloseTo(1.04);
    expect(held.stopAt).toBeCloseTo(1.04);
    expect(oldTail.sources[0].stop).toHaveBeenCalledWith(oldTail.stopAt);
    expect(held.sources[0].stop).toHaveBeenCalledWith(held.stopAt);
    expect(resonance.stopAt).toBe(3);
    expect(resonance.sources[0].stop).not.toHaveBeenCalled();
    expect(state.voices.has(60)).toBe(false);
    expect(state.sustained.has(60)).toBe(false);
    expect(state.fading).toEqual([]);
  });

  it('never redraws a repeated release beyond an earlier source stop', () => {
    const { state } = harness();
    const fading = voice(60, 0, true, 1.015);

    state.release(fading, 0.05, false);

    expect(fading.amp.gain.cancelAndHoldAtTime).not.toHaveBeenCalled();
    expect(fading.amp.gain.exponentialRampToValueAtTime).not.toHaveBeenCalled();
    expect(fading.sources[0].stop).not.toHaveBeenCalled();

    const recaught = voice(62, 0, false, 1.03);
    state.release(recaught, 0.3, false);
    expect(recaught.amp.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 1.01);
    expect(recaught.sources[0].stop).toHaveBeenCalledWith(1.03);
  });

  it('scales a key-off contact by the voice level still sounding', () => {
    const { state } = harness();
    const held = voice(60);
    held.amp.gain.value = 0.12;
    held.damper = { freq: 2400, q: 2, decay: 0.006, gain: 0.05 };
    const start = vi.fn();
    state.prepareNoise = vi.fn(() => start);

    state.release(held, 0.08, true);

    expect(state.prepareNoise).toHaveBeenCalledWith(
      held.panner, held.damper, held.freq, 1, held.k, 0.12,
    );
    expect(start).toHaveBeenCalledWith(1 + 256 / 48000);
  });

  it('keeps rapid repeated note-on/off sequences bounded by the crossfade', () => {
    const { clock, engine, state } = harness();

    for (let strike = 0; strike < 100; strike++) {
      state.retrigger(60, clock.currentTime);
      const next = voice(60, clock.currentTime);
      state.active.push(next);
      state.voices.set(60, next);
      engine.noteOff(60);
      clock.currentTime += 0.01;
    }
    state.pruneVoices(clock.currentTime);

    expect(state.active.length).toBeLessThanOrEqual(4);
    expect(state.active.every((item) => item.releasing)).toBe(true);
    expect(state.voices.has(60)).toBe(false);
  });

  it('counts release tails when culling and when turning every note off', () => {
    const { clock, engine, state } = harness();
    for (let note = 0; note < 50; note++) {
      const held = voice(note, note / 100);
      state.active.push(held);
      state.voices.set(note, held);
    }

    state.cull();

    expect(state.active).toHaveLength(50);
    expect(state.active.filter((item) => item.stopAt === null)).toHaveLength(48);
    const stolen = state.active.filter((item) => item.stopAt !== null);
    expect(stolen).toHaveLength(2);

    engine.allNotesOff();
    expect(state.voices.size).toBe(0);
    expect(state.active.every((item) => item.stopAt === 1.04)).toBe(true);
    expect(stolen.every((item) => item.sources[0].stop.mock.calls.length >= 2)).toBe(true);

    clock.currentTime = 1.041;
    state.pruneVoices(clock.currentTime);
    expect(state.active).toEqual([]);
  });

  it('automatically retires every all-notes-off tail while the engine is idle', () => {
    const { engine, state } = harness();
    const first = voice(60);
    const second = voice(64);
    state.active.push(first, second);
    state.voices.set(60, first);
    state.voices.set(64, second);
    state.trackVoice(first);
    state.trackVoice(second);

    engine.allNotesOff();
    first.sources[0].emitEnded();
    expect(state.active).toEqual([second]);

    second.sources[0].emitEnded();
    expect(state.active).toEqual([]);
    expect(state.voices.size).toBe(0);
  });

  it('recatches without duplicating a voice and never revives a superseded tail', () => {
    const { state } = harness();
    const caught = voice(60, 0, true, 3);
    const motion = { lfo: connector(), gain: connector() };
    caught.taps = [motion];
    state.active.push(caught);
    state.fading.push({ voice: caught, at: 0.9 });

    state.recatch(1);

    expect(state.active).toEqual([caught]);
    expect(state.voices.get(60)).toBe(caught);
    expect(state.sustained.has(60)).toBe(true);
    expect(caught.releasing).toBe(false);
    expect(state.bendSource.connect).not.toHaveBeenCalled();
    expect(state.lfoVibrato.connect).not.toHaveBeenCalled();
    expect(state.lfoColour.connect).not.toHaveBeenCalled();
    expect(caught.taps).toEqual([motion]);
    expect(caught.amp.gain.setValueAtTime).toHaveBeenCalledWith(0.25, 2.96);
    expect(caught.amp.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 2.98);

    state.fading.push({ voice: caught, at: 1 });
    state.retrigger(60, 1);
    state.recatch(1.01);

    expect(state.active).toEqual([caught]);
    expect(state.voices.has(60)).toBe(false);
    expect(state.sustained.has(60)).toBe(false);
    expect(state.fading).toEqual([]);
  });

  it('retires a recaught voice when its already-scheduled sources end', () => {
    const { state } = harness();
    const caught = voice(60, 0, true, 3);
    state.active.push(caught);
    state.fading.push({ voice: caught, at: 0.9 });
    state.trackVoice(caught);

    state.recatch(1);
    expect(caught.releasing).toBe(false);
    expect(state.voices.get(60)).toBe(caught);
    expect(state.sustained.has(60)).toBe(true);

    caught.sources[0].emitEnded();

    expect(state.active).toEqual([]);
    expect(state.voices.has(60)).toBe(false);
    expect(state.sustained.has(60)).toBe(false);
  });
});

/**
 * Impulse responses are expensive to render and the adaptive pass swaps the
 * hall for its shorter twin and back — on the main thread, on a machine that
 * has just been measured as too slow. Rendering one twice is the thing to
 * catch.
 */
describe('room caching', () => {
  function roomHarness() {
    const engine = new AudioEngine();
    let made = 0;
    const ctx = {
      sampleRate: 8000,
      createBuffer: vi.fn((_ch: number, len: number) => {
        made++;
        return { length: len, copyToChannel: vi.fn() };
      }),
    };
    engine.ctx = ctx as unknown as AudioContext;
    const state = engine as unknown as { room(spec: unknown): unknown };
    return { engine, state, made: () => made };
  }

  it('renders a given room once and hands the same buffer back after', () => {
    const { state, made } = roomHarness();
    const a = state.room(HALL);
    const b = state.room(HALL);
    expect(b).toBe(a);
    expect(made()).toBe(1);
  });

  it('keeps the two halls apart, so a lite flip is not a re-render', () => {
    const { state, made } = roomHarness();
    const full = state.room(HALL);
    const lite = state.room(HALL_LITE);
    expect(lite).not.toBe(full);
    expect(made()).toBe(2);
    // The flip back, and the flip back again.
    expect(state.room(HALL)).toBe(full);
    expect(state.room(HALL_LITE)).toBe(lite);
    expect(made()).toBe(2);
  });
});

/**
 * Lite mode used to change two live nodes on the master path: the convolver's
 * buffer, which throws away a 2.4 second tail in one sample, and the
 * WaveShaper's oversampling, which rebuilds its filters with zeroed history and
 * moves its latency. Both are pops, and the adaptive quality ladder crosses the
 * rung that triggers them in both directions.
 */
describe('changing rooms', () => {
  function liteHarness() {
    vi.useFakeTimers();
    const engine = new AudioEngine();
    const wetGain = param(1.7);
    const conv: { buffer: unknown } = { buffer: 'the full hall' };
    const clip = { oversample: '2x' };
    const state = engine as unknown as {
      ctx: unknown; ready: boolean; hallWet: unknown; hallConv: unknown;
      clip: unknown; rooms: Map<unknown, unknown>; shots: { max: number };
    };
    state.ctx = { currentTime: 5, sampleRate: 48000 };
    state.ready = true;
    state.hallWet = { gain: wetGain };
    state.hallConv = conv;
    state.clip = clip;
    // Pre-seed the cache so the swap does not try to render a real room.
    state.rooms.set(HALL_LITE, 'the short hall');
    return { engine, wetGain, conv, clip };
  }

  it('takes the hall send down before the buffer changes, and brings it back', () => {
    const { engine, wetGain, conv } = liteHarness();
    engine.setLite(true);

    // Down first, and the tail still the old one.
    expect(wetGain.linearRampToValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
    expect(conv.buffer).toBe('the full hall');

    vi.runAllTimers();
    expect(conv.buffer).toBe('the short hall');
    // And back up to where the reverb setting says it belongs.
    const last = wetGain.linearRampToValueAtTime.mock.calls.at(-1);
    expect(last?.[0]).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it('leaves the oversampling on the clipper alone', () => {
    const { engine, clip } = liteHarness();
    engine.setLite(true);
    vi.runAllTimers();
    expect(clip.oversample).toBe('2x');
    vi.useRealTimers();
  });
});
