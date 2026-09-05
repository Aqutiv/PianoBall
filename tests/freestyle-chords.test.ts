import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChordInput } from '../src/modes/freestyle/chordInput';
import { ChordBed, type ManualChord, type ManualChordQuality } from '../src/audio/bed';
import { chordNotes } from '../src/audio/music';
import { MusicState } from '../src/audio/musicState';
import { AURORA } from '../src/game/table/tables/aurora';
import { KeyboardFallback } from '../src/midi/keyboardFallback';
import type { InputEvent } from '../src/midi/types';

function inputRig(base = 48, count = 32, hold = true) {
  const player = {
    manualChord: null as ManualChord | null,
    setManualChord: vi.fn((root: number, quality: ManualChordQuality, velocity: number) => {
      player.manualChord = { root, quality, velocity };
    }),
    clearManualChord: vi.fn(() => { player.manualChord = null; }),
    transposeManualChord: vi.fn((delta: number) => {
      if (player.manualChord) player.manualChord = { ...player.manualChord, root: player.manualChord.root + delta };
    }),
  };
  const input = new ChordInput(player);
  input.remap(base, count);
  input.configure(true, 'maj', hold);
  return { input, player };
}

describe('Freestyle chord switches', () => {
  const qualities: ManualChordQuality[] = ['maj', 'min', 'dom7', 'min7'];
  for (let pitch = 0; pitch < 12; pitch++) {
    it.each(qualities)('plays root ' + pitch + ' with selector %s', (quality) => {
      const { input, player } = inputRig();
      input.configure(true, quality, true);
      expect(input.noteOn(48 + pitch, 0.8)).toBe('chord');
      expect(player.manualChord).toEqual({ root: 48 + pitch, quality, velocity: 0.8 });
      input.noteOff(48 + pitch);
      expect(player.manualChord?.quality).toBe(quality);
    });
  }

  it('uses the leftmost twelve semitones even on a G-based controller', () => {
    const { input } = inputRig(55);
    expect(input.isChordKey(54)).toBe(false);
    for (let n = 55; n < 67; n++) expect(input.isChordKey(n)).toBe(true);
    expect(input.noteOn(67, 1)).toBe('lead');
  });

  it('uses the lowest root and counts white or black modifiers, in any arrival order', () => {
    const { input, player } = inputRig();
    input.noteOn(54, 0.3);
    input.noteOn(48, 0.8);
    expect(player.manualChord).toEqual({ root: 48, quality: 'min', velocity: 0.8 });
    input.noteOn(52, 0.5);
    expect(player.manualChord?.quality).toBe('dom7');
    input.noteOn(55, 0.5);
    input.noteOn(56, 0.5);
    expect(player.manualChord?.quality).toBe('min7');
    expect(input.noteOn(56, 1)).toBe('ignore');
  });

  it('does not turn a released seventh into a minor or major chord', () => {
    const { input, player } = inputRig();
    [48, 49, 51].forEach((n) => input.noteOn(n, 0.7));
    [49, 48, 51].forEach((n) => {
      input.noteOff(n);
      expect(player.manualChord?.quality).toBe('dom7');
    });
    expect(input.heldCount).toBe(0);
  });

  it('releases an unlatched chord only when the last finger lifts', () => {
    const { input, player } = inputRig(48, 32, false);
    input.noteOn(48, 0.7);
    input.noteOn(51, 0.5);
    input.noteOff(48);
    expect(player.manualChord?.quality).toBe('min');
    input.noteOff(51);
    expect(player.manualChord).toBeNull();
  });

  it('turning Hold off releases a latched chord, and changing quality revoices a held root', () => {
    const { input, player } = inputRig();
    input.noteOn(59, 0.4);
    input.configure(true, 'min7', true);
    expect(player.manualChord?.quality).toBe('min7');
    input.noteOff(59);
    input.configure(true, 'min7', false);
    expect(player.manualChord).toBeNull();
  });

  it.each([
    { count: 2, quality: 'min' },
    { count: 3, quality: 'dom7' },
    { count: 4, quality: 'min7' },
  ] as const)('preserves a held $count-key gesture when the selector changes', ({ count, quality }) => {
    const { input, player } = inputRig();
    input.configure(true, 'min', true);
    const notes = [48, 49, 51, 54].slice(0, count);
    notes.forEach((note) => input.noteOn(note, 0.7));
    player.setManualChord.mockClear();

    input.configure(true, 'maj', true);
    expect(player.manualChord).toEqual({ root: 48, quality, velocity: 0.7 });
    expect(player.setManualChord).not.toHaveBeenCalled();

    notes.forEach((note) => input.noteOff(note));
    expect(player.manualChord?.quality).toBe(quality);
    input.noteOn(59, 0.4);
    expect(player.manualChord).toEqual({ root: 59, quality: 'maj', velocity: 0.4 });
  });

  it('preserves the gesture while multiple fingers lift, then revoices a released latch', () => {
    const { input, player } = inputRig();
    [48, 49, 51, 54].forEach((note) => input.noteOn(note, 0.7));
    input.noteOff(54);
    input.noteOff(51);
    player.setManualChord.mockClear();

    input.configure(true, 'min', true);
    expect(player.manualChord?.quality).toBe('min7');
    expect(player.setManualChord).not.toHaveBeenCalled();

    input.noteOff(49);
    input.noteOff(48);
    input.configure(true, 'dom7', true);
    expect(player.manualChord).toEqual({ root: 48, quality: 'dom7', velocity: 0.7 });
    expect(player.setManualChord).toHaveBeenCalledOnce();
  });

  it('Stop ignores old fingers until they lift and lets a fresh chord begin', () => {
    const { input, player } = inputRig(48, 32, false);
    input.noteOn(48, 1);
    input.stop();
    expect(input.noteOn(48, 1)).toBe('ignore');
    input.noteOn(53, 1);
    input.noteOff(48);
    expect(player.manualChord?.root).toBe(53);
    input.noteOff(53);
    expect(player.manualChord).toBeNull();
  });

  it('keeps original lead and chord roles across a backing toggle', () => {
    const { input, player } = inputRig();
    input.noteOn(48, 1);
    input.noteOn(60, 1);
    input.configure(false, 'maj', true);
    expect(player.manualChord).toBeNull();
    expect(input.noteOn(48, 1)).toBe('ignore');
    expect(input.noteOff(48)).toBe('ignore');
    expect(input.noteOff(60)).toBe('lead');
    expect(input.noteOn(48, 1)).toBe('lead');
    input.configure(true, 'maj', true);
    expect(input.noteOff(48)).toBe('lead');
  });

  it('transposes a latch once and keeps stale releases out of the next gesture', () => {
    const { input, player } = inputRig();
    input.noteOn(48, 0.7);
    input.noteOn(49, 0.6);
    input.remap(60, 32);
    expect(player.manualChord).toEqual({ root: 60, quality: 'min', velocity: 0.7 });
    input.remap(60, 32);
    expect(player.manualChord?.root).toBe(60);
    input.noteOn(64, 1);
    input.noteOff(48);
    input.noteOff(49);
    expect(player.manualChord?.root).toBe(64);
    expect(player.manualChord?.quality).toBe('maj');
  });

  it('releases unlatched chords on remap and clears chords when calibration changes size', () => {
    const { input, player } = inputRig(48, 32, false);
    input.noteOn(48, 1);
    input.remap(60, 32);
    expect(player.manualChord).toBeNull();
    input.configure(true, 'maj', true);
    input.noteOn(62, 1);
    input.remap(60, 25);
    expect(player.manualChord).toBeNull();
  });

  it('leaves short mappings as melody and resets all gesture state', () => {
    const { input, player } = inputRig(48, 7);
    expect(input.active).toBe(false);
    expect(input.noteOn(48, 1)).toBe('lead');
    input.reset();
    expect(input.noteOn(48, 1)).toBe('lead');
    expect(player.manualChord).toBeNull();
  });
});

