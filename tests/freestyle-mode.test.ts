import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FreestyleMode } from '../src/modes/freestyle/freestyle';
import { AudioEngine } from '../src/audio/engine';
import { ChordBed } from '../src/audio/bed';
import { MusicState } from '../src/audio/musicState';
import { InputHub } from '../src/midi/inputHub';
import { AURORA } from '../src/game/table/tables/aurora';
import type { ModeContext } from '../src/app/mode';
import { DEFAULT_BED_VOICE, DEFAULT_LEAD_VOICE } from '../src/audio/voices';
import { resetFreestyleSettings, setFreestyleSettings } from '../src/modes/freestyle/settings';

vi.mock('../src/modes/freestyle/hud', () => ({
  FreestyleHud: class { mount() {} sync() {} update() {} closeHelp() {} destroy() {} },
}));
vi.mock('../src/modes/freestyle/field', () => ({
  Field: class {
    chordName: string | null = null;
    reset() {} noteOn() {} noteOff() {} onBeat() {}
    setChord(name: string | null) { this.chordName = name; }
  },
}));

function rig() {
  const input = new InputHub();
  input.mapping.settings = { baseNote: 48, count: 32, autoLatch: true };
  const audio = new AudioEngine();
  const music = new MusicState({ ...AURORA.music });
  const bed = new ChordBed(audio, music);
  const stage = {
    cam: { configure() {} }, resize() {}, cssW: 800, cssH: 600, dpr: 1,
    logNote: vi.fn(), endNote: vi.fn(),
  };
  const ctx = { input, audio, music, bed, stage,
    hud: { clearPanels() {} }, openScreen() {}, setResult() {},
  } as unknown as ModeContext;
  const mode = new FreestyleMode(ctx);
  const on = vi.spyOn(audio, 'noteOn');
  const off = vi.spyOn(audio, 'noteOff');
  // The shell observes hardware notes before the mode receives them.
  input.on((e) => { if (e.type === 'noteon' && input.mapping.observe(e.note)) mode.remap(); });
  return { input, audio, music, bed, stage, mode, on, off };
}

beforeEach(() => {
  vi.useFakeTimers();
  resetFreestyleSettings();
  setFreestyleSettings({ bed: true, bedMode: 'manual' });
});
afterEach(() => { vi.useRealTimers(); resetFreestyleSettings(); });

