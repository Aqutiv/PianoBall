import { describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../src/audio/engine';

function parameter(value = 0.001) {
  return { value, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(), cancelAndHoldAtTime: vi.fn(), setTargetAtTime: vi.fn() };
}
function node() {
  return { gain: parameter(), frequency: parameter(), Q: { value: 0 }, pan: { value: 0 },
    connect: vi.fn((to: unknown) => to), disconnect: vi.fn() };
}
function rig(voice = 'warm') {
  const engine = new AudioEngine();
  engine.setBedVoice(voice);
  const sources: { stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; end(): void }[] = [];
  const state = engine as unknown as {
    padGen: ReturnType<typeof node>; padCarve: ReturnType<typeof node>;
    addLayer: ReturnType<typeof vi.fn>; voices: Map<number, unknown>;
  };
  state.padGen = node();
  state.padCarve = node();
  state.addLayer = vi.fn(() => {
    let ended = () => {};
    const source = {
      stop: vi.fn(), disconnect: vi.fn(), end: () => ended(),
      addEventListener: (_type: string, callback: () => void) => { ended = callback; },
    };
    sources.push(source);
    return [source];
  });
  const clock = { currentTime: 1, sampleRate: 48000, state: 'running',
    createGain: vi.fn(node), createBiquadFilter: vi.fn(node), createStereoPanner: vi.fn(node) };
  engine.ctx = clock as unknown as AudioContext;
  engine.ready = true;
  return { engine, state, clock, sources };
}

describe('held backing sources', () => {
  it('keeps backing pitches independent of lead release and expression ownership', () => {
    const { engine, state, sources } = rig();
    const pad = engine.holdPad([48, 52, 55], 0.8);
    expect(pad).not.toBeNull();
    expect(engine.heldPadCount).toBe(1);
    expect(state.voices.size).toBe(0);
    engine.noteOff(48);
    engine.allNotesOff();
    for (const source of sources) expect(source.stop).not.toHaveBeenCalled();
    pad!.release();
    for (const source of sources) expect(source.stop).toHaveBeenCalledOnce();
  });

  it('releases sources on stopPads and disconnects the graph only after they end', () => {
    const { engine, sources } = rig();
    engine.holdPad([48, 52, 55]);
    engine.stopPads(0.08);
    for (const source of sources) {
      expect(source.stop).toHaveBeenCalledWith(1.1);
      expect(source.disconnect).not.toHaveBeenCalled();
    }
    sources.slice(0, -1).forEach((s) => s.end());
    expect(engine.heldPadCount).toBe(1);
    sources.at(-1)!.end();
    expect(engine.heldPadCount).toBe(0);
    for (const source of sources) expect(source.disconnect).toHaveBeenCalledOnce();
  });

  it.each(['bed-harp', 'bed-felt-piano'])('retires a naturally decaying %s chord', (voice) => {
    const { engine, sources } = rig(voice);
    engine.holdPad([48, 52, 55]);
    for (const source of sources) expect(source.stop).toHaveBeenCalledOnce();
    sources.forEach((s) => s.end());
    expect(engine.heldPadCount).toBe(0);
  });

  it('does not extend a source stop when a second, slower release arrives', () => {
    const { engine, sources, clock } = rig();
    const pad = engine.holdPad([48])!;
    pad.release(0.05);
    clock.currentTime += 0.01;
    pad.release(0.3);
    expect(sources[0].stop).toHaveBeenCalledOnce();
    pad.release(0.004);
    expect(sources[0].stop).toHaveBeenCalledTimes(2);
  });

  it('does not allocate a chord when audio or global backing is off', () => {
    const { engine, state } = rig();
    engine.settings.bed = false;
    expect(engine.holdPad([48])).toBeNull();
    expect(state.addLayer).not.toHaveBeenCalled();
    expect(new AudioEngine().holdPad([48])).toBeNull();
  });
});
