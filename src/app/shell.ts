import { GameLoop } from '../core/loop';
import { load, save } from '../core/storage';
import { Stage } from '../render/stage';
import { applyTheme, type Theme } from '../render/theme';
import { currentTheme, resetThemeSettings, setThemeId } from '../render/themeSettings';
import { InputHub } from '../midi/inputHub';
import { AudioEngine } from '../audio/engine';
import { ChordBed } from '../audio/bed';
import { makeRng } from '../audio/shaping';
import { wireGlobalControls } from '../audio/controls';
import { MusicState } from '../audio/musicState';
import { resetFreestyleSettings } from '../modes/freestyle/settings';
import { resetRhythmSettings } from '../modes/freestyle/rhythmSettings';
import { resetPlayTuneSettings } from '../modes/playtune/settings';
import { resetPinballSettings } from '../modes/pinball/settings';
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
  /**
   * True once the player has actually chosen a mode.
   *
   * A mode is also entered at boot purely so the menu has something behind it,
   * which is not the same thing: without this distinction, Escape on the home
   * screen offers to "resume" a game nobody started.
   */
  playing = false;
  /**
   * Frozen behind a menu. The mode still draws — the table should be visible
   * under the pause panel — but nothing simulates, so a ball cannot drain and a
   * tune cannot run on while the player is reading.
   */
  suspended = false;
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
    this.stage.theme = currentTheme();
    applyTheme(this.stage.theme);

    this.music = new MusicState({ ...AURORA.music });
    this.bed = new ChordBed(this.audio, this.music);
    // The bed is played by a hand, not a sequencer: a few milliseconds of
    // drift, a tenth of a gain, chords rolled from the bottom and a lean on
    // the bar line. Seeded from the clock, so no two sessions comp alike.
    this.bed.feel = { rng: makeRng(Date.now() >>> 0), jitter: 0.01, gain: 0.1, roll: 0.018, accent: 1.08 };
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

    this.loop = new GameLoop({
      hz: 240,
      step: (dt) => { if (!this.suspended) this.active?.step(dt); },
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
    // Re-render only if the player is still looking at it: MIDI init is async,
    // and by the time it returns they may already have opened settings.
    if (this.overlay.screen === 'home') this.overlay.show('home');
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
    // Including a chord still in the air. `reset` only moves the progression
    // on; the pads already sounding belong to the mode that scheduled them,
    // and since Freestyle can pick its own they are no longer a timbre the
    // next mode would have chosen.
    this.audio.stopPads();
    this.bed.reset();
    this.stage.reset();
    this.hud.clearPanels();
    this.hud.clearBanner();

    let mode = this.built.get(id);
    if (!mode) { mode = factory(this.ctx); this.built.set(id, mode); }
    this.active = mode;
    this.modeId = id;
    this.suspended = false;
    save('lastMode', { id });
    mode.enter();
    this.refreshStatus(this.input.midi.status);
  }

  /** Start a mode from the menu: enter it, then begin a fresh run. */
  play(id: GameModeId): void {
    this.overlay.hide();
    void this.startAudio();
    this.switchTo(id);
    this.playing = true;
    this.suspended = false;
    this.restartMode();
  }

  /**
   * A fresh run of the mode on screen.
   *
   * Reached from behind the pause panel and from the home screen as well as
   * from the game-over card, and the first two have suspended the mode. A new
   * game is the player asking to play, so the suspension lifts here; each mode's
   * `newGame` is responsible for being playable after it, since `resume` is
   * not called on this path — PlayTune's would restart the tune that was
   * interrupted, which is the opposite of what was asked.
   */
  restartMode(): void {
    this.suspended = false;
    const mode = this.active as GameMode & { newGame?: () => void };
    mode?.newGame?.();
  }

  goHome(): void {
    this.pauseActive();
    this.playing = false;
    this.overlay.show('home');
  }

  /** Freeze the running mode. Safe to call when nothing is running. */
  pauseActive(): void {
    if (this.suspended) return;
    this.suspended = true;
    this.active?.pause?.();
  }

  /** Step out of play when focus is lost, rather than playing on unattended. */
  private suspend(): void {
    if (!this.playing || this.overlay.visible) return;
    this.pauseActive();
    this.overlay.show('paused');
  }

  resumeMode(): void {
    this.overlay.hide();
  }

  /**
   * Nothing is in front of the board any more, so whatever froze it is over.
   *
   * Driven by the overlay closing rather than by each button that closes it.
   * "Restart" on the pause screen, "Play again" on the results and picking a
   * tune from the song list all hid the panel and began a run *without* going
   * through `resumeMode`, so the shell stayed suspended: `step` was never
   * called again and the run played out on a board frozen at the instant it
   * was paused. Every key pressed after that lit and stayed lit — the glow
   * fades on the deck's own clock, and that clock had stopped — which is what
   * left blooms sitting over the keybed across one run and into the next.
   */
  unsuspend(): void {
    if (!this.suspended) return;
    this.suspended = false;
    this.active?.resume?.();
  }

  /**
   * Put every remembered preference back to its default.
   *
   * Scores and unlocked tunes are earned rather than configured, so they are
   * deliberately left alone — as is the separate reset on the PlayTune section.
   */
  resetSettings(): void {
    this.audio.resetSettings();
    this.input.mapping.resetSettings();
    this.input.resetVelocitySettings();
    this.input.midi.resetSettings();
    this.music.resetSettings();
    resetFreestyleSettings();
    resetRhythmSettings();
    resetPlayTuneSettings();
    resetPinballSettings();
    resetThemeSettings();
    this.setTheme(currentTheme());
    this.stage.resetSettings();
    this.remapKeys();
    this.applyModeSettings();
    this.refreshStatus(this.input.midi.status);
  }

  /**
   * Tell the running mode its preferences moved.
   *
   * Nothing a mode owns is re-read until the mode is entered again, so the
   * one that is running has to be told — after a reset, and after any single
   * toggle whose effect the player expects to hear straight away.
   */
  applyModeSettings(): void {
    (this.active as (GameMode & { applySettings?: () => void }) | null)?.applySettings?.();
  }

  /**
   * Switch look, live.
   *
   * The static playfield layer is baked once and blitted every frame, so a new
   * theme has to invalidate it or the old colours stay on screen until the
   * viewport happens to change. `Stage.needsBake` folds the theme id into its
   * key, so the next frame re-bakes on its own.
   */
  setTheme(theme: Theme): void {
    setThemeId(theme.id);
    this.stage.theme = theme;
    applyTheme(theme);
    this.stage.invalidate();
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
    // Typing in a panel — or arrowing through a control in the HUD — must not
    // play the piano or bend the table underneath it. Anything still held when
    // the keyboard loses its claim is let go on the way out, so a note cannot
    // be stranded on the far side of the switch.
    const playable = !this.overlay.visible && !this.hudHasFocus();
    if (!playable && this.input.keyboard.enabled) this.input.keyboard.releaseAll();
    this.input.keyboard.enabled = playable;
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
    const want = this.stage.preferredQuality;
    this.frameAvg += ((s.stepMs + s.drawMs) - this.frameAvg) * Math.min(1, dt * 4);
    this.qualityHeld -= dt;
    if (this.qualityHeld > 0) return;
    if (this.frameAvg > 13 && q.bloom) {
      q.bloom = false;
      this.stage.particles.budget = 500;
      this.qualityHeld = 3;
      // The sound sheds its own expensive effects on the same signal.
      this.audio.setLite(true);
    } else if (this.frameAvg > 13 && q.shadows) {
      q.shadows = false;
      this.qualityHeld = 3;
      // Bloom may already be off by choice, which makes this the first
      // thing shed: the sound has to follow from here too.
      this.audio.setLite(true);
    } else if (this.frameAvg < 7
      && (q.bloom !== want.bloom || q.shadows !== want.shadows)) {
      q.bloom = want.bloom;
      q.shadows = want.shadows;
      this.stage.particles.budget = want.particles;
      this.qualityHeld = 6;
      this.audio.setLite(false);
    }
  }

  /** True while the keyboard belongs to an on-screen control rather than the piano. */
  private hudHasFocus(): boolean {
    const el = document.activeElement;
    return el !== null && el !== document.body && this.hud.root.contains(el);
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
    if (ok && this.bed.enabled) this.bed.start();
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
      // Backspace is "from the top again". Only while the board is the thing in
      // front of the player: behind a menu it belongs to whatever has focus, and
      // in a text field it is still an erase. The browser's own back-navigation
      // is given up either way, but only when a mode actually took the key.
      //
      // One restart per physical press: held past the OS repeat delay, every
      // repeat would reset the transport again, so the count-in could never
      // reach the first bar and any note under a finger would be cut each time.
      if (e.code === 'Backspace' && !e.repeat
        && !this.overlay.visible && !this.hudHasFocus()) {
        if (this.active?.restart?.()) e.preventDefault();
      }
      if (this.overlay.visible) this.overlay.onKey(e);
    });
  }

  private onEscape(): void {
    // Escape is a step backwards: out of a sub-screen, out of play, out to the
    // menu — never a shortcut into settings from somewhere you can't return to.
    const screen = this.overlay.screen;
    if (screen === 'settings' || screen === 'calibrate') {
      this.overlay.back();
    } else if (screen === 'paused') {
      this.resumeMode();
    } else if (screen === null) {
      if (this.playing) { this.pauseActive(); this.overlay.show('paused'); }
      else this.overlay.show('home');
    } else {
      this.overlay.show('home');
    }
  }

  openScreen(screen: Screen): void { this.overlay.show(screen); }
}
