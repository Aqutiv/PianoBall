import { GameLoop } from '../core/loop';
import { load, save } from '../core/storage';
import { Stage } from '../render/stage';
import { DEFAULT_PALETTE, applyPalette } from '../render/theme';
import { InputHub } from '../midi/inputHub';
import { AudioEngine } from '../audio/engine';
import { ChordBed } from '../audio/bed';
import { wireGlobalControls } from '../audio/controls';
import { MusicState } from '../audio/musicState';
import { AURORA } from '../game/table/tables/aurora';
import { Hud } from '../ui/hud';
import { Overlay, type Screen } from '../ui/overlay';
import { FACTORIES, availableModes, type ModeInfo } from './registry';
import type { GameMode, GameModeId, ModeContext } from './mode';
import type { PlayTuneMode } from '../modes/playtune/playtune';

export interface ModeResult {
  title: string;
  lines: { label: string; value: string }[];
}

/**
 * The one thing that exists for the whole life of the page.
 *
 * It owns the canvas, the audio graph, the input hub and the loop, and lends
 * them to whichever mode is running. Modes come and go; nothing here does.
 */
export class Shell {
  readonly stage: Stage;
  readonly input = new InputHub();
  readonly audio = new AudioEngine();
  readonly music: MusicState;
  readonly bed: ChordBed;
  readonly hud: Hud;
  readonly overlay: Overlay;
  readonly loop: GameLoop;

  active: GameMode | null = null;
  modeId: GameModeId | null = null;
  /** Filled in when a mode finishes a run, for the results screen. */
  lastResult: ModeResult | null = null;

  private readonly built = new Map<GameModeId, GameMode>();
  private readonly ctx: ModeContext;
  private readonly canvas: HTMLCanvasElement;
  private readonly activePointers = new Map<number, number>();
  private frameAvg = 8;
  private qualityHeld = 0;

  constructor(canvas: HTMLCanvasElement, hudRoot: HTMLElement, overlayRoot: HTMLElement) {
    this.canvas = canvas;
    this.stage = new Stage(canvas);
    this.stage.palette = DEFAULT_PALETTE;
    applyPalette(DEFAULT_PALETTE);

    this.audio.setSettings(load('volumes', {}));
    this.music = new MusicState({ ...AURORA.music });
    this.bed = new ChordBed(this.audio, this.music);
    this.hud = new Hud(hudRoot);

    this.ctx = {
      stage: this.stage,
      input: this.input,
      audio: this.audio,
      bed: this.bed,
      music: this.music,
      hud: this.hud,
      openScreen: (s) => this.overlay.show(s),
      setResult: (r) => { this.lastResult = r; },
    };

    this.overlay = new Overlay(overlayRoot, this);

    // Respect the OS setting rather than waiting to be told.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.stage.quality.reducedMotion = true;
    }
    this.stage.quality = { ...this.stage.quality, ...load('quality', {}) };

