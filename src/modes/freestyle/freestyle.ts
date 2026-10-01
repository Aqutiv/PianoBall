import { ModeBase, type GameMode, type GameModeId, type ModeContext } from '../../app/mode';
import type { KeyHit } from '../../app/pointerKeys';
import { KeyDeck } from '../../game/keys';
import { chordNotes, identifyChord, inScale } from '../../audio/music';
import { clamp, clamp01 } from '../../core/math';
import type { InputEvent } from '../../midi/types';
import { DockView } from '../../render/dockView';
import { centreFor, freestyleRows, type DockRowSpec } from '../../game/dock';
import { dockSettings, readDockEnv, setDockSettings } from '../../render/dockSettings';
import { bakeDock, dockBakeKey, drawDockKeys, type DockLook } from '../../render/dockKeys';
import { RhythmBox } from '../../audio/rhythmBox';
import { findPattern } from '../../audio/patterns';
import { DEFAULT_BED_VOICE, DEFAULT_LEAD_VOICE } from '../../audio/voices';
import { Field } from './field';
import { FreestyleHud } from './hud';
import { freestyleSettings } from './settings';
import { rhythmSettings } from './rhythmSettings';
import { ChordInput } from './chordInput';

/** Width of the keyboard's own geometry, which stereo position is read from. */
const TABLE_WIDTH = 1024;

const rowsKey = (rows: readonly DockRowSpec[]) => rows.map((r) => `${r.low}-${r.high}`).join(',');

/**
 * Playing for the sound of it.
 *
 * No ball, no score, no physics — the playfield is given over to what the
 * player is doing with their hands. Pitch bend and the mod wheel finally mean
 * what their names say here, because there is no table for them to tilt.
 */
export class FreestyleMode extends ModeBase implements GameMode {
  readonly id: GameModeId = 'freestyle';
  readonly projection = 'flat' as const;
  readonly glide = true;

  private readonly deck = new KeyDeck();
  /** The keyboard along the bottom of the screen. */
  private readonly dock: DockView;
  private readonly field: Field;
  private readonly panel: FreestyleHud;
  private readonly box: RhythmBox;
  private readonly ctx: ModeContext;
  private readonly chords: ChordInput;
  private entered = false;
  private mappingRevision = -1;
  /** The rows the keyboard was last built for, to notice when they change. */
  private rowsKey = '';
  /** Notes the player is holding, in the order they were pressed. */
  private held: number[] = [];
  /** The tempo the app was in before Freestyle borrowed it. */
  private enteredBpm = 0;
  /**
   * Whether the player is actually here, rather than looking at a menu.
   *
   * A mode is also entered at boot purely so the home screen has something
   * behind it, and `Shell.play` re-enters an already-active mode by calling
   * `newGame` alone. Neither goes through `resume`, so the one thing in this
   * mode that makes a noise of its own has to follow the run rather than the
   * mode: the alternative is drums under the menu, or a rhythm that was left
   * switched on refusing to come back.
   */
  private running = false;

  constructor(ctx: ModeContext) {
    super();
    this.ctx = ctx;
    this.dock = new DockView(ctx.stage, ctx.hud, { touch: 50, desk: 40 });
    this.chords = new ChordInput(ctx.bed);
    this.field = new Field(ctx.stage);
    const r = rhythmSettings();
    this.box = new RhythmBox(ctx.audio, () => ctx.music.bpm, findPattern(r.patternId));
    this.box.swing = r.swing;
    this.box.level = r.level;
    // A drummer, not a machine: a few milliseconds and a few percent either way.
    this.box.human = { rng: Math.random, jitter: 0.006, gain: 0.08 };
    this.panel = new FreestyleHud(
      ctx.hud, ctx.music, ctx.audio, this.box, {
        bed: ctx.bed,
        range: () => this.range(),
        centreOn: (note) => this.centreOn(note),
        change: () => this.applyBed(),
        stop: () => this.chords.stop(),
        shift: (dir) => this.shift(dir),
        openSound: () => ctx.openScreen('sound-settings'),
      },
    );
    this.remap();
  }

  get keyLayoutRevision(): number { return this.dock.revision; }

  remap(rows: DockRowSpec[] = this.rowsFor()): void {
    const low = rows[0].low;
    const count = rows[rows.length - 1].high - low + 1;
    this.rowsKey = rowsKey(rows);
    this.dock.setRows(rows);
    this.deck.build(low, count);
    this.mappingRevision = this.ctx.input.mapping.revision;
    if (this.entered) {
      this.chords.remap(low, count);
      this.applyBed();
      // Rebuilding the deck must not release a melody already under the hands.
      for (const note of this.held) this.deck.noteOn(note, 0.6);
      this.followKeyboard();
    }
  }