function bedRig() {
  const handles: { release: ReturnType<typeof vi.fn> }[] = [];
  const engine = {
    running: true, now: 0, settings: { bed: true }, bedVoice: 'warm',
    pad: vi.fn(), stopPads: vi.fn(), setBedAudible: vi.fn(),
    holdPad: vi.fn(() => {
      if (!engine.settings.bed || !engine.running) return null;
      const handle = { release: vi.fn() };
      handles.push(handle);
      return handle;
    }),
  };
  const music = new MusicState({ ...AURORA.music });
  music.setBpm(120);
  const bed = new ChordBed(engine as never, music);
  const tick = (seconds: number) => {
    engine.now += seconds;
    (bed as unknown as { schedule(): void }).schedule();
  };
  return { bed, music, engine, handles, tick };
}

afterEach(() => vi.useRealTimers());

describe('manual backing audio control', () => {
  it('follows only the active music state without accumulating listeners', () => {
    const { bed, music } = bedRig();
    const freestyle = new MusicState({ ...AURORA.music }, 'freestyleMusic');
    for (let i = 0; i < 10; i++) {
      bed.setMusic(freestyle);
      expect(music.bus.handlerCount).toBe(0);
      expect(freestyle.bus.handlerCount).toBe(2);
      bed.chordIndex = 2;
      music.setChoice('dorian');
      music.setBpm(80);
      expect(bed.chordIndex).toBe(2);
      freestyle.setChoice('ionian');
      freestyle.setBpm(140);
      expect(bed.chordIndex).toBe(0);
      expect(bed.groove.bpm).toBe(140);
      bed.setMusic(music);
      expect(music.bus.handlerCount).toBe(2);
      expect(freestyle.bus.handlerCount).toBe(0);
      expect(bed.groove.bpm).toBe(80);
    }
  });

  it('replaces Auto with silence until a chord is selected, and uses exact pitches', () => {
    const { bed, engine, tick } = bedRig();
    tick(0);
    expect(engine.pad).toHaveBeenCalled();
    engine.pad.mockClear();
    bed.setControlMode('manual');
    expect(engine.stopPads).toHaveBeenCalledOnce();
    tick(8);
    expect(engine.pad).not.toHaveBeenCalled();
    bed.setManualChord(48, 'min', 0.7);
    expect(engine.holdPad).toHaveBeenLastCalledWith([48, 51, 55], 0.7);
    tick(8);
    expect(engine.holdPad).toHaveBeenCalledOnce();
  });

  it('updates the chord immediately and releases only its previous backing handle', () => {
    const { bed, engine, handles } = bedRig();
    bed.setControlMode('manual');
    bed.setManualChord(48, 'maj', 0.5);
    bed.setManualChord(53, 'dom7', 0.8);
    expect(handles[0].release).toHaveBeenCalledOnce();
    expect(engine.holdPad).toHaveBeenLastCalledWith(chordNotes(53, 'dom7'), 0.8);
    bed.transposeManualChord(12);
    expect(engine.holdPad).toHaveBeenLastCalledWith(chordNotes(65, 'dom7'), 0.8);
  });

  it.each(['bed-harp', 'bed-felt-piano'])('repeats %s every two bars, with no catch-up burst', (voice) => {
    const { bed, engine, tick } = bedRig();
    engine.bedVoice = voice;
    bed.setControlMode('manual');
    bed.setManualMeter(3);
    bed.setManualChord(48, 'maj');
    tick(2.99);
    expect(engine.holdPad).toHaveBeenCalledOnce();
    tick(0.02);
    expect(engine.holdPad).toHaveBeenCalledTimes(2);
    tick(100);
    expect(engine.holdPad).toHaveBeenCalledTimes(3);
  });

  it('carries beat progress through tempo and meter changes', () => {
    const { bed, engine, music, tick } = bedRig();
    engine.bedVoice = 'bed-harp';
    bed.setControlMode('manual');
    bed.setManualChord(48, 'maj');
    tick(1); // two beats at 120
    music.setBpm(60);
    bed.setManualMeter(3); // four more beats to the repeat
    tick(3.99);
    expect(engine.holdPad).toHaveBeenCalledOnce();
    tick(0.02);
    expect(engine.holdPad).toHaveBeenCalledTimes(2);
  });

  it('preserves harmony when the scale changes and refreshes a changed instrument', () => {
    const { bed, engine, music, tick } = bedRig();
    bed.setControlMode('manual');
    bed.setManualChord(51, 'min7');
    music.setKey(7);
    expect(bed.manualChord?.root).toBe(51);
    expect(bed.manualChord?.quality).toBe('min7');
    engine.bedVoice = 'bed-harp';
    tick(0.04);
    expect(engine.holdPad).toHaveBeenCalledTimes(2);
    expect(engine.pad).not.toHaveBeenCalled();
  });

  it('honors mute, backing off, stop/resume, and returning to Auto', () => {
    vi.useFakeTimers();
    const { bed, engine, handles, tick } = bedRig();
    bed.setControlMode('manual');
    bed.start();
    bed.setManualChord(48, 'maj');
    engine.settings.bed = false;
    tick(0.04);
    expect(handles[0].release).toHaveBeenCalled();
    engine.settings.bed = true;
    tick(0.04);
    expect(engine.holdPad).toHaveBeenCalledTimes(2);
    bed.setEnabled(false);
    expect(bed.manualChord).toBeNull();
    bed.setEnabled(true);
    bed.setManualChord(48, 'maj');
    bed.stop();
    bed.start();
    tick(10);
    expect(bed.manualChord).toBeNull();
    expect(engine.pad).not.toHaveBeenCalled();
    bed.setControlMode('auto');
    tick(0.04);
    expect(engine.pad).toHaveBeenCalled();
    bed.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('folds overflowing upper chord tones without changing the root', () => {
    const { bed, engine } = bedRig();
    bed.setControlMode('manual');
    bed.setManualChord(125, 'dom7');
    expect(engine.holdPad).toHaveBeenLastCalledWith([125, 117, 120, 123], 0.7);
  });
});

describe('computer-keyboard releases after an octave shift', () => {
  it('releases the pitch from key-down, including releaseAll and duplicate piano keys', () => {
    let base = 48;
    const events: InputEvent[] = [];
    const kb = new KeyboardFallback({ baseNote: () => base, emit: (e) => events.push(e), shiftOctave: () => {} });
    const invoke = (kind: 'onDown' | 'onUp', code: string) =>
      (kb as unknown as Record<typeof kind, (e: KeyboardEvent) => void>)[kind]({
        code, repeat: false, preventDefault() {},
      } as KeyboardEvent);
    invoke('onDown', 'KeyZ');
    base = 60;
    invoke('onUp', 'KeyZ');
    expect(events.at(-1)).toMatchObject({ type: 'noteoff', note: 48 });
    invoke('onDown', 'KeyQ');
    invoke('onDown', 'Comma');
    invoke('onUp', 'KeyQ');
    expect(events.at(-1)?.type).toBe('noteon');
    base = 36;
    kb.releaseAll();
    expect(events.at(-1)).toMatchObject({ type: 'noteoff', note: 72 });
  });
});