    this.loop = new GameLoop({
      hz: 240,
      step: (dt) => this.active?.step(dt),
      draw: (alpha, frameDt) => this.draw(alpha, frameDt),
    });

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.wireAudioUnlock();
    this.wirePointer();
    this.wireKeys();
    this.input.keyboard.attach(window);
  }

  // ---------------------------------------------------------------- boot ---

  async boot(): Promise<void> {
    const status = await this.input.midi.init().catch(() => 'denied' as const);
    this.refreshStatus(status);
    this.refreshSound();
    this.input.midi.onDevicesChanged = () => {
      this.refreshStatus(this.input.midi.status);
      if (this.overlay.visible) this.overlay.show(this.overlay.screen);
    };
    // Something has to be playing itself behind the menu, or the first thing
    // the player sees is a black rectangle. Enter the mode without starting a
    // run: pinball idles in attract, the others simply idle.
    this.switchTo(this.lastMode ?? 'pinball');
    this.overlay.show('home');
    this.loop.start();
  }

  // --------------------------------------------------------------- modes ---

  get modes(): ModeInfo[] { return availableModes(); }

  /** Enter a mode, tearing the previous one down first. */
  switchTo(id: GameModeId): void {
    if (this.modeId === id && this.active) return;
    const factory = FACTORIES[id];
    if (!factory) return;

    this.active?.exit();
    this.active = null;

    // Whatever the last mode left behind stops here.
    this.input.releaseAll();
    this.audio.allNotesOff();
    this.bed.reset();
    this.stage.reset();
    this.hud.clearPanels();
    this.hud.clearBanner();

    let mode = this.built.get(id);
    if (!mode) { mode = factory(this.ctx); this.built.set(id, mode); }
    this.active = mode;
    this.modeId = id;
    save('lastMode', { id });
    mode.enter();
    this.refreshStatus(this.input.midi.status);
  }

  /** Start a mode from the menu: enter it, then begin a fresh run. */
  play(id: GameModeId): void {
    this.overlay.hide();
    void this.startAudio();
    this.switchTo(id);
    this.restartMode();
  }

  restartMode(): void {
    const mode = this.active as GameMode & { newGame?: () => void };
    mode?.newGame?.();
  }

  goHome(): void {
    this.active?.pause?.();
    this.overlay.show('home');
  }

  /** Step out of play without leaving the mode. Used when focus is lost. */
  private suspend(): void {
    if (!this.modeId || this.overlay.visible || !this.active?.pause) return;
    this.active.pause();
    this.overlay.show('paused');
  }

  resumeMode(): void {
    this.overlay.hide();
    this.active?.resume?.();
  }

  /** The keybed range changed; every built mode has to follow. */
  remapKeys(): void {
    for (const mode of this.built.values()) {
      (mode as GameMode & { remap?: () => void }).remap?.();
    }
  }

  /** The PlayTune mode, once it has been entered. The song list needs it. */
  get playtune(): PlayTuneMode | null {
    return (this.built.get('playtune') as PlayTuneMode | undefined) ?? null;
  }

  get lastMode(): GameModeId | null {
    const saved = load<{ id: string }>('lastMode', { id: '' }).id;
    return this.modes.some((m) => m.id === saved) ? saved as GameModeId : null;
  }

  // ---------------------------------------------------------------- loop ---

  private draw(alpha: number, frameDt: number): void {
    this.loop.timeScale = this.active?.timeScale ?? 1;
    this.adaptQuality(frameDt);
    this.active?.draw(alpha, frameDt);
    this.active?.hud();
    this.hud.update({
      fps: this.loop.stats.fps,
      stepMs: this.loop.stats.stepMs,
      drawMs: this.loop.stats.drawMs,
      extra: this.active?.debugLines?.(),
    });
    if (this.overlay.visible) this.overlay.update();
    // Typing in the settings panel must not play the piano.
    this.input.keyboard.enabled = !this.overlay.visible;
  }

  /**
   * Adaptive quality.
   *
   * Rather than guessing what the machine can do, watch what it actually
   * manages and shed the expensive effects only when the frame budget is
   * genuinely under pressure.
   */
  private adaptQuality(dt: number): void {
    const s = this.loop.stats;
    const q = this.stage.quality;
    this.frameAvg += ((s.stepMs + s.drawMs) - this.frameAvg) * Math.min(1, dt * 4);
    this.qualityHeld -= dt;
    if (this.qualityHeld > 0) return;
    if (this.frameAvg > 13 && q.bloom) {
      q.bloom = false;
      this.stage.particles.budget = 500;
      this.qualityHeld = 3;
    } else if (this.frameAvg > 13 && q.shadows) {
      q.shadows = false;
      this.qualityHeld = 3;
    } else if (this.frameAvg < 7 && !q.bloom) {
      q.bloom = true;
      q.shadows = true;
      this.stage.particles.budget = 1400;
      this.qualityHeld = 6;
    }
  }

  private resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.stage.resize(window.innerWidth, window.innerHeight, dpr);
  }

  // --------------------------------------------------------------- audio ---

  /**
   * Create or resume the audio context. Safe to call on every interaction —
   * the browser decides when it is allowed to take.
   */
  async startAudio(): Promise<boolean> {
    const ok = await this.audio.start();
    if (ok) this.bed.start();
    this.refreshSound();
    return ok;
  }

  /**
   * Browsers only let a page make sound after a real user gesture, and a MIDI
   * message is not one. Rather than relying on the player finding a button,
   * every interaction of any kind retries the unlock, and the HUD says plainly
   * when sound is still off.
   */
  private wireAudioUnlock(): void {
    const unlock = () => { if (!this.audio.running) void this.startAudio(); };
    for (const evt of ['pointerdown', 'keydown', 'touchstart'] as const) {
      window.addEventListener(evt, unlock, { capture: true, passive: true });
    }
    // Chrome suspends the context when the tab is hidden or the output device
    // changes; coming back should not leave the game mute.
    //
    // A hidden tab also stops requestAnimationFrame while the audio clock keeps
    // running, so anything timed against the audio clock would come back to a
    // run that carried on without it. Pause instead of returning to a ruin.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.suspend();
      else unlock();
    });
    window.addEventListener('blur', () => this.suspend());
    this.audio.onStateChange = () => this.refreshSound();

    // Controller messages that belong to the app rather than to a mode.
    wireGlobalControls(this.input, this.audio);

    // Most controllers transpose silently when their octave buttons are used, so
    // a note arriving outside the mapped window re-latches it. That is a fact
    // about the hardware rather than about any one mode, so it lives here.
    this.input.on((e) => {
      if (e.type === 'noteon' && this.input.mapping.observe(e.note)) this.remapKeys();
    });
  }

  refreshSound(): void {
    this.hud.setSound(this.audio.running);
  }

  refreshStatus(status: string): void {
    const midi = this.input.midi;
    const dev = midi.devices.find((d) => d.id === midi.selectedId);
    const keys = this.input.mapping.settings.count;
    if (status === 'ready' && dev) {
      this.hud.setStatus(`${dev.name} · ${keys} keys`, 'ok');
    } else if (status === 'ready') {
      this.hud.setStatus('No MIDI device — use the computer keyboard (Z–M, Q–P)', 'warn');
    } else if (status === 'unsupported') {
      this.hud.setStatus('No Web MIDI in this browser — computer keyboard active', 'warn');
    } else {
      this.hud.setStatus('MIDI unavailable — computer keyboard active', 'err');
    }
  }

  // --------------------------------------------------------------- input ---

  private wirePointer(): void {
    const canvas = this.canvas;

    canvas.addEventListener('pointerdown', (e) => {
      if (this.overlay.visible || !this.active?.pointerDown) return;
      const rect = canvas.getBoundingClientRect();
      const t = this.stage.cam.unproject(e.clientX - rect.left, e.clientY - rect.top, 26);
      const note = this.active.pointerDown(t.x, t.y);
      if (note === null) return;
      canvas.setPointerCapture(e.pointerId);
      this.activePointers.set(e.pointerId, note);
      e.preventDefault();
    });

    const release = (e: PointerEvent) => {
      const note = this.activePointers.get(e.pointerId);
      if (note === undefined) return;
      this.activePointers.delete(e.pointerId);
      this.active?.pointerUp?.(note);
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  }

  private wireKeys(): void {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3') { this.hud.showFps = !this.hud.showFps; e.preventDefault(); }
      if (e.code === 'Escape') { this.onEscape(); e.preventDefault(); }
      if (this.overlay.visible) this.overlay.onKey(e);
    });
  }

  private onEscape(): void {
    // Escape is a step backwards: out of a sub-screen, out of play, out to the
    // menu — never a shortcut into settings from somewhere you can't return to.
    const screen = this.overlay.screen;
    if (screen === 'settings' || screen === 'calibrate') {
      this.overlay.show(this.modeId ? 'paused' : 'home');
    } else if (screen === 'paused') {
      this.resumeMode();
    } else if (screen === null) {
      if (this.modeId) { this.active?.pause?.(); this.overlay.show('paused'); }
      else this.overlay.show('home');
    } else {
      this.overlay.show('home');
    }
  }

  openScreen(screen: Screen): void { this.overlay.show(screen); }
}