  /**
   * The rows the keyboard should hold right now.
   *
   * Sized for fingers on a touch screen and mirroring the controller anywhere
   * else; Manual backing on a narrow screen stacks its chord octave above the
   * melody. Cheap and pure, so it is asked every step and the keyboard is only
   * rebuilt when the answer changes.
   */
  private rowsFor(): DockRowSpec[] {
    const env = readDockEnv(this.ctx.input);
    this.dock.setTouch(env.touch);
    const s = freestyleSettings();
    return freestyleRows(env, this.ctx.input.mapping, s.bed && s.bedMode === 'manual', this.ctx.stage.cssW);
  }

  /** The keys on screen, for the backing panel's range readout. */
  private range(): { low: number; high: number; count: number; canDown: boolean; canUp: boolean } {
    const { low, high } = this.deck.range;
    if (this.dock.touch) {
      const centre = dockSettings().touchCenter;
      return { low, high, count: high - low + 1, canDown: centre > 36, canUp: centre < 96 };
    }
    const m = this.ctx.input.mapping;
    return { low, high, count: high - low + 1, canDown: m.low > 0, canUp: m.low < 127 - m.settings.count };
  }

  /**
   * Bring the keys to a note dragged to on the range strip, by whole octaves.
   * On a touch screen the window is rebuilt around it; with a controller its
   * mapping is walked there an octave at a time, as its own buttons would.
   */
  centreOn(note: number): void {
    if (this.dock.touch) {
      const k = Math.round((this.deck.range.high - this.deck.range.low) / 12);
      setDockSettings({ touchCenter: centreFor(note, this.dock.rowSpecs.length > 1 ? 2 : k) });
      this.remap();
      return;
    }
    const m = this.ctx.input.mapping;
    const steps = Math.round((note - (m.low + m.high) / 2) / 12);
    if (!steps) return;
    for (let i = 0; i < Math.abs(steps); i++) m.shiftOctave(Math.sign(steps));
    if (this.ctx.remapKeys) this.ctx.remapKeys(); else this.remap();
  }

  /**
   * Move the keyboard an octave. On a touch screen that moves the keys on
   * screen; with a controller it moves the controller's window, which every
   * mode follows.
   */
  shift(dir: number): void {
    if (this.dock.touch) {
      setDockSettings({ touchCenter: dockSettings().touchCenter + 12 * Math.sign(dir) });
      this.remap();
      return;
    }
    this.ctx.input.mapping.shiftOctave(dir);
    if (this.ctx.remapKeys) this.ctx.remapKeys(); else this.remap();
  }

  /** Point the computer keyboard at the keys on screen when they are sized for fingers. */
  private followKeyboard(): void {
    this.ctx.input.keyboardBase = this.dock.touch ? () => this.deck.range.low : null;
  }

  /** Start or silence the bed to match what the player last chose. */
  applyBed(): void {
    // Deliberately no allNotesOff here: the bed's pads are not key voices, so
    // it would not silence them — it would only cut the note the player is
    // holding, which is not what switching off a backing track should do.
    const s = freestyleSettings();
    const supported = this.deck.keys.length >= 12;
    this.ctx.bed.setControlMode(s.bedMode);
    this.ctx.bed.setEnabled(s.bed && (s.bedMode !== 'manual' || supported));
    this.chords.configure(s.bed && s.bedMode === 'manual' && supported, s.manualChordQuality, s.holdChord);
    this.ctx.bed.setManualMeter(this.box.pattern.beats);
    // A pause stops the shared scheduler. If Backing was off at resume, the
    // shell leaves it asleep; enabling it here must wake Auto and repeats.
    if (this.running && this.ctx.bed.enabled) this.ctx.bed.start();
  }

  /** Hand the engine the instruments this mode remembers being set to. */
  private applyVoices(): void {
    const s = freestyleSettings();
    const { audio } = this.ctx;
    audio.setLeadVoice(s.voiceId);
    audio.setBedVoice(s.bedVoiceId);
  }

  /** Put the rhythm box back in step with the remembered settings. */
  private applyRhythm(): void {
    const r = rhythmSettings();
    this.box.setPattern(findPattern(r.patternId));
    this.ctx.bed.setManualMeter(this.box.pattern.beats);
    this.box.swing = r.swing;
    this.box.level = r.level;
    if (this.running && r.on) this.box.start(); else this.box.stop();
  }

