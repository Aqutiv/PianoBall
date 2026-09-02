import { ModeBase, type GameMode, type GameModeId, type ModeContext } from '../../app/mode';
import { KeyDeck } from '../../game/keys';
import { drawKeys } from '../../render/keys';
import { identifyChord, inScale } from '../../audio/music';
import { clamp01 } from '../../core/math';
import type { InputEvent } from '../../midi/types';
import { FIELD, fieldOutline, bakeField } from '../../render/field';
import { RhythmBox } from '../../audio/rhythmBox';
import { findPattern } from '../../audio/patterns';
import { DEFAULT_BED_VOICE, DEFAULT_LEAD_VOICE } from '../../audio/voices';
import { Field } from './field';
import { FreestyleHud } from './hud';
import { freestyleSettings } from './settings';
import { rhythmSettings } from './rhythmSettings';

/**
 * Playing for the sound of it.
 *
 * No ball, no score, no physics — the playfield is given over to what the
 * player is doing with their hands. Pitch bend and the mod wheel finally mean
 * what their names say here, because there is no table for them to tilt.
 */
export class FreestyleMode extends ModeBase implements GameMode {
  readonly id: GameModeId = 'freestyle';

  private readonly deck = new KeyDeck();
  private readonly field: Field;
  private readonly panel: FreestyleHud;
  private readonly box: RhythmBox;
  private readonly ctx: ModeContext;
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
    this.field = new Field(ctx.stage);
    const r = rhythmSettings();
    this.box = new RhythmBox(ctx.audio, () => ctx.music.bpm, findPattern(r.patternId));
    this.box.swing = r.swing;
    this.box.level = r.level;
    // A drummer, not a machine: a few milliseconds and a few percent either way.
    this.box.human = { rng: Math.random, jitter: 0.006, gain: 0.08 };
    this.panel = new FreestyleHud(
      ctx.hud, ctx.music, ctx.audio, this.box, () => this.applyBed(),
    );
    this.remap();
  }

  remap(): void {
    const m = this.ctx.input.mapping.settings;
    this.deck.build(m.baseNote, m.count);
  }

  /** Start or silence the bed to match what the player last chose. */
  applyBed(): void {
    // Deliberately no allNotesOff here: the bed's pads are not key voices, so
    // it would not silence them — it would only cut the note the player is
    // holding, which is not what switching off a backing track should do.
    this.ctx.bed.setEnabled(freestyleSettings().bed);
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
    this.applyBed();
    this.applyVoices();
    this.applyRhythm();
    const { music, audio } = this.ctx;
    music.setBpm(rhythmSettings().bpm);
    audio.setTempo(music.bpm);
    this.panel.sync();
  }

  enter(): void {
    const { stage, input, audio, music } = this.ctx;
    stage.cam.configure({ width: FIELD.width, height: FIELD.height });
    stage.resize(stage.cssW, stage.cssH, stage.dpr);

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

    // Freestyle borrows the shared tempo while it is running and hands it back
    // on the way out, so a tempo chosen here does not follow you to a table.
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
    this.release();
    this.running = false;
    this.box.stop();
    const { audio, music } = this.ctx;
    // Leave the bed, and the sound of the thing, as the next mode expects to
    // find them: a choir chosen here is Freestyle's, not the app's.
    this.ctx.bed.setEnabled(true);
    audio.setLeadVoice(DEFAULT_LEAD_VOICE);
    audio.setBedVoice(DEFAULT_BED_VOICE);
    if (this.enteredBpm) music.setBpm(this.enteredBpm);
    audio.setTempo(music.bpm);
    audio.resetExpression();
    this.deck.allOff();
    this.field.reset();
    this.held.length = 0;
    this.ctx.hud.clearPanels();
  }

  /** Nothing should keep drumming behind the pause panel. */
  pause(): void { this.box.stop(); }

  resume(): void { this.applyRhythm(); }

  /**
   * Freestyle has no run to restart, but picking it from the menu is the same
   * moment the table calls a new game — so it is where a random scale is drawn.
   */
  newGame(): void {
    this.running = true;
    this.ctx.music.roll();
    this.field.reset();
    this.applyRhythm();
  }

  step(dt: number): void {
    this.deck.update(dt);
    const { input, audio } = this.ctx;
    // The wheels drive the sound here, rather than the table.
    audio.setBend(input.bend);
    audio.setMod(input.mod);
    this.field.update(dt, input.bend, input.mod);
  }

  draw(_alpha: number, frameDt: number): void {
    const stage = this.ctx.stage;
    if (stage.needsBake('freestyle')) {
      const ctx = stage.baked.ctx;
      ctx.setTransform(stage.dpr, 0, 0, stage.dpr, 0, 0);
      ctx.clearRect(0, 0, stage.cssW, stage.cssH);
      stage.measureBounds(fieldOutline());
      bakeField(ctx, stage);
    }

    stage.beginFrame(frameDt);
    const em = stage.emissive.ctx;
    this.field.draw(em);
    drawKeys(stage.ctx, em, stage, this.deck, { highlight: (n) => this.highlight(n) });
    stage.particles.draw(em, stage.cam);
    stage.composite();
    stage.drawRoll();
    stage.drawGlass();
    stage.endFrame();
  }

  hud(): void {
    this.panel.update(this.field.chordName, this.ctx.input.bend, this.ctx.input.mod);
  }

  debugLines(): string {
    return `held ${this.held.length}  parts ${this.ctx.stage.particles.liveCount}\n`
      + `bend ${this.ctx.input.bend.toFixed(2)}  mod ${this.ctx.input.mod.toFixed(2)}`;
  }

  pointerDown(x: number, y: number): number | null {
    const key = this.deck.pick(x, y);
    if (!key) return null;
    const g = key.geom;
    const force = this.deck.strikeForce(key, x, y);
    this.ctx.input.press(g.note, force, 'pointer');
    return g.note;
  }

  pointerUp(note: number): void {
    this.ctx.input.release(note, 'pointer');
  }

  // ------------------------------------------------------------- playing ---

  /** Tones of the scale glow faintly, so the key is findable on the keyboard. */
  private highlight(note: number): number {
    const m = this.ctx.music;
    if (!inScale(note, m.root, m.scale)) return 0;
    return (note - m.root) % 12 === 0 ? 0.2 : 0.09;
  }

  private onInput(e: InputEvent): void {
    const { audio, input, stage, bed } = this.ctx;
    if (e.type === 'noteon') {
      const force = input.force(e.raw);
      const key = this.deck.noteOn(e.note, force);
      if (!key) return;
      // Never snapped, whatever the assist setting says. The point of the mode
      // is that the keyboard does exactly what the player asks of it.
      audio.noteOn(e.note, force, this.pan(key.geom.cx));
      this.field.noteOn(key.geom, force);
      const r = this.deck.range;
      stage.logNote(e.note, force, r.low, r.high);
      this.held.push(e.note);
      this.refreshChord();
      // Landing on the grid lights the whole field: playing in time is worth
      // something even where nothing is being scored.
      if (audio.running && bed.groove.judge(audio.now)) this.field.onBeat();
    } else if (e.type === 'noteoff') {
      this.deck.noteOff(e.note);
      audio.noteOff(e.note);
      this.field.noteOff(e.note);
      stage.endNote(e.note);
      this.held = this.held.filter((n) => n !== e.note);
      this.refreshChord();
    }
  }

  private refreshChord(): void {
    this.field.setChord(identifyChord(this.held), this.held);
  }

  private pan(x: number): number {
    return clamp01(x / FIELD.width) * 1.5 - 0.75;
  }
}
