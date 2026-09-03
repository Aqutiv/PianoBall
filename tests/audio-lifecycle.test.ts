import { describe, expect, it, vi } from 'vitest';
import { holdAtTime } from '../src/audio/automation';
import { AudioEngine } from '../src/audio/engine';

interface FakeParam {
  value: number;
  cancelAndHoldAtTime: ReturnType<typeof vi.fn>;
  cancelScheduledValues: ReturnType<typeof vi.fn>;
  exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  setValueAtTime: ReturnType<typeof vi.fn>;
}

interface FakeVoice {
  note: number;
  startedAt: number;
  sources: { detune: FakeParam; stop: ReturnType<typeof vi.fn> }[];
  filter: { frequency: FakeParam };
  amp: { gain: FakeParam };
  panner: object;
  freq: number;
  peak: number;
  k: object;
  release: number;
  taps: never[];
  releasing: boolean;
  stopAt: number | null;
}

interface EngineInternals {
  active: FakeVoice[];
  voices: Map<number, FakeVoice>;
  sustained: Set<number>;
  fading: { voice: FakeVoice; at: number }[];
  bendSource: { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };
  lfoVibrato: { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };
  lfoColour: { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };
  release(voice: FakeVoice, seconds: number, damp?: boolean, reprieve?: number): void;
  pruneVoices(t: number): void;
  retrigger(note: number, t: number): void;
  recatch(t: number): void;
  cull(): void;
}

function param(value = 0.25): FakeParam {
  return {
    value,
    cancelAndHoldAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
  } as FakeParam;
}

function voice(note: number, startedAt = 0, releasing = false, stopAt: number | null = null): FakeVoice {
  return {
    note,
    startedAt,
    sources: [{ detune: param(), stop: vi.fn() }],
    filter: { frequency: param() },
    amp: { gain: param() },
    panner: {},
    freq: 440,
    peak: 0.5,
    k: {},
    release: 0.3,
    taps: [],
    releasing,
    stopAt,
  };
}

function connector() {
  return { connect: vi.fn(), disconnect: vi.fn() };
}

function harness(now = 1) {
  const clock = { currentTime: now, state: 'running' };
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
  it('uses the native hold operation without cancelling separately', () => {
    const gain = param(0.23);

    holdAtTime(gain as unknown as AudioParam, 4);

    expect(gain.cancelAndHoldAtTime).toHaveBeenCalledWith(4);
    expect(gain.cancelScheduledValues).not.toHaveBeenCalled();
    expect(gain.setValueAtTime).not.toHaveBeenCalled();
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

describe('key voice release tracking', () => {
  it('keeps a release live until its source stop time, then prunes it', () => {
    const { clock, state } = harness();
    const held = voice(60);
    state.active.push(held);
    state.voices.set(60, held);

    state.release(held, 0.3, false);

    expect(state.active).toEqual([held]);
    expect(held.stopAt).toBeCloseTo(1.32);
    expect(held.amp.gain.cancelAndHoldAtTime).toHaveBeenCalledWith(1);
    expect(held.sources[0].stop).toHaveBeenCalledWith(held.stopAt);

    clock.currentTime = 1.321;
    state.pruneVoices(clock.currentTime);
    expect(state.active).toEqual([]);
    expect(state.voices.has(60)).toBe(false);
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

  it('recatches without duplicating a voice and never revives a superseded tail', () => {
    const { state } = harness();
    const caught = voice(60, 0, true, 3);
    state.active.push(caught);
    state.fading.push({ voice: caught, at: 0.9 });

    state.recatch(1);

    expect(state.active).toEqual([caught]);
    expect(state.voices.get(60)).toBe(caught);
    expect(state.sustained.has(60)).toBe(true);
    expect(caught.releasing).toBe(false);

    state.fading.push({ voice: caught, at: 1 });
    state.retrigger(60, 1);
    state.recatch(1.01);

    expect(state.active).toEqual([caught]);
    expect(state.voices.has(60)).toBe(false);
    expect(state.sustained.has(60)).toBe(false);
    expect(state.fading).toEqual([]);
  });
});
