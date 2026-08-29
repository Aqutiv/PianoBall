import { ModeBase, type GameMode, type GameModeId, type ModeContext } from '../../app/mode';
import { KeyDeck } from '../../game/keys';
import { drawKeys } from '../../render/keys';
import { FIELD, fieldOutline, bakeField } from '../../render/field';
import { SCALES } from '../../audio/music';
import { clamp, clamp01 } from '../../core/math';
import type { InputEvent } from '../../midi/types';
import { Scoring } from '../../game/scoring';
import type { Tune } from './chart';
import { fitToRange, fittedMelody, lastBeat } from './chart';
import { Judge, grade, type Target, type TargetSpec, type Verdict } from './judge';
import { Transport } from './transport';
import { AuraStage } from './render';
import { TuneHud } from './hud';
import { LIBRARY, TUNE_ORDER, findTune } from './library';
import { loadProgress, recordRun, type Progress } from './progress';
import { playTuneSettings } from './settings';

/** Points a verdict is worth before multipliers. */
const WORTH: Record<Verdict, number> = {
  perfect: 300, good: 200, ok: 100, miss: 0, wrong: 0,
};

type Phase = 'idle' | 'countin' | 'playing' | 'finished';

/**
 * Learning a melody.
 *
 * The game plays the harmony; the player owes it the tune on top. Auras fall
 * down the lane belonging to the key they are due on, and the only thing being
 * asked is that the key goes down when the aura arrives. Nothing here can end a
 * run early — a tune always plays to its last bar, because the point is to have
 * played it.
 */
export class PlayTuneMode extends ModeBase implements GameMode {
  readonly id: GameModeId = 'playtune';

  progress: Progress;
  tune: Tune | null = null;
  phase: Phase = 'idle';

  private readonly deck = new KeyDeck();
  private readonly auras: AuraStage;
  private readonly transport = new Transport();
  private readonly panel: TuneHud;
  private readonly scoring = new Scoring();
  private readonly ctx: ModeContext;
  private judge: Judge | null = null;
  /** The tune a pause interrupted, waiting to be started again on resume. */
  private pending: Tune | null = null;
  private endsAt = 0;
  private strikePulse = 0;

  constructor(ctx: ModeContext) {
    super();
    this.ctx = ctx;
    this.auras = new AuraStage(ctx.stage, this.deck);
    this.panel = new TuneHud(ctx.hud);
    this.progress = loadProgress(TUNE_ORDER);
    this.remap();
  }

  remap(): void {
    const m = this.ctx.input.mapping.settings;
    this.deck.build(m.baseNote, m.count);
  }

  // -------------------------------------------------------------- lifecycle ---

  enter(): void {
    const { stage, input } = this.ctx;
    stage.cam.configure({ width: FIELD.width, height: FIELD.height });
    stage.resize(stage.cssW, stage.cssH, stage.dpr);

    this.remap();
    this.panel.mount();
    this.panel.setTune(this.tune);
    this.track(input.on((e) => this.onInput(e)));
  }

  exit(): void {
    this.release();
    this.pending = null;
    this.stopRun();
    this.deck.allOff();
    this.ctx.hud.clearPanels();
  }

  /**
   * A tune picked up mid-phrase is not a tune you have played, so a pause ends
   * the attempt — but it keeps hold of *which* tune, because resuming has to
   * put the player back on it rather than on an empty board.
   */
  pause(): void {
    if (this.phase === 'countin' || this.phase === 'playing') this.pending = this.tune;
    this.stopRun();
  }

  resume(): void {
    const again = this.pending;
    this.pending = null;
    if (again) this.start(again.id);
  }

  /** The shell's "restart"/"play" entry point. Opens the song list. */
  newGame(): void {
    this.pending = null;
    this.stopRun();
    this.ctx.openScreen('songs');
  }

  // ------------------------------------------------------------------- run ---

  get tunes(): Tune[] { return LIBRARY; }

  /** Whether this chart can be reached on the keyboard that is plugged in. */
  fitFor(tune: Tune): number | null {
    const r = this.deck.range;
    return fitToRange(tune, r.low, r.high);
  }

