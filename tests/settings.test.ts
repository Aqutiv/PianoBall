import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine, DEFAULT_AUDIO } from '../src/audio/engine';
import { DEFAULT_MAPPING, NoteMapping } from '../src/midi/mapping';
import { InputHub } from '../src/midi/inputHub';
import { DEFAULT_VELOCITY } from '../src/midi/velocityCurve';
import { MidiInput } from '../src/midi/midiInput';
import { DEFAULT_QUALITY, Stage } from '../src/render/stage';
import { MusicState, RANDOM } from '../src/audio/musicState';
import { AURORA } from '../src/game/table/tables/aurora';
import { loadScores, saveBest } from '../src/modes/pinball/pinball';
import { DEFAULT_PLAYTUNE, playTuneSettings, setPlayTuneSettings } from '../src/modes/playtune/settings';
import { DEFAULT_FREESTYLE, freestyleSettings, setFreestyleSettings } from '../src/modes/freestyle/settings';

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
  return { getContext: () => ({}), style: {} } as unknown as HTMLCanvasElement;
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

    const stage = new Stage(fakeCanvas());
    stage.setQuality({ bloom: false, labels: false, reducedMotion: true, colorBlind: true });

    expect(new AudioEngine().settings).toMatchObject({
      master: 0.2, music: 0.3, effects: 0.4, assist: false, bed: false,
    });
    expect(new NoteMapping().settings).toEqual({ baseNote: 36, count: 49, autoLatch: false });
    expect(new InputHub().velocity).toMatchObject({ curve: 'fixed', fixed: 0.5 });
    expect(new MidiInput().selectedId).toBe('keyboard-b');
    expect(new Stage(fakeCanvas()).quality).toMatchObject({
      bloom: false, labels: false, reducedMotion: true, colorBlind: true,
    });
  });

  it('remembers how the wheels were set up', () => {
    new AudioEngine().setSettings({ bendRange: 12, modTarget: 'vibrato' });

    expect(new AudioEngine().settings).toMatchObject({ bendRange: 12, modTarget: 'vibrato' });
  });

  it('remembers the PlayTune calibration', () => {
    setPlayTuneSettings({ offsetMs: 45, leadBeats: 6, assist: false });

    expect(playTuneSettings()).toEqual({ offsetMs: 45, leadBeats: 6, assist: false });
  });

  it('starts Freestyle with no bed under it', () => {
    expect(DEFAULT_FREESTYLE.bed).toBe(false);
    setFreestyleSettings({ bed: true });
    expect(freestyleSettings().bed).toBe(true);
  });

  it('remembers the room', () => {
    new AudioEngine().setSettings({ reverb: 0.2 });

    expect(new AudioEngine().settings.reverb).toBe(0.2);
  });

  it('remembers the key as a pitch class, not an octave', () => {
    const music = new MusicState({ ...AURORA.music });
    const started = music.root;
    music.setRoot(0);   // C

    expect(music.root % 12).toBe(0);
    // Stays in the register the app is written around rather than leaping.
    expect(Math.abs(music.root - started)).toBeLessThanOrEqual(12);
    expect(new MusicState({ ...AURORA.music }).root % 12).toBe(0);
  });

  it('uses a random scale by default and still remembers an explicit choice', () => {
    const music = new MusicState({ ...AURORA.music });

    expect(music.choice).toBe(RANDOM);
    music.setChoice('lydian');

    expect(new MusicState({ ...AURORA.music }).choice).toBe('lydian');
  });

  it('keeps a best score recorded by a build that predates the mode split', () => {
    localStorage.setItem('pianoball.best', '12345');

    expect(loadScores().pinball).toBe(12345);
    // And a worse run afterwards must not lose it.
    expect(saveBest(500)).toBe(12345);
    expect(loadScores().pinball).toBe(12345);
    expect(saveBest(99999)).toBe(99999);
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

    const stage = new Stage(fakeCanvas());
    stage.setQuality({ bloom: false, colorBlind: true });
    stage.resetSettings();

    const music = new MusicState({ ...AURORA.music });
    music.setChoice('blues');
    music.setChoice(RANDOM);

    expect(audio.settings).toEqual(DEFAULT_AUDIO);
    expect(input.mapping.settings).toEqual(DEFAULT_MAPPING);
    expect(input.velocity).toEqual(DEFAULT_VELOCITY);
    expect(input.midi.selectedId).toBe('keyboard-a');
    expect(stage.quality).toEqual(DEFAULT_QUALITY);
    expect(music.choice).toBe(RANDOM);
    expect(localStorage.getItem('pianoball.best')).toBe('12345');
  });

  it('leaves earned progress alone when settings are reset', () => {
    // Unlocked tunes and the default PlayTune settings are different kinds of
    // thing: one is earned, the other is configured.
    localStorage.setItem('pianoball.playtune', JSON.stringify({ unlocked: ['first-light', 'ode-to-joy'], best: {} }));
    setPlayTuneSettings({ ...DEFAULT_PLAYTUNE });
    new AudioEngine().resetSettings();
    new Stage(fakeCanvas()).resetSettings();

    const stored = JSON.parse(localStorage.getItem('pianoball.playtune')!);
    expect(stored.unlocked).toEqual(['first-light', 'ode-to-joy']);
  });
});