  /**
   * Re-read every preference this mode owns.
   *
   * The settings panel's "reset everything" calls this on whichever mode is
   * running: the bed, the instruments, the rhythm and the tempo are all read
   * once on the way in and would otherwise sit on values the player has just
   * cleared.
   */
  applySettings(): void {
    this.chords.stop();
    this.applyBed();
    this.applyVoices();
    this.applyRhythm();
    const { music, audio } = this.ctx;
    music.setBpm(rhythmSettings().bpm);
    audio.setTempo(music.bpm);
    this.panel.sync();
  }

  enter(): void {
    this.entered = true;
    const { input, audio, music } = this.ctx;
    this.dock.forget();

    this.remap();
    this.track(input.on((e) => this.onInput(e)));
    // The delay is tempo-locked, so it has to follow whatever moves the tempo
    // — the slider here, or a tune that retunes the whole app.
    this.track(music.bus.on('change', (m) => {
      this.field.reset();
      this.panel.sync();
      audio.setTempo(m.bpm);
    }));
    this.track(music.bus.on('tempo', (bpm) => audio.setTempo(bpm)));

    // Restore Freestyle's remembered rhythm tempo on its own music state.
    this.enteredBpm = music.bpm;
    music.setBpm(rhythmSettings().bpm);
    audio.setTempo(music.bpm);

    // Before the panel is built, not after: the controls sync themselves from
    // the engine on the way up, and the engine is still holding the defaults
    // this mode put back the last time it exited.
    this.applyVoices();
    this.panel.mount();
    this.applyBed();
    this.ctx.bed.start();
    // Not started here: entering the mode is not the same as playing it.
    this.applyRhythm();
    audio.resetExpression();
  }

  exit(): void {
    this.panel.destroy();
    this.chords.reset();
    this.entered = false;
    this.release();
    this.running = false;
    this.box.stop();
    const { audio, music } = this.ctx;
    // Leave the bed, and the sound of the thing, as the next mode expects to
    // find them: a choir chosen here is Freestyle's, not the app's.
    this.ctx.bed.setControlMode('auto');
    this.ctx.bed.setEnabled(true);
    audio.setLeadVoice(DEFAULT_LEAD_VOICE);
    audio.setBedVoice(DEFAULT_BED_VOICE);
    if (this.enteredBpm) music.setBpm(this.enteredBpm);
    audio.setTempo(music.bpm);
    audio.resetExpression();
    this.deck.allOff();
    this.field.reset();
    this.held.length = 0;
    this.dock.forget();
    this.ctx.input.keyboardBase = null;
    this.ctx.hud.clearPanels();
  }

  /** Nothing should keep drumming behind the pause panel. */
  pause(): void {
    this.panel.closeHelp();
    this.running = false;
    this.chords.stop();
    this.box.stop();
  }

  /**
   * Back from a panel that may have moved something this HUD is showing — the
   * bed's level and the size of the room are in Settings as well as up here —
   * so the controls are re-read rather than left on what they said going in.
   */
  resume(): void {
    this.running = true;
    this.applyBed();
    this.applyRhythm();
    this.panel.sync();
  }

  /**
   * Freestyle has no run to restart, but picking it from the menu is the same
   * moment the table calls a new game — so it is where a random scale is drawn.
   */
  newGame(): void {
    this.panel.closeHelp();
    this.chords.stop();
    this.running = true;
    this.applyBed();
    this.ctx.music.roll();
    this.field.reset();
    this.applyRhythm();
    // Picked from the menu, which is reached through Settings: the panel was
    // never suspended on that path, so nothing has re-read the controls yet.
    this.panel.sync();
  }

  restart(): boolean {
    this.newGame();
    return true;
  }

  step(dt: number): void {
    const rows = this.rowsFor();
    if (this.mappingRevision !== this.ctx.input.mapping.revision || rowsKey(rows) !== this.rowsKey) this.remap(rows);
    this.deck.update(dt);
    const { input, audio } = this.ctx;
    // The wheels drive the sound here, rather than the table.
    audio.setBend(input.bend);
    audio.setMod(input.mod);
    this.field.update(dt, input.bend, input.mod);
  }

