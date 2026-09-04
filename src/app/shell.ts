import { GameLoop } from '../core/loop';
import { load, save } from '../core/storage';
import { Stage, backingDensity } from '../render/stage';
import { LITE_AUDIO_RUNG, MAX_RUNG, derive, rungLabel } from '../render/tiers';
import { readDeviceHints, seedRung } from '../render/deviceHint';
import { Adaptive } from './adaptive';
import { PRESET_RUNG, perfSettings, resetPerfSettings, setPerfSettings,
  type GraphicsPreset, type SoundPreset } from '../render/perfSettings';
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

/**
 * How often the table behind an open panel is repainted, in seconds.
 *
 * Thirty a second: half the work on a sixty-hertz display and a fifth of it on
 * a hundred-and-forty-four, for motion that is already being blurred by seven
 * pixels before anyone sees it.
 */
const IDLE_FRAME = 1 / 30;

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
  /**
   * Whether the window is the one being played.
   *
   * `blur` and `visibilitychange` both fire for a single switch away, and
   * `focus` can arrive for a window that never lost it, so the transition is
   * tracked rather than inferred: coming back puts sound down before opening
   * the master, and doing that to a window that was never away would cut the
   * menu's bed off mid-chord.
   */
  private focused = true;
  /** Filled in when a mode finishes a run, for the results screen. */
  lastResult: ModeResult | null = null;

  private readonly built = new Map<GameModeId, GameMode>();
  private readonly ctx: ModeContext;
  private readonly canvas: HTMLCanvasElement;
  private readonly activePointers = new Map<number, number>();
  /** When to give something up, and when to take it back. See `adaptive.ts`. */
  private readonly adaptive = new Adaptive();
  /** Pending coalesced resize, if any. See `queueResize`. */
  private resizeRaf = 0;
  /** Time owed to the backdrop since it was last drawn. See `draw`. */
  private idleDt = 0;

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
    this.seedRung();
    window.addEventListener('resize', () => this.queueResize());
    this.wireAudioUnlock();
    this.wirePointer();
    this.wireKeys();
    this.input.keyboard.attach(window);
  }

  /**
   * Where to start the ladder on a machine that has never run this before.
   *
   * The measured controller is the real answer and is only a few seconds
   * behind; this exists so a weak machine does not spend those seconds
   * stuttering through the home screen before anything has been shed. It is
   * capped well short of the resolution rungs, because guessing a capable
   * machine into a soft picture is a worse first impression than the stutter.
   *
   * Only ever on a genuinely first run. Once the player has a stored quality
   * setting -- which they get the moment they touch anything in Display, and
   * which the controller does not write -- their choice stands, and a guess
   * from a coarse thread count has no business overruling it.
   */
  private seedRung(): void {
    // Whatever the sound was left on, whether or not the ladder moves below.
    // It used to be applied only as a side effect of `shedTo`, so a stored
    // Lite started as Full on a capable machine, and a stored Full started as
    // Lite on one reporting four threads, until something happened to move the
    // rung.
    this.applySoundPreset();

    // A pinned preset is a decision, and it has to be put back on the ladder
    // at startup or the panel says Low while the picture is High -- the
    // controller will not move it afterwards, precisely because it is pinned.
    const preset = perfSettings().graphics;
    if (preset !== 'auto') { this.shedTo(PRESET_RUNG[preset], 0); return; }

    // Once, ever, and recorded as such. Whatever the controller settled on
    // last session is a measurement of this machine; the hint is a guess about
    // it, and a guess does not get to overrule a measurement every morning.
    if (perfSettings().seeded) return;
    setPerfSettings({ seeded: true });
    const rung = seedRung(readDeviceHints(this.stage.cssW * this.stage.cssH * this.stage.dpr * this.stage.dpr));
    if (rung > 0) this.shedTo(rung, 6);
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

    // A new mode is a new workload, so what the ladder learned about the old
    // one no longer applies. Without this, a floor earned during a heavy
    // multiball followed the player into Freestyle and held it permanently
    // degraded with both signals showing plenty of room.
    this.forgetMeasurements();

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
    // `resume` is not called on this path, so the bed a pause silenced has to
    // be picked up here as well.
    this.wakeBed();
  }

  goHome(): void {
    this.pauseActive();
    this.playing = false;
    // Reached from the pause panel as well as from a finished run, and the
    // panel silenced the bed on the way in. The menu is not a pause: it has a
    // bed under it, the way it has one at boot.
    this.wakeBed();
    this.overlay.show('home');
  }

  /** Freeze the running mode. Safe to call when nothing is running. */
  pauseActive(): void {
    if (this.suspended) return;
    this.suspended = true;
    this.active?.pause?.();
  }

  /**
   * Step out of play, behind the pause panel: Escape, or the window losing
   * focus rather than playing on unattended.
   *
   * The one place the panel comes up, so both ways in leave the same silence
   * behind them — which is the difference between this and `pauseActive` on
   * its own. Going home is not a pause: the menu keeps the bed under it, the
   * way it has one at boot.
   */
  private suspend(): void {
    if (!this.playing || this.overlay.visible) return;
    this.pauseActive();
    this.hush();
    this.overlay.show('paused');
  }

  /**
   * The window is no longer the one being played, so it stops making noise.
   *
   * A run pauses, which is what `suspend` has always done. The rest is what
   * that missed: the menu's bed plays with no run under it, and a MIDI
   * keyboard keeps delivering notes to a window that is not in front, so the
   * player switching away and playing something else would still be heard.
   * Everything sounding is put down and the master is held at zero, which
   * also catches whatever a mode writes onto the audio clock after this.
   */
  private leaveFocus(): void {
    if (!this.focused) return;
    this.focused = false;
    this.suspend();
    this.hush();
    this.audio.setMuted(true);
  }

  /**
   * Back in front: the output opens again, and the menu gets its bed back.
   *
   * Not while playing — losing focus mid-run put the pause panel up, and
   * nothing sounds behind that until the player resumes.
   */
  private enterFocus(): void {
    if (this.focused) return;
    this.focused = true;
    // Web MIDI keeps delivering to a window that is not in front, and the mute
    // is at the master rather than at the input: a mode still made voices for
    // those notes, silently. So they are put down here, before the master
    // opens — otherwise a key held on the controller while the player was
    // elsewhere, or the release tail of one, comes up with it.
    this.hush();
    this.audio.setMuted(false);
    if (!this.playing) this.wakeBed();
  }

  /**
   * Nothing sounds behind the pause panel.
   *
   * Each mode already stops what it knows it started — the drums, the rolling
   * balls, a run — but what is sounding when the panel goes up belongs to the
   * app rather than to any of them: a chord still held, the bed comping on its
   * own timer, a flourish written onto the audio clock a second ahead. So they
   * are put down in one place, rather than in three modes that each have to
   * remember.
   */
  private hush(): void {
    // Through the hub first, so the modes see the keys come up and their decks
    // stop glowing; the engine's own sweep then catches whatever was sounding
    // that no key is holding.
    this.input.releaseAll();
    this.audio.hush();
    this.bed.stop();
  }

  /**
   * Start the bed again after the panel silenced it.
   *
   * Not if the mode's own resume has already put one back: PlayTune's does,
   * with a written track on it, and the scale's own loop starting over that
   * would sound a chord the piece does not have.
   */
  private wakeBed(): void {
    if (this.bed.enabled && !this.bed.running) this.bed.start();
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
    this.wakeBed();
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
    resetPerfSettings();
    this.stage.resetSettings();
    // Back to rung zero and back to being measured, not merely back to the
    // default preset: a reset that left the ladder where it was would leave the
    // panel saying one thing and the picture showing another.
    this.forgetMeasurements();
    this.adaptive.hold(1);
    // `stage.resetSettings` has already put the rung and the recorded scale
    // back, so `shedTo` would see no transition and return before doing any of
    // what a rung change normally carries with it. Both of its side effects are
    // therefore applied here instead.
    //
    // The canvas, or it would sit at 0.85 or 0.72 scale while the panel
    // reported full quality, until some unrelated window resize corrected it.
    // Free when the size has not actually changed.
    this.resize();
    // And the sound, or a session reset out of Lite would stay lite -- the
    // preset says Auto, the rung says zero, and the engine went on with the
    // short hall and single unison voices.
    this.applySoundPreset();
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
    // A theme is a workload. Toybox draws neither the floor light nor the
    // grade, so two of the ladder's rungs do nothing there and the frame is
    // cheaper throughout -- which means what the controller learned under
    // Nocturne is not true here. Without this, a floor earned on the expensive
    // theme followed the player to the cheap one and kept bloom off for good.
    this.forgetMeasurements();
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

    // Behind a panel the table is a backdrop under a seven-pixel blur, and the
    // compositor re-blurs the whole canvas every time it changes. Something has
    // to keep moving there — a frozen board reads as a crash, which is why the
    // attract mode exists at all — but it does not have to move sixty times a
    // second, and this is the *first* thing the app is asked to do: the home
    // screen is up before the player has touched anything.
    //
    // Only `draw` is held back. The HUD and the panel still update every frame,
    // and the simulation is on the loop's other callback, so nothing about the
    // run changes — just how often the picture behind the glass is repainted.
    this.idleDt += frameDt;
    const idling = this.overlay.visible;
    if (!idling || this.idleDt >= IDLE_FRAME) {
      // The accumulated time, not this frame's slice. `beginFrame` advances the
      // stage clock, the particles and the shake decay by whatever it is given,
      // so passing one frame's worth on every third frame would run the whole
      // backdrop at a third speed.
      this.active?.draw(alpha, this.idleDt);
      this.idleDt = 0;
    }
    this.active?.hud();
    this.hud.update({
      fps: this.loop.stats.fps,
      stepMs: this.loop.stats.stepMs,
      drawMs: this.loop.stats.drawMs,
      // Only when something is going to read it. A mode's debug lines walk its
      // live particles and build a handful of strings, and the readout they go
      // to is off unless someone has pressed F3.
      extra: this.hud.showFps
        ? `${this.qualityLine()}
${this.active?.debugLines?.() ?? ''}`
        : undefined,
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
   * manages and give up the expensive things only when the frame is genuinely
   * not fitting -- one rung at a time, worst-looking loss last.
   *
   * Two signals, because either one alone lies. `stepMs + drawMs` is what this
   * code costs, and it misses everything the browser does afterwards:
   * compositing, style, paint, garbage collection. A machine falling over on
   * GPU compositing -- which is exactly what old integrated graphics does --
   * reports a comfortable number here and would never shed. `frameMs` is the
   * wall-clock gap between frames and catches all of it, but on its own it says
   * nothing about headroom: a healthy 60Hz display sits at a flat 16.7ms
   * whether the frame took one millisecond or fifteen.
   *
   * So: shed when either says the frame is late, and climb back only when both
   * say it is not.
   */
  private adaptQuality(dt: number): void {
    const s = this.loop.stats;
    const target = this.adaptive.update(
      { stepMs: s.stepMs, drawMs: s.drawMs, frameMs: s.frameMs, dt },
      {
        rung: this.stage.rung,
        auto: perfSettings().graphics === 'auto',
        // A panel is up, or this is not the window being played.
        idle: this.overlay.visible || !this.focused,
        nextEffective: (from) => this.nextEffectiveRung(from),
      },
    );
    if (target !== null) this.shedTo(target);
  }

  /**
   * The next rung down that would actually change what is drawn.
   *
   * A rung can be inert for two reasons: the player has already turned that
   * effect off by hand, or the theme never draws it -- Toybox sets `pool` to
   * null, so shedding the floor light there gives nothing back. Stepping onto
   * one of those still costs a three-second hold, during which the frame stays
   * over budget and the next rung that *would* have helped goes untouched. The
   * old two-rung pass had a hand-written guard for exactly the Toybox case;
   * replacing it with a ladder dropped that, and this is it generalised.
   */
  private nextEffectiveRung(from: number): number {
    const pref = this.stage.preferredQuality;
    const now = derive(pref, from);
    for (let r = from + 1; r <= MAX_RUNG; r++) {
      const next = derive(pref, r);
      if (now.bloom !== next.bloom || now.shadows !== next.shadows
        || now.roll !== next.roll || now.particles !== next.particles
        || now.renderScale !== next.renderScale) return r;
      // These two exist only where the theme draws them.
      if (now.pools !== next.pools && this.stage.theme.pool !== null) return r;
      if (now.grade !== next.grade && this.stage.theme.grade) return r;
    }
    return MAX_RUNG;
  }

  /** What the ladder is currently giving up, for the F3 readout. */
  private qualityLine(): string {
    const q = this.stage.quality;
    const scale = q.renderScale === 1 ? '' : ` @${q.renderScale.toFixed(2)}`;
    return `q ${this.stage.rung}/${MAX_RUNG}${scale} ${rungLabel(this.stage.rung)}`;
  }

  /** Move the ladder, and everything that follows from where it lands. */
  private shedTo(rung: number, hold = 3): void {
    const from = this.stage.rung;
    const rescale = this.stage.setRung(rung);
    if (!rescale && from === this.stage.rung) return;
    if (rescale) this.resize();
    this.adaptive.hold(hold);
    this.applySoundPreset();
  }

  /**
   * Whether the sound is running lite.
   *
   * On `auto` it follows the ladder: the sound gives up its long hall and its
   * unison voices once the picture has already given up enough that the
   * machine is clearly the problem. Pinned either way, the player has said,
   * and a player who would rather keep the hall and lose frames is entitled to.
   */
  private applySoundPreset(): void {
    const pref = perfSettings().sound;
    this.audio.setLite(pref === 'lite' || (pref === 'auto' && this.stage.rung >= LITE_AUDIO_RUNG));
  }

  /** Apply a graphics preset: pin the ladder, or hand it back to the measurement. */
  setGraphicsPreset(preset: GraphicsPreset): void {
    setPerfSettings({ graphics: preset });
    this.forgetMeasurements();
    if (preset !== 'auto') this.shedTo(PRESET_RUNG[preset], 0);
    else this.adaptive.hold(1);
  }

  setSoundPreset(preset: SoundPreset): void {
    setPerfSettings({ sound: preset });
    this.applySoundPreset();
  }

  get graphicsPreset(): GraphicsPreset { return perfSettings().graphics; }
  get soundPreset(): SoundPreset { return perfSettings().sound; }
  /** What the ladder is giving up right now, for the settings panel. */
  get qualitySummary(): string { return rungLabel(this.stage.rung); }

  /** True while the keyboard belongs to an on-screen control rather than the piano. */
  private hudHasFocus(): boolean {
    const el = document.activeElement;
    return el !== null && el !== document.body && this.hud.root.contains(el);
  }

  /**
   * A 4K laptop reports a ratio of 2.5 or 3 depending on the scaling it is set
   * to, and the old cap of 2 left the table visibly soft on one. Nothing sheds
   * this later: the adaptive pass drops effects under load, never resolution.
   */
  /**
   * Forget what was measured, and what was concluded from it.
   *
   * The failure latch is the important half: it exists to stop a machine
   * flickering between two pictures it cannot decide between, and that is only
   * ever true of one workload. Carried across a change of workload it becomes
   * a permanent verdict on a question nobody asked again.
   */
  private forgetMeasurements(): void { this.adaptive.forget(); }

  private resize(): void {
    const cssW = window.innerWidth, cssH = window.innerHeight;
    // A resize is the one event that can mean a different display, which is
    // the only thing the refresh estimate is trying to describe. It never
    // rises on its own, so this is where it gets to.
    this.adaptive.resetRefresh();
    this.adaptive.disturb();
    // The ladder's last rungs come through here. A backing store is the one
    // thing every full-frame pass is priced in, so scaling it is the only lever
    // that makes the void fill, the baked blit, the emissive clear, the bloom
    // pyramid and the three composites all cheaper at once. The canvas keeps
    // its CSS size, so nothing moves and the compositor upscales for free.
    const density = backingDensity(cssW, cssH, window.devicePixelRatio);
    this.stage.resize(cssW, cssH, density * this.stage.quality.renderScale);
  }

  /**
   * One resize per frame at most.
   *
   * Dragging a window edge fires `resize` continuously, and each one used to
   * reallocate five canvases and force a full re-bake -- 2,600 grain dots, the
   * brushed arcs and every wall, all to be thrown away by the next event a few
   * milliseconds later. Coalescing onto a frame keeps the last size, which is
   * the only one that was ever going to be kept.
   */
  private queueResize(): void {
    if (this.resizeRaf) return;
    this.resizeRaf = requestAnimationFrame(() => {
      this.resizeRaf = 0;
      this.resize();
    });
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
      if (document.hidden) this.leaveFocus();
      else { unlock(); this.enterFocus(); }
    });
    window.addEventListener('blur', () => this.leaveFocus());
    window.addEventListener('focus', () => this.enterFocus());
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
    if (screen === 'settings' || screen === 'calibrate' || screen === 'about') {
      this.overlay.back();
    } else if (screen === 'paused') {
      this.resumeMode();
    } else if (screen === null) {
      if (this.playing) this.suspend();
      else this.overlay.show('home');
    } else {
      this.overlay.show('home');
    }
  }

  openScreen(screen: Screen): void { this.overlay.show(screen); }
}
