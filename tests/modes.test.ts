import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game';
import { AURORA } from '../src/game/table/tables/aurora';
import { InputHub } from '../src/midi/inputHub';
import { AudioEngine } from '../src/audio/engine';
import { MusicState } from '../src/audio/musicState';
import { ChordBed } from '../src/audio/bed';
import { PinballAudio } from '../src/modes/pinball/audio';
import { ModeBase, type ModeContext } from '../src/app/mode';
import { PlayTuneMode } from '../src/modes/playtune/playtune';
import { DEFAULT_BED_VOICE, DEFAULT_LEAD_VOICE } from '../src/audio/voices';
import type { Stage } from '../src/render/stage';
import type { Hud } from '../src/ui/hud';

/**
 * Nothing in this codebase used to be torn down, because nothing was ever left.
 * With three modes sharing one input hub and one audio graph, a subscription
 * that outlives its mode keeps playing after the player has walked away — so
 * the contract is asserted rather than trusted.
 */
describe('mode teardown', () => {
  function harness() {
    const input = new InputHub();
    const engine = new AudioEngine();
    const music = new MusicState({ ...AURORA.music });
    const bed = new ChordBed(engine, music);
    const game = new Game(input, AURORA, music);
    return { input, engine, music, bed, game };
  }

  it('leaves no bus handlers behind after repeated attach/detach', () => {
    const { engine, bed, game } = harness();
    const audio = new PinballAudio(engine, bed, game);
    const baseline = game.bus.handlerCount;

    for (let i = 0; i < 10; i++) {
      audio.attach();
      expect(game.bus.handlerCount).toBeGreaterThan(baseline);
      audio.detach();
      expect(game.bus.handlerCount).toBe(baseline);
    }
  });

  it('keeps the input hub subscriber count flat across cycles', () => {
    const { input, engine, bed, game } = harness();
    const audio = new PinballAudio(engine, bed, game);
    const baseline = input.listenerCount;

    for (let i = 0; i < 10; i++) { audio.attach(); audio.detach(); }

    expect(input.listenerCount).toBe(baseline);
  });

  it('a detached director no longer reacts to the game', () => {
    const { engine, bed, game } = harness();
    const audio = new PinballAudio(engine, bed, game);
    audio.attach();
    audio.detach();

    // The bed's groove is reset on every drain while attached; detached it
    // must be left alone.
    bed.groove.streak = 4;
    game.bus.emit('drain', { x: 0, y: 0, ballId: 1, saved: false });

    expect(bed.groove.streak).toBe(4);
  });
});

/**
 * A tune's instruments are the tune's, the way Freestyle's are Freestyle's.
 *
 * `setLeadVoice` and `setBedVoice` are global engine state, so a mode that
 * picks one and walks away leaves the next mode playing it — which is how a
 * pipe organ ends up on a pinball table.
 */
describe('playtune instruments', () => {
  /** Just enough panel for `TuneHud` to mount into; nothing here is asserted. */
  function fakeHud(): Hud {
    const node = { textContent: '', innerHTML: '', style: {} };
    const panel = () => ({ innerHTML: '', querySelector: () => node });
    return {
      left: panel(), right: panel(),
      banner: () => {}, clearPanels: () => {},
    } as unknown as Hud;
  }

  function playtune() {
    const input = new InputHub();
    const engine = new AudioEngine();
    const music = new MusicState({ ...AURORA.music });
    const bed = new ChordBed(engine, music);
    // The mode never draws in this test, so the camera is only ever configured.
    const stage = {
      cam: { configure: () => {} }, resize: () => {},
      cssW: 800, cssH: 600, dpr: 1,
    } as unknown as Stage;
    const ctx: ModeContext = {
      stage, input, audio: engine, bed, music, hud: fakeHud(),
      openScreen: () => {}, setResult: () => {},
    };
    return { mode: new PlayTuneMode(ctx), engine };
  }

  it('plays a tune on the instruments it names', () => {
    const { mode, engine } = playtune();
    mode.enter();
    expect(engine.leadVoice).toBe(DEFAULT_LEAD_VOICE);

    expect(mode.start('fur-elise')).toBe(true);
    expect(engine.leadVoice).toBe('felt-piano');
    expect(engine.bedVoice).toBe('bed-felt-piano');
    mode.exit();
  });

  it('leaves the app its own sound on a tune that names none', () => {
    const { mode, engine } = playtune();
    mode.enter();
    expect(mode.start('first-light')).toBe(true);

    expect(engine.leadVoice).toBe(DEFAULT_LEAD_VOICE);
    expect(engine.bedVoice).toBe(DEFAULT_BED_VOICE);
    mode.exit();
  });

  it('hands the instruments back on the way out', () => {
    const { mode, engine } = playtune();
    mode.enter();
    mode.start('fur-elise');
    mode.exit();

    expect(engine.leadVoice).toBe(DEFAULT_LEAD_VOICE);
    expect(engine.bedVoice).toBe(DEFAULT_BED_VOICE);
  });

  it('swaps them when one tune follows another', () => {
    const { mode, engine } = playtune();
    mode.enter();
    mode.start('fur-elise');
    mode.start('twinkle');

    expect(engine.leadVoice).toBe('music-box');
    expect(engine.bedVoice).toBe('bed-harp');
    mode.exit();
  });
});

describe('ModeBase subscriptions', () => {
  class Probe extends ModeBase {
    add(off: () => void): void { this.track(off); }
    drop(): void { this.release(); }
  }

  it('runs every tracked closure exactly once and forgets them', () => {
    const probe = new Probe();
    let calls = 0;
    for (let i = 0; i < 5; i++) probe.add(() => { calls++; });

    expect(probe.tracked).toBe(5);
    probe.drop();
    expect(calls).toBe(5);
    expect(probe.tracked).toBe(0);

    probe.drop();
    expect(calls).toBe(5);
  });
});