  start(id: string): boolean {
    const tune = findTune(id);
    if (!tune) return false;
    const shift = this.fitFor(tune);
    if (shift === null) return false;

    this.stopRun();
    this.pending = null;
    this.tune = tune;
    this.scoring.reset();

    const settings = playTuneSettings();
    const t = this.transport;
    t.bpm = tune.bpm;
    t.beatsPerBar = tune.beatsPerBar;
    // The device's own latency is the starting guess; the settings slider is
    // for whatever it does not account for.
    t.offset = this.ctx.audio.latencyMs / 1000 + settings.offsetMs / 1000;

    const countIn = tune.beatsPerBar;
    t.start(this.ctx.audio.now, countIn);

    const specs: TargetSpec[] = fittedMelody(tune, shift)
      .map((n) => ({ note: n.note, beat: n.beat, len: n.len, time: t.timeOf(n.beat) }));
    this.judge = new Judge(specs);
    this.auras.leadBeats = settings.leadBeats;
    this.endsAt = t.timeOf(lastBeat(tune) + tune.beatsPerBar);
    this.phase = 'countin';

    // The bed plays the tune's own harmony, in the tune's own key, without
    // disturbing whatever scale the player picked in settings.
    this.ctx.bed.setTrack(tune.chords, t, tune.root + shift, SCALES[tune.scaleId]);
    this.ctx.bed.start();

    this.panel.setTune(tune);
    this.ctx.hud.banner(tune.title, 1.6);
    return true;
  }

  private stopRun(): void {
    this.transport.stop();
    this.ctx.bed.setTrack(null, null);
    this.judge = null;
    this.phase = 'idle';
  }

  /** Fold the finished run into the saved progress and open the results. */
  private finish(): void {
    const tune = this.tune;
    const judge = this.judge;
    this.phase = 'finished';
    this.transport.stop();
    this.ctx.bed.setTrack(null, null);
    if (!tune || !judge) return;
    // Anything still open when the tune ends was never played. Resolving it
    // here keeps the tally on the results screen adding up to the whole tune.
    judge.expire(Infinity);

    const accuracy = judge.accuracy;
    const letter = grade(accuracy);
    const outcome = recordRun(this.progress, tune.id, TUNE_ORDER, {
      accuracy, score: this.scoring.score, grade: letter, passed: accuracy >= tune.pass,
    });

    const next = outcome.unlocked ? findTune(outcome.unlocked) : null;
    this.ctx.setResult({
      title: letter ? `${tune.title} — ${letter}` : tune.title,
      lines: [
        { label: 'Accuracy', value: `${Math.round(accuracy * 100)}%` },
        { label: 'Score', value: this.scoring.score.toLocaleString() },
        { label: 'Perfect / good / ok / missed', value:
          `${judge.tally.perfect} / ${judge.tally.good} / ${judge.tally.ok} / ${judge.tally.miss}` },
        { label: 'Best run', value: `${Math.round(outcome.best.accuracy * 100)}%${outcome.improved ? ' — new best' : ''}` },
        ...(next ? [{ label: 'Unlocked', value: next.title }] : []),
        ...(letter ? [] : [{ label: 'To pass', value: `${Math.round(tune.pass * 100)}% accuracy` }]),
      ],
    });
    this.ctx.openScreen('result');
  }

  // ------------------------------------------------------------------ loop ---

  step(dt: number): void {
    this.deck.update(dt);
    this.strikePulse = Math.max(0, this.strikePulse - dt * 3.5);
    this.scoring.update(dt);

    const { audio, input } = this.ctx;
    audio.setBend(input.bend);
    audio.setMod(input.mod);

    if (this.phase === 'idle' || this.phase === 'finished') return;
    if (!audio.running) return;

    const now = audio.now;
    if (this.phase === 'countin' && this.transport.beatAt(now) >= 0) this.phase = 'playing';

    const judge = this.judge;
    if (!judge) return;
    for (const missed of judge.expire(this.transport.judgeTime(now))) this.onMiss(missed);

    if (now >= this.endsAt) this.finish();
  }

  draw(_alpha: number, frameDt: number): void {
    const stage = this.ctx.stage;
    if (stage.needsBake('playtune')) {
      const ctx = stage.baked.ctx;
      ctx.setTransform(stage.dpr, 0, 0, stage.dpr, 0, 0);
      ctx.clearRect(0, 0, stage.cssW, stage.cssH);
      stage.measureBounds(fieldOutline());
      bakeField(ctx, stage);
    }

    stage.beginFrame(frameDt);
    const em = stage.emissive.ctx;

    const settings = playTuneSettings();
    const views = this.judge && this.ctx.audio.running
      ? this.auras.view(
        this.judge,
        this.transport.judgeTime(this.ctx.audio.now),
        settings.leadBeats * this.transport.beatSeconds,
      )
      : [];

    this.auras.drawStrikeLine(em, this.strikePulse);
    this.auras.draw(em, views);

    const highlight = settings.assist ? this.auras.highlightFor(views) : undefined;
    drawKeys(stage.ctx, em, stage, this.deck, highlight ? { highlight } : {});
    stage.particles.draw(em, stage.cam);

    stage.composite();
    stage.drawRoll();
    stage.drawGlass();
    this.drawCountIn();
    stage.endFrame();
  }