describe('Freestyle mode integration', () => {
  it('guides scale notes only during Auto backing, with a stronger tonic', () => {
    const r = rig();
    r.music.setKey(0); r.music.setChoice('ionian');
    const highlight = (n: number) => (r.mode as unknown as { highlight(n: number): number }).highlight(n);
    setFreestyleSettings({ bed: true, bedMode: 'auto' });
    expect(highlight(48)).toBeGreaterThan(highlight(50));
    expect(highlight(50)).toBeGreaterThan(0.09);
    expect(highlight(49)).toBe(0);
    setFreestyleSettings({ bedMode: 'manual' });
    expect(highlight(48)).toBe(0);
    setFreestyleSettings({ bedMode: 'auto', bed: false });
    expect(highlight(48)).toBe(0);
  });

  it('routes chord switches away from lead audio and visuals, including their releases', () => {
    const r = rig();
    r.mode.enter(); r.mode.newGame();
    r.input.press(48, 0.7);
    r.input.press(49, 0.7);
    r.input.press(60, 0.8);
    expect(r.on).toHaveBeenCalledTimes(1);
    expect(r.on.mock.calls[0][0]).toBe(60);
    expect(r.stage.logNote).toHaveBeenCalledTimes(1);
    r.input.release(48);
    r.input.release(49);
    expect(r.off).not.toHaveBeenCalled();
    expect(r.bed.manualChord?.quality).toBe('min');
    r.input.release(60);
    expect(r.off).toHaveBeenCalledWith(60);
    r.mode.exit(); r.bed.stop();
  });

  it('classifies an auto-latching note against the new range before playing it', () => {
    const r = rig();
    r.mode.enter(); r.mode.newGame();
    r.input.press(48, 0.7); r.input.release(48);
    r.input.press(36, 0.7); // detects octave down; this press itself is a chord
    expect(r.input.mapping.low).toBe(36);
    expect(r.bed.manualChord?.root).toBe(36);
    expect(r.on).not.toHaveBeenCalled();
    r.input.release(36);
    r.input.press(72, 0.7); // detects octave up; a high melody note
    expect(r.input.mapping.low).toBe(48);
    expect(r.bed.manualChord?.root).toBe(48);
    expect(r.on.mock.calls.at(-1)?.[0]).toBe(72);
    r.mode.exit(); r.bed.stop();
  });

  it('keeps a held melody releasable after remapping, and restores full lead range when off', () => {
    const r = rig();
    r.mode.enter(); r.mode.newGame();
    r.input.press(60, 0.8);
    r.input.mapping.shiftOctave(1); r.mode.remap();
    r.input.release(60);
    expect(r.off).toHaveBeenCalledWith(60);
    setFreestyleSettings({ bed: false });
    r.mode.applyBed();
    r.input.press(60, 0.8);
    expect(r.on).toHaveBeenCalledTimes(2);
    expect(r.bed.manualChord).toBeNull();
    r.mode.exit(); r.bed.stop();
  });

  it('starts and resumes Manual empty, suppresses input behind menus, and resets on restart', () => {
    const r = rig();
    r.mode.enter();
    r.input.press(48, 0.7);
    expect(r.bed.manualChord).toBeNull();
    r.input.release(48);
    r.mode.newGame();
    r.input.press(48, 0.7);
    r.mode.pause(); r.input.releaseAll(); r.audio.hush(); r.bed.stop();
    r.input.press(50, 0.7);
    expect(r.bed.manualChord).toBeNull();
    r.input.release(50);
    r.mode.resume(); r.bed.start();
    expect(r.bed.manualChord).toBeNull();
    r.input.press(48, 0.7);
    r.mode.restart();
    expect(r.bed.manualChord).toBeNull();
    r.mode.exit(); r.bed.stop();
  });

  it('wakes the scheduler when Backing is enabled after resuming with it off', () => {
    const r = rig();
    vi.spyOn(r.audio, 'running', 'get').mockReturnValue(true);
    const pads = vi.spyOn(r.audio, 'pad').mockImplementation(() => {});
    r.mode.enter(); r.mode.newGame();
    setFreestyleSettings({ bed: false });
    r.mode.applyBed();
    r.mode.pause(); r.bed.stop();
    r.mode.resume();
    expect(r.bed.running).toBe(false);
    setFreestyleSettings({ bed: true, bedMode: 'manual' });
    r.mode.applyBed();
    expect(r.bed.running).toBe(true);
    r.input.press(48, 0.7); r.input.release(48);
    expect(r.bed.manualChord).not.toBeNull();
    setFreestyleSettings({ bedMode: 'auto' });
    r.mode.applyBed();
    vi.advanceTimersByTime(40);
    expect(r.bed.manualChord).toBeNull();
    expect(pads).toHaveBeenCalled();
    r.mode.pause(); r.bed.stop();
    r.mode.applyBed();
    expect(r.bed.running).toBe(false);
    r.mode.exit(); r.bed.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears backing on settings reset and restores defaults on exit without leaking subscribers', () => {
    const r = rig();
    const listeners = r.input.listenerCount;
    for (let i = 0; i < 10; i++) {
      setFreestyleSettings({ bed: true, bedMode: 'manual', voiceId: 'harp', bedVoiceId: 'bed-harp' });
      r.mode.enter(); r.mode.newGame();
      r.input.press(48, 0.7); r.input.release(48);
      resetFreestyleSettings(); r.mode.applySettings();
      expect(r.bed.manualChord).toBeNull();
      r.mode.exit();
      expect(r.input.listenerCount).toBe(listeners);
      expect(r.mode.tracked).toBe(0);
      expect(r.audio.bedVoice).toBe(DEFAULT_BED_VOICE);
      expect(r.audio.leadVoice).toBe(DEFAULT_LEAD_VOICE);
      expect(r.bed.controlMode).toBe('auto');
    }
    r.bed.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
