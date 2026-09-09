import { describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../src/audio/engine';
import { BED_VOICES, LEAD_VOICES, findBedVoice, findLeadVoice, noises } from '../src/audio/voices';
import type { StringSpec } from '../src/audio/strings';

const NEW_BEDS = ['trumpet', 'harmonica', 'steel-string-guitar', 'clean-electric-guitar',
  'brass-ensemble', 'grand', 'marimba', 'breath-flute', 'solo-string', 'pipe-organ', 'wurlitzer'];
const SHARED = ['trumpet', 'harmonica', 'grand', 'marimba', 'breath-flute', 'solo-string', 'pipe-organ', 'wurlitzer'];

function param(value = 1) {
  return { value, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(), cancelAndHoldAtTime: vi.fn(), cancelScheduledValues: vi.fn(),
    setTargetAtTime: vi.fn() };
}
function node<T extends object>(props: T) {
  return Object.assign(props, { connect: vi.fn((to: unknown) => to), disconnect: vi.fn() });
}
function source() {
  let ended: (() => void) | undefined;
  return node({ detune: param(), stop: vi.fn(),
    addEventListener: vi.fn((_type: string, listener: () => void) => { ended = listener; }),
    end: () => { const callback = ended; ended = undefined; callback?.(); } });
}
type Source = ReturnType<typeof source>;
type Param = ReturnType<typeof param>;
type Gain = ReturnType<typeof node<{ gain: Param }>>;
interface Internals {
  addLayer: ReturnType<typeof vi.fn>;
  prepareNoise: ReturnType<typeof vi.fn>;
  lfoAt: ReturnType<typeof vi.fn>;
  bendSource: ReturnType<typeof node<object>>;
  lfoVibrato: ReturnType<typeof node<object>>;
  voices: Map<number, { sources: Source[]; amp: Gain; startedAt: number; releasing: boolean }>;
  active: { note: number; sources: Source[]; releasing: boolean }[];
  stringBuffer(at: { id: string; note: number; spec: StringSpec; bucket: 0 | 1 | 2 | 3 }): AudioBuffer;
}

function rig(id: string, bank: 'lead' | 'bed' = 'bed') {
  const engine = new AudioEngine();
  engine.setLite(false);
  if (bank === 'lead') engine.setLeadVoice(id);
  else {
    engine.setBedVoice(id);
    engine.setKeyBedVoice(id);
    engine.setKeyVoicing('bed');
  }
  const gains: Gain[] = [];
  const filters: ReturnType<typeof node<{ frequency: Param; Q: Param; type: string }>>[] = [];
  const ctx = {
    currentTime: 1, sampleRate: 48000, state: 'running',
    createGain: () => { const g = node({ gain: param() }); gains.push(g); return g; },
    createBiquadFilter: () => {
      const f = node({ frequency: param(), Q: param(), type: 'lowpass' }); filters.push(f); return f;
    },
    createStereoPanner: () => node({ pan: param(0) }),
    createBuffer: vi.fn((_channels: number, length: number, sampleRate: number) => ({
      length, sampleRate, copyToChannel: vi.fn(),
    })),
  };
  engine.ctx = ctx as unknown as AudioContext;
  engine.ready = true;
  const sources: Source[] = [];
  const state = engine as unknown as Internals;
  Object.assign(state, {
    leadOut: Object.fromEntries(['dry', 'hall', 'cab', 'delay', 'body'].map(k => [k, node({ gain: param() })])),
    padDuck: node({ gain: param() }), padGen: node({ gain: param() }), padCarve: node({}),
    bodyWet: node({ gain: param() }), bendSource: node({}), lfoVibrato: node({}), lfoColour: node({}),
    addLayer: vi.fn(() => { const s = source(); sources.push(s); return [s]; }),
    prepareNoise: vi.fn(() => vi.fn()), lfoAt: vi.fn(() => node({})),
  });
  return { engine, state, ctx, gains, filters, sources };
}

describe('fixed PlayTune instrument synthesis', () => {
  it('adds exactly three lead and eleven bed definitions with native-compatible IDs', () => {
    expect(LEAD_VOICES).toHaveLength(31);
    expect(BED_VOICES).toHaveLength(26);
    for (const id of ['trumpet', 'harmonica', 'electric-bass']) expect(findLeadVoice(id).id).toBe(id);
    for (const id of NEW_BEDS) {
      expect(findBedVoice(id).id).toBe(id);
      expect(findBedVoice(id).spec.articulation, id).toBeDefined();
    }
  });

  it.each(SHARED)('preserves layers, transients and expression in the %s counterpart', id => {
    const lead = findLeadVoice(id).spec;
    const bed = findBedVoice(id).spec;
    expect(bed.layers).toEqual(lead.layers);
    expect(bed.noise).toEqual(lead.noise);
    expect(bed.string).toBe(lead.string);
    expect(bed.unison).toEqual(lead.unison);
    expect(bed.articulation).toMatchObject({ filter: lead.filter, env: lead.env });
    expect(bed.articulation?.lfo).toEqual(lead.lfo);
    expect(bed.articulation?.keyTrack).toEqual(lead.keyTrack);
  });

  it('makes the six identities different from each other and from existing synths', () => {
    const specs = [findLeadVoice('trumpet').spec, findLeadVoice('harmonica').spec,
      findLeadVoice('electric-bass').spec, ...['steel-string-guitar', 'clean-electric-guitar', 'brass-ensemble'].map(id => findBedVoice(id).spec)];
    expect(new Set(specs.map(s => JSON.stringify(s.layers))).size).toBe(6);
    expect(findBedVoice('brass-ensemble').spec.layers).not.toEqual(findBedVoice('analog-brass').spec.layers);
    expect(findBedVoice('steel-string-guitar').spec.string).not.toEqual(findBedVoice('clean-electric-guitar').spec.string);
    expect(findLeadVoice('electric-bass').spec.glide).toBeUndefined();
  });

  it.each(NEW_BEDS)('articulates %s on the automatic bus and cancels every source', id => {
    const { engine, state, sources, gains, filters } = rig(id);
    engine.pad([60], 2, 0.04, 2, 1, true);
    const bed = findBedVoice(id).spec;
    expect(state.addLayer.mock.calls.map(call => call[1])).toEqual(bed.layers);
    expect(state.prepareNoise).toHaveBeenCalledTimes(noises(bed.noise).length);
    expect(engine.scheduledPianoCount).toBe(1);
    expect(state.voices.size).toBe(0);
    expect(state.bendSource.connect).not.toHaveBeenCalled();
    expect(state.lfoVibrato.connect).not.toHaveBeenCalled();
    const noteAmp = gains[1]!.gain;
    expect(noteAmp.exponentialRampToValueAtTime.mock.calls[0]![1]).toBeLessThanOrEqual(2.08);
    expect(noteAmp.exponentialRampToValueAtTime).toHaveBeenLastCalledWith(0.0001, 4);
    expect(filters[0]!.frequency.setValueAtTime.mock.calls[0]![0]).toBeGreaterThan(180);
    engine.stopPads(0.05);
    expect(engine.scheduledPianoCount).toBe(0);
    expect(sources.every(s => s.stop.mock.calls.at(-1)![0] === 1.07)).toBe(true);
    for (const s of sources) s.end();
    expect(sources.every(s => s.disconnect.mock.calls.length > 0)).toBe(true);
  });

  it.each(['steel-string-guitar', 'clean-electric-guitar', 'brass-ensemble'])('releases individual held %s keys without interrupting their chord', id => {
    const { engine, state } = rig(id);
    engine.noteOn(60, 0.3);
    engine.noteOn(64, 0.9);
    const first = state.voices.get(60)!;
    const second = state.voices.get(64)!;
    expect(first.amp.gain.exponentialRampToValueAtTime.mock.calls[0]![1] - first.startedAt).toBeLessThan(0.03);
    expect(second.amp.gain.exponentialRampToValueAtTime.mock.calls[0]![0]).toBeGreaterThan(first.amp.gain.exponentialRampToValueAtTime.mock.calls[0]![0]);
    engine.noteOff(60);
    expect(state.voices.has(60)).toBe(false);
    expect(state.voices.get(64)).toBe(second);
    expect(first.sources.every(s => s.stop.mock.calls.length > 0)).toBe(true);
    expect(second.sources.every(s => s.stop.mock.calls.length === 0)).toBe(true);
    engine.allNotesOff();
    expect(second.sources.every(s => s.stop.mock.calls.length > 0)).toBe(true);
  });

  it('lets repeated bass pitches retrigger independently without gliding or stealing another note', () => {
    const { engine, state } = rig('electric-bass', 'lead');
    engine.noteOn(36, 0.5);
    engine.noteOn(43, 0.7);
    const fifth = state.voices.get(43)!;
    engine.noteOn(36, 0.9);
    expect(state.voices.get(43)).toBe(fifth);
    expect(fifth.releasing).toBe(false);
    expect(state.addLayer.mock.calls.every(call => call[11] === undefined)).toBe(true);
  });

  it('keeps same-pitch automatic attacks separate from a manual chord release', () => {
    const { engine, sources } = rig('clean-electric-guitar');
    engine.pad([60], 2, 0.04, 2, 0.01, true);
    const scheduledSources = [...sources];
    const held = engine.holdPad([60, 64], 0.6)!;
    held.release(0.04);
    expect(scheduledSources.every(s => s.stop.mock.calls.at(-1)![0] === 4.02)).toBe(true);
    expect(sources.slice(scheduledSources.length).every(s => s.stop.mock.calls.at(-1)![0] === 1.06)).toBe(true);
  });

  it('does not extend a stopped finite chord when its manual handle is released later', () => {
    const { engine, sources, ctx } = rig('steel-string-guitar');
    const held = engine.holdPad([60, 64], 0.6)!;
    engine.stopPads(0.04);
    const stops = sources.map(source => source.stop.mock.calls.at(-1)![0]);
    ctx.currentTime = 1.1;
    held.release(0.13);
    expect(sources.map(source => source.stop.mock.calls.at(-1)![0])).toEqual(stops);
    expect(stops.every(stop => stop === 1.06)).toBe(true);
  });

  it('keys string buffers by model parameters as well as shared bank identity', () => {
    const { state, ctx } = rig('steel-string-guitar');
    const spec = findBedVoice('steel-string-guitar').spec.string!;
    const at = { id: 'shared-guitar', spec, note: 60, bucket: 2 as const };
    const first = state.stringBuffer(at);
    expect(state.stringBuffer({ ...at, spec: { ...spec } })).toBe(first);
    expect(state.stringBuffer({ ...at, spec: { ...spec, damp: 0.45 } })).not.toBe(first);
    expect(ctx.createBuffer).toHaveBeenCalledTimes(2);
  });
});
