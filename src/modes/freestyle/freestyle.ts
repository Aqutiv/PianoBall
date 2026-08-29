import { ModeBase, type GameMode, type GameModeId, type ModeContext } from '../../app/mode';
import { KeyDeck } from '../../game/keys';
import { drawKeys } from '../../render/keys';
import { identifyChord, inScale } from '../../audio/music';
import { clamp, clamp01 } from '../../core/math';
import type { InputEvent } from '../../midi/types';
import { FIELD, fieldOutline, bakeField } from '../../render/field';
import { Field } from './field';
import { FreestyleHud } from './hud';
import { freestyleSettings } from './settings';

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
  private readonly ctx: ModeContext;
  /** Notes the player is holding, in the order they were pressed. */
  private held: number[] = [];

  constructor(ctx: ModeContext) {
    super();
    this.ctx = ctx;
    this.field = new Field(ctx.stage);
    this.panel = new FreestyleHud(ctx.hud, ctx.music, ctx.audio, () => this.applyBed());
    this.remap();
  }

  remap(): void {
    const m = this.ctx.input.mapping.settings;
    this.deck.build(m.baseNote, m.count);
  }

  /** Start or silence the bed to match what the player last chose. */
  applyBed(): void {
    this.ctx.bed.enabled = freestyleSettings().bed;
    if (!this.ctx.bed.enabled) this.ctx.audio.allNotesOff();
  }

  enter(): void {
    const { stage, input, audio } = this.ctx;
    stage.cam.configure({ width: FIELD.width, height: FIELD.height });
    stage.resize(stage.cssW, stage.cssH, stage.dpr);

    this.remap();
    this.panel.mount();
    this.track(input.on((e) => this.onInput(e)));
    this.track(this.ctx.music.bus.on('change', () => { this.field.reset(); this.panel.sync(); }));
    this.applyBed();
    this.ctx.bed.start();
    audio.resetExpression();
  }

  exit(): void {
    this.release();
    // Leave the bed as the next mode expects to find it.
    this.ctx.bed.enabled = true;
    this.ctx.audio.resetExpression();
    this.deck.allOff();
    this.field.reset();
    this.held.length = 0;
    this.ctx.hud.clearPanels();
  }

  /** Freestyle has no run to restart; entering it is all there is. */
  newGame(): void {
    this.field.reset();
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
    const depth = (x - g.cx) * g.nx + (y - g.cy) * g.ny;
    const force = clamp(0.42 + (depth + g.depth * 0.35) / (g.depth * 0.9), 0.18, 1);
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