  /** A visible count-in, so the first note is never a surprise. */
  private drawCountIn(): void {
    if (this.phase !== 'countin' || !this.ctx.audio.running) return;
    const beat = this.transport.beatAt(this.ctx.audio.now);
    const left = Math.ceil(-beat);
    if (left <= 0) return;
    const stage = this.ctx.stage;
    const ctx = stage.ctx;
    const frac = 1 - (-beat - Math.floor(-beat));
    ctx.save();
    ctx.globalAlpha = 0.25 + frac * 0.6;
    ctx.fillStyle = stage.palette.ink;
    ctx.font = `700 ${Math.round(stage.cssH * 0.16)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(left), stage.cssW / 2, stage.cssH * 0.38);
    ctx.restore();
  }

  hud(): void {
    const total = this.judge?.total ?? 0;
    this.panel.update(this.judge, total ? this.judge!.judged / total : 0);
  }

  debugLines(): string {
    const j = this.judge;
    return `${this.phase}  beat ${this.transport.beatAt(this.ctx.audio.now).toFixed(1)}\n`
      + (j ? `hit ${j.judged}/${j.total}  acc ${(j.accuracy * 100).toFixed(0)}%` : 'no tune');
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

  // --------------------------------------------------------------- playing ---

  private onInput(e: InputEvent): void {
    const { audio, input, stage } = this.ctx;
    if (e.type === 'noteon') {
      const force = input.force(e.raw);
      const key = this.deck.noteOn(e.note, force);
      if (!key) return;
      // Never snapped: the chart is the authority on what the note should be,
      // and quietly correcting the player would defeat the whole mode.
      audio.noteOn(e.note, force, this.pan(key.geom.cx));
      const r = this.deck.range;
      stage.logNote(e.note, force, r.low, r.high);
      if (this.phase === 'playing' || this.phase === 'countin') this.grade(e.note, force);
    } else if (e.type === 'noteoff') {
      this.deck.noteOff(e.note);
      audio.noteOff(e.note);
      stage.endNote(e.note);
      this.judge?.release(e.note);
    }
  }

  private grade(note: number, force: number): void {
    const judge = this.judge;
    if (!judge || !this.ctx.audio.running) return;
    const at = this.transport.judgeTime(this.ctx.audio.now);
    const result = judge.press(note, at);
    const key = this.deck.byNote.get(note);
    if (!key) return;
    const g = key.geom;
    const p = this.ctx.stage.particles;
    const hue = this.ctx.stage.hue(note);

    if (result.verdict === 'wrong') {
      // A quiet, colourless nudge: exploring the keyboard is allowed.
      p.spawn('spark', g.cx, g.cy + 12, 14, { vz: 90, maxLife: 0.22, size: 12, hue: 0 });
      return;
    }

    this.strikePulse = 1;
    p.ring(g.cx, g.cy + 16, 14, hue, 60 + force * 60, 0.45);
    p.burst(g.cx, g.cy + 10, 0, 1, 320 + force * 700, hue, 10 + Math.round(force * 10));
    if (result.verdict === 'perfect') {
      // A second, tighter ring is the only thing that separates perfect from
      // good on screen, and it should be earned rather than shouted about.
      p.ring(g.cx, g.cy + 16, 20, hue, 30, 0.3);
      this.ctx.stage.kick(1.2);
    }

    const combo = 1 + Math.min(6, Math.floor(result.combo / 8)) * 0.5;
    this.scoring.add(WORTH[result.verdict] * combo, g.cx, g.cy + 60, {
      flat: true, quiet: result.verdict !== 'perfect', label: result.verdict === 'perfect' ? 'PERFECT' : '',
      tone: hue / 360,
    });
  }

  private onMiss(target: Target): void {
    const key = this.deck.byNote.get(target.note);
    if (!key) return;
    const g = key.geom;
    // The aura shatters where it would have landed, in grey rather than in its
    // own colour: a miss should read as the note going out, not going off.
    this.ctx.stage.particles.shatter(g.cx, g.cy + 30, 16, this.ctx.stage.hue(target.note), 11);
    this.ctx.stage.kick(0.8);
  }

  private pan(x: number): number {
    return clamp01(x / FIELD.width) * 1.5 - 0.75;
  }
}
