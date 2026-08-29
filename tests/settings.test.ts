import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine, DEFAULT_AUDIO } from '../src/audio/engine';
import { DEFAULT_MAPPING, NoteMapping } from '../src/midi/mapping';
import { InputHub } from '../src/midi/inputHub';
import { DEFAULT_VELOCITY } from '../src/midi/velocityCurve';
import { MidiInput } from '../src/midi/midiInput';
import { DEFAULT_QUALITY, Renderer } from '../src/render/renderer';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function fakeCanvas(): HTMLCanvasElement {
  return { getContext: () => ({}) } as unknown as HTMLCanvasElement;
}

describe('settings persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal('document', { createElement: () => fakeCanvas() });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('reloads audio, controller, MIDI-device, velocity, and display choices', () => {
    const audio = new AudioEngine();
    audio.setSettings({ master: 0.2, music: 0.3, effects: 0.4, assist: false, bed: false });

    const mapping = new NoteMapping();
    mapping.settings = { baseNote: 36, count: 49, autoLatch: false };
    mapping.persist();

    const input = new InputHub();
    input.setVelocitySettings({ curve: 'fixed', fixed: 0.5 });
    input.midi.select('keyboard-b');

    const renderer = new Renderer(fakeCanvas());
    renderer.setQuality({ bloom: false, labels: false, reducedMotion: true, colorBlind: true });

    expect(new AudioEngine().settings).toEqual({
      master: 0.2, music: 0.3, effects: 0.4, assist: false, bed: false,
    });
    expect(new NoteMapping().settings).toEqual({ baseNote: 36, count: 49, autoLatch: false });
    expect(new InputHub().velocity).toMatchObject({ curve: 'fixed', fixed: 0.5 });
    expect(new MidiInput().selectedId).toBe('keyboard-b');
    expect(new Renderer(fakeCanvas()).quality).toMatchObject({
      bloom: false, labels: false, reducedMotion: true, colorBlind: true,
    });
  });

  it('restores defaults without removing the best score', () => {
    localStorage.setItem('pianoball.best', '12345');

    const audio = new AudioEngine();
    audio.setSettings({ master: 0.1, bed: false });
    audio.resetSettings();

    const input = new InputHub();
    input.mapping.settings = { baseNote: 24, count: 61, autoLatch: false };
    input.mapping.resetSettings();
    input.setVelocitySettings({ curve: 'hard' });
    input.resetVelocitySettings();
    input.midi.devices = [
      { id: 'keyboard-a', name: 'A', manufacturer: '' },
      { id: 'keyboard-b', name: 'B', manufacturer: '' },
    ];
    input.midi.select('keyboard-b');
    input.midi.resetSettings();

    const renderer = new Renderer(fakeCanvas());
    renderer.setQuality({ bloom: false, colorBlind: true });
    renderer.resetSettings();

    expect(audio.settings).toEqual(DEFAULT_AUDIO);
    expect(input.mapping.settings).toEqual(DEFAULT_MAPPING);
    expect(input.velocity).toEqual(DEFAULT_VELOCITY);
    expect(input.midi.selectedId).toBe('keyboard-a');
    expect(renderer.quality).toEqual(DEFAULT_QUALITY);
    expect(localStorage.getItem('pianoball.best')).toBe('12345');
  });
});