  draw(_alpha: number, frameDt: number): void {
    const { stage, music, bed } = this.ctx;
    const layout = this.dock.layout();
    // Effects are sized in the table units they were tuned in; a white key was
    // about a hundred and ten of them deep.
    const unit = clamp(layout.rows[layout.rows.length - 1].whiteW / 110, 0.4, 0.9);
    stage.flat.floor = layout.top;
    stage.flat.unit = unit;

    const s = freestyleSettings();
    const auto = s.bed && s.bedMode === 'auto';
    const split = this.chords.active ? this.deck.range.low + 12 : undefined;
    const look: DockLook = {
      scale: auto ? (n) => this.scaleMark(n) : undefined,
      chordSplit: split,
      // Where the octave bar begins: `.dock-bar` is min(300px, 56%) wide.
      captionLimit: layout.right - Math.min(300, stage.cssW * 0.56) - 8,
    };
    const scaleSig = auto ? `${music.root}:${music.scale.join('.')}` : '-';
    if (stage.needsBake(`freestyle|${dockBakeKey(stage, layout, look, scaleSig)}`)) {
      const ctx = stage.baked.ctx;
      ctx.setTransform(stage.dpr, 0, 0, stage.dpr, 0, 0);
      ctx.clearRect(0, 0, stage.cssW, stage.cssH);
      bakeDock(ctx, stage, layout, look);
    }

    stage.beginFrame(frameDt);
    const em = stage.emissive.ctx;
    this.field.setFrame(stage.cssW, layout.top, unit);
    this.field.draw(em);
    const chord = this.chords.active ? bed.manualChord : null;
    drawDockKeys(stage.ctx, em, stage, layout, this.deck, look, {
      chordTones: chord && split !== undefined ? this.chordKeys(chord.root, chord.quality, split) : undefined,
      chordRoot: chord?.root,
    });
    stage.particles.draw(em, stage.proj, 1);
    stage.composite();
    stage.drawGlass(layout.top);
    stage.endFrame();
    this.dock.publish();
  }

  /** Where a manual chord's tones sit among the chord keys, for the rings on them. */
  private chordKeys(root: number, quality: Parameters<typeof chordNotes>[1], split: number): number[] {
    return chordNotes(root, quality).map((n) => {
      let note = n;
      while (note >= split) note -= 12;
      return note;
    });
  }

  /** The scale guide on the keys: 2 on the tonic, 1 on other scale tones. */
  private scaleMark(note: number): number {
    const h = this.highlight(note);
    return h > 0.4 ? 2 : h > 0 ? 1 : 0;
  }

  hud(): void {
    this.panel.update(this.field.chordName, this.ctx.input.bend, this.ctx.input.mod);
  }

  debugLines(): string {
    return `held ${this.held.length}  parts ${this.ctx.stage.particles.liveCount}\n`
      + `bend ${this.ctx.input.bend.toFixed(2)}  mod ${this.ctx.input.mod.toFixed(2)}`;
  }

  keyAt(x: number, y: number, moving: boolean): KeyHit | null {
    return this.dock.keyAt(x, y, moving);
  }

  // ------------------------------------------------------------- playing ---

  /** Auto backing lights its scale; free playing and Manual have no scale guide. */
  private highlight(note: number): number {
    const s = freestyleSettings();
    if (!s.bed || s.bedMode !== 'auto') return 0;
    const m = this.ctx.music;
    if (!inScale(note, m.root, m.scale)) return 0;
    return (note - m.root) % 12 === 0 ? 0.48 : 0.28;
  }

  private onInput(e: InputEvent): void {
    const { audio, input, stage, bed } = this.ctx;
    if (e.type === 'noteon') {
      if (!this.running) return;
      if (this.mappingRevision !== input.mapping.revision) this.remap();
      const force = input.force(e.raw);
      // Only notes on the keyboard on screen: a key the player cannot see
      // must not make a sound they cannot place.
      if (!this.deck.byNote.has(e.note)) return;
      const role = this.chords.noteOn(e.note, force);
      if (role === 'ignore') return;
      const key = this.deck.noteOn(e.note, force);
      if (!key || role === 'chord') return;
      // Never snapped, whatever the assist setting says. The point of the mode
      // is that the keyboard does exactly what the player asks of it.
      audio.noteOn(e.note, force, this.pan(key.geom.cx));
      this.field.noteOn(e.note, this.dock.laneX(e.note) ?? stage.cssW / 2, force);
      this.held.push(e.note);
      this.refreshChord();
      // Landing on the grid lights the whole field: playing in time is worth
      // something even where nothing is being scored.
      if (audio.running && bed.groove.judge(audio.now)) this.field.onBeat();
    } else if (e.type === 'noteoff') {
      this.deck.noteOff(e.note);
      if (this.chords.noteOff(e.note) !== 'lead') return;
      audio.noteOff(e.note);
      this.field.noteOff(e.note);
      this.held = this.held.filter((n) => n !== e.note);
      this.refreshChord();
    }
  }

  private refreshChord(): void {
    this.field.setChord(identifyChord(this.held), this.held);
  }

  /**
   * Stereo position from where the key sits on the keyboard. Read from the
   * deck's own geometry rather than from the screen, so turning a phone round
   * does not move the sound.
   */
  private pan(x: number): number {
    return clamp01(x / TABLE_WIDTH) * 1.5 - 0.75;
  }
}
