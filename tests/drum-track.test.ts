import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine, type Scheduled } from '../src/audio/engine';
import type { DrumVoice } from '../src/audio/drums';
import { CAB, HALL, HALL_LITE, type RoomSpec } from '../src/audio/rooms';

function param(value = 1) {
  return {
    value, cancelAndHoldAtTime: vi.fn(), cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
  };
}

function node() {
  const connections = new Set<unknown>();
  return {
    connections,
    connect: vi.fn((target: unknown) => { connections.add(target); return target; }),
    disconnect: vi.fn(() => connections.clear()),
  };
}
const gainNode = () => ({ ...node(), gain: param() });
const convolverNode = () => ({ ...node(), buffer: null as unknown });

type FakeGain = ReturnType<typeof gainNode>;
type FakeConvolver = ReturnType<typeof convolverNode>;
type Route = { dry: FakeGain; hall: FakeConvolver | FakeGain; cab: FakeConvolver | FakeGain };

function rig() {
  const engine = new AudioEngine();
  engine.setLite(false);
  const gains: FakeGain[] = [];
  const convolvers: FakeConvolver[] = [];
  const sources: {
    onended: (() => void) | null;
    start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  const ctx = {
    currentTime: 7, state: 'running',
    createGain: () => { const gain = gainNode(); gains.push(gain); return gain; },
    createConvolver: () => { const convolver = convolverNode(); convolvers.push(convolver); return convolver; },
    createConstantSource: () => {
      const source = { ...node(), offset: param(0), onended: null as (() => void) | null, start: vi.fn(), stop: vi.fn() };
      sources.push(source);
      return source;
    },
  };
  const state = engine as unknown as {
    ctx: unknown; ready: boolean; musicBus: FakeGain; hallSend: FakeGain; cabSend: FakeGain;
    hallWet: FakeGain; cabWet: FakeGain; master: FakeGain; fxBus: FakeGain; padBus: FakeGain;
    hallConv: FakeConvolver; rooms: Map<RoomSpec, unknown>;
    drumTracks: Set<unknown>;
    drumOn(voice: DrumVoice, gain: number, at: number, route: Route): Scheduled;
  };
  state.ctx = ctx;
  state.ready = true;
  state.musicBus = gainNode();
  state.hallSend = gainNode();
  state.cabSend = gainNode();
  state.hallWet = gainNode();
  state.cabWet = gainNode();
  state.master = gainNode();
  state.fxBus = gainNode();
  state.padBus = gainNode();
  state.hallConv = convolverNode();
  const hallBuffer = {}, cabBuffer = {}, liteBuffer = {};
  state.rooms.set(HALL, hallBuffer);
  state.rooms.set(CAB, cabBuffer);
  state.rooms.set(HALL_LITE, liteBuffer);
  const emit = vi.spyOn(state, 'drumOn').mockImplementation(() => ({ cancel: vi.fn() }));
  return { engine, state, ctx, gains, convolvers, sources, emit, hallBuffer, cabBuffer, liteBuffer };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('an arrangement owns its drum room', () => {
  it('uses two cached rooms per track and keeps every wet return behind its own output gate', () => {
    const h = rig();
    const track = h.engine.createDrumTrack();
    for (let beat = 0; beat < 20; beat++) track.drum('snare', 0.4, 7 + beat / 2);
    expect(h.convolvers).toHaveLength(2);
    expect(h.gains).toHaveLength(3);
    const [hall, cab] = h.convolvers;
    const [dry, hallOut, cabOut] = h.gains;
    expect(hall.buffer).toBe(h.hallBuffer);
    expect(cab.buffer).toBe(h.cabBuffer);
    expect(dry.connections).toEqual(new Set([h.state.musicBus]));
    expect(hall.connections).toEqual(new Set([hallOut]));
    expect(cab.connections).toEqual(new Set([cabOut]));
    expect(hallOut.connections).toEqual(new Set([h.state.hallWet]));
    expect(cabOut.connections).toEqual(new Set([h.state.cabWet]));
    expect(h.emit).toHaveBeenLastCalledWith('snare', 0.4, 16.5, { dry, hall, cab });
    expect(track.tailSeconds).toBeCloseTo(2.463);
    track.cancel();
  });

  it('fades after convolution, disposes on the audio clock, and never touches shared returns', () => {
    const h = rig();
    const track = h.engine.createDrumTrack();
    track.drum('crash', 0.6, 7);
    track.drum('kick', 0.5, 9);
    track.cancel();
    track.cancel();
    expect(h.state.drumTracks.size).toBe(0);
    for (const gate of h.gains) {
      expect(gate.gain.linearRampToValueAtTime).toHaveBeenCalledExactlyOnceWith(0, 7.01);
      expect(gate.disconnect).not.toHaveBeenCalled();
    }
    for (const shared of [h.state.hallWet, h.state.cabWet, h.state.musicBus, h.state.hallSend, h.state.cabSend]) {
      expect(shared.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
      expect(shared.disconnect).not.toHaveBeenCalled();
    }
    expect(h.sources).toHaveLength(1);
    expect(h.sources[0].stop).toHaveBeenCalledWith(7.02);
    expect(vi.getTimerCount()).toBe(0);
    // Wall time alone must not interrupt a fade on a suspended audio clock.
    vi.advanceTimersByTime(1000);
    for (const gate of h.gains) expect(gate.disconnect).not.toHaveBeenCalled();
    h.sources[0].onended?.();
    for (const owned of [...h.gains, ...h.convolvers]) expect(owned.disconnect).toHaveBeenCalledOnce();
    expect(h.sources[0].disconnect).toHaveBeenCalledOnce();
    track.drum('snare', 1, 10);
    expect(h.emit).toHaveBeenCalledTimes(2);
  });

  it('gives a restarted track fresh gates and room state while reusing the impulse buffers', () => {
    const h = rig();
    const first = h.engine.createDrumTrack();
    first.drum('snare', 0.4, 7);
    first.cancel();
    const second = h.engine.createDrumTrack();
    second.drum('kick', 0.4, 7.1);
    expect(h.convolvers).toHaveLength(4);
    expect(h.convolvers[2]).not.toBe(h.convolvers[0]);
    expect(h.convolvers[2].buffer).toBe(h.convolvers[0].buffer);
    for (const gate of h.gains.slice(3)) expect(gate.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    h.sources[0].onended?.();
    for (const owned of [...h.gains.slice(3), ...h.convolvers.slice(2)]) expect(owned.disconnect).not.toHaveBeenCalled();
    expect(h.state.drumTracks.size).toBe(1);
    second.cancel();
  });

  it('keeps the existing shared drum API independent and uses the live global faders', () => {
    const h = rig();
    const track = h.engine.createDrumTrack();
    track.cancel();
    h.engine.drum('snare', 0.4, 8);
    expect(h.emit).toHaveBeenCalledWith('snare', 0.4, 8, {
      dry: h.state.musicBus, hall: h.state.hallSend, cab: h.state.cabSend,
    });
    h.engine.setSettings({ reverb: 0.2, music: 0.3, effects: 0.4, master: 0.5 });
    expect(h.state.hallWet.gain.setTargetAtTime).toHaveBeenCalledWith(1.7 * 0.2, 7, 0.02);
    expect(h.state.cabWet.gain.setTargetAtTime).toHaveBeenCalledWith(0.9 * 0.2, 7, 0.02);
    expect(h.state.musicBus.gain.setTargetAtTime).toHaveBeenCalledWith(0.3, 7, 0.02);
    expect(h.state.master.gain.setTargetAtTime).toHaveBeenCalledWith(0.5, 7, 0.02);
    // Changing a global fader cannot reopen a cancelled track's output gates.
    for (const gate of h.gains) expect(gate.gain.setTargetAtTime).not.toHaveBeenCalled();
  });

  it('shares the click-free hall quality swap but retains only active tracks', () => {
    const h = rig();
    const first = h.engine.createDrumTrack();
    const second = h.engine.createDrumTrack();
    first.cancel();
    h.engine.setLite(true);
    expect(h.state.hallWet.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
    vi.runAllTimers();
    expect(h.state.hallConv.buffer).toBe(h.liteBuffer);
    expect(h.convolvers[2].buffer).toBe(h.liteBuffer);
    expect(h.convolvers[0].buffer).toBe(h.hallBuffer);
    second.cancel();
  });

  it('is safe before a context exists or after its context has closed', () => {
    const beforeAudio = new AudioEngine().createDrumTrack();
    expect(() => { beforeAudio.drum('kick', 1, 0).cancel(); beforeAudio.cancel(); }).not.toThrow();
    const h = rig();
    const track = h.engine.createDrumTrack();
    h.ctx.state = 'closed';
    track.cancel();
    expect(h.sources).toHaveLength(0);
    for (const owned of [...h.gains, ...h.convolvers]) expect(owned.disconnect).toHaveBeenCalledOnce();
  });
});