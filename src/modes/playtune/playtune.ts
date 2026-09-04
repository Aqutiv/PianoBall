import { ModeBase, type GameMode, type GameModeId, type ModeContext } from '../../app/mode';
import { KeyDeck } from '../../game/keys';
import { drawKeys } from '../../render/keys';
import { FIELD, fieldOutline, bakeField } from '../../render/field';
import { SCALES, chordLabel, degreeToNote } from '../../audio/music';
import { DEFAULT_BED_VOICE, DEFAULT_LEAD_VOICE } from '../../audio/voices';
import { clamp01 } from '../../core/math';
import type { InputEvent } from '../../midi/types';
import { Scoring } from '../../game/scoring';
import type { ChartChord, Tune } from './chart';
import { fitToRange, fitted, lastBeat } from './chart';
import { mergedChords } from './chords';
import { HOLD_FLOOR, Judge, grade, type Target, type TargetSpec, type Verdict } from './judge';
import { Transport } from './transport';
import { AuraStage } from './render';
import { TuneHud } from './hud';
import { findTune } from './library';
import { loadProgress, recordRun, type Progress } from './progress';
import { ROLES, type RoleId, type TuneRole } from './role';
import { playTuneSettings, setPlayTuneSettings } from './settings';
import { RUN_COLUMNS, TIMING, bucketRun, type Split, type Stat, type VerdictTone } from '../../ui/scoreboard';
import { playSting } from '../../audio/sting';
import { tuneSting } from './sting';
import type { Scheduled } from '../../audio/engine';

/** Points a verdict is worth before multipliers. */
const WORTH: Record<Verdict, number> = {
  perfect: 300, good: 200, ok: 100, miss: 0, wrong: 0,
};

type Phase = 'idle' | 'countin' | 'playing' | 'finished';

/**
 * What a run of notes in a row is worth, capped so a long tune cannot run away.
 *
 * `perOnset` is how many notes the chart typically asks for at once, and it
 * divides the ladder because the combo counts targets and a chord is several of
 * them. Without it a triad climbs three rungs a strike and a chord run reaches
 * the cap in a third of the notes a melody needs — which is not a chord player
 * doing better, it is the same achievement counted three times.
 */
function comboMultiplier(combo: number, perOnset = 1): number {
  return 1 + Math.min(6, Math.floor(combo / (8 * perOnset))) * 0.5;
}

/** The breakdown, worst last, so the bar reads left to right as it went. */
const SPLIT_ORDER: readonly VerdictTone[] = ['perfect', 'good', 'ok', 'miss', 'wrong'];

/** Worst first, for folding a chord's several targets into one verdict. */
const SEVERITY: Record<Verdict, number> = {
  perfect: 0, good: 1, ok: 2, wrong: 3, miss: 4,
};

/**
 * One verdict per moment the tune asked for something, in time order.
 *
 * Per onset rather than per target, which is the difference between a picture
 * of the run and a picture of the target list: a chord is three or four entries
 * at one instant, and drawn one apiece the chord role's map would be three
 * times as long as its tune and would say a triad went well three times. The
 * worst of the chord wins, because a triad with a note missing is a chord you
 * did not play.
 *
 * `Judge` sorts its targets by time and then by pitch, so equal times are
 * already adjacent and a single sweep is enough.
 */
function onsetVerdicts(targets: readonly Target[]): VerdictTone[] {
  const out: VerdictTone[] = [];
  let at = -Infinity;
  for (const t of targets) {
    const v = (t.verdict ?? 'miss') as VerdictTone;
    if (t.time !== at) {
      out.push(v);
      at = t.time;
    } else if (SEVERITY[v] > SEVERITY[out[out.length - 1]]) {
      out[out.length - 1] = v;
    }
  }
  return out;
}

/**
 * Learning a piece from either side of it.
 *
 * In the melody role the game plays the harmony and the player owes it the tune
 * on top; in the chord role they swap, and the player becomes the accompanist.
 * Auras fall down the lane belonging to the key they are due on, and the only
 * thing being asked is that the key goes down when the aura arrives. Nothing
 * here can end a run early — a tune always plays to its last bar, because the
 * point is to have played it.
 *
 * One class and one mode id for both, because the transport, the judge, the
 * auras, the HUD and the scoring cannot tell the difference: a chord is three
 * or four targets that happen to share a beat, and `Judge` has always graded
 * those independently. `TuneRole` is the whole of what differs.
 */
export class PlayTuneMode extends ModeBase implements GameMode {
  readonly id: GameModeId = 'playtune';

  progress: Progress;
  tune: Tune | null = null;
  phase: Phase = 'idle';
  private roleId: RoleId;

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
  /** Octaves the running tune was moved by, needed to name its chords. */
  private shift = 0;
  /**
   * The cadence placed when a run ends, while it is still to come.
   *
   * Kept because `mallet` is deliberately outside the engine's shot budget, so
   * nothing else will ever stop it: a player who leaves the results screen
   * inside the first beat of it would otherwise hear the last tune resolve over
   * the next one's count-in, in the last one's instrument.
   */
  private sting: Scheduled | null = null;
  /** Whether this run has ever seen a live audio clock. */
  private ranWithAudio = false;
  /** Mean notes this chart asks for at once, for the combo ladder. */
  private perOnset = 1;
  /**
   * Onset of the last target that shook the screen.
   *
   * A chord is several targets on one beat, and each of them used to spend the
   * whole of an onset's worth of feedback: four kicks, four bursts and four
   * PERFECT labels stacked on the same frame. The chord is one thing the player
   * did, so it gets one thing back.
   */
  private lastStruck = -1;

  constructor(ctx: ModeContext) {
    super();
    this.ctx = ctx;
    this.auras = new AuraStage(ctx.stage, this.deck);
    this.panel = new TuneHud(ctx.hud);
    this.roleId = playTuneSettings().role;
    this.progress = loadProgress(this.role.storageKey, this.role.order);
    this.remap();
  }

  get role(): TuneRole { return ROLES[this.roleId]; }

  /**
   * Take the other half of the arrangement.
   *
   * A run in progress is abandoned rather than translated: the chart, the
   * backing and the instruments are all about to be different things, and there
   * is no sense in which the player is still part-way through the same attempt.
   * `tune` goes with it, or Backspace would begin a tune the new role's list
   * does not contain.
   */
  setRole(id: RoleId): void {
    if (id === this.roleId) return;
    this.stopRun();
    this.pending = null;
    this.tune = null;
    this.shift = 0;
    this.roleId = id;
    setPlayTuneSettings({ role: id });
    this.progress = loadProgress(this.role.storageKey, this.role.order);
    this.panel.setTune(null);
  }

  remap(): void {
    const m = this.ctx.input.mapping.settings;
    this.deck.build(m.baseNote, m.count);
  }

  /**
   * Take the role the settings now say, in case they moved underneath.
   *
   * "Reset settings" puts the saved role back to melody without going through
   * `setRole`, and a mode is built once and kept for the life of the session —
   * so the cached id would otherwise go on saying chords against a preference
   * that says otherwise, until the player happened to press a tab. Called on
   * `enter` as well as from the shell's reset, because the reset only reaches
   * the mode that is currently on screen and this one is usually not.
   *
   * A no-op when the role has not actually changed: `setRole` returns early.
   */
  applySettings(): void {
    this.setRole(playTuneSettings().role);
  }

  // -------------------------------------------------------------- lifecycle ---

  enter(): void {
    const { stage, input } = this.ctx;
    stage.cam.configure({ width: FIELD.width, height: FIELD.height });
    stage.resize(stage.cssW, stage.cssH, stage.dpr);

    this.remap();
    // Before the role is read and after the panel exists: `setRole` clears the
    // title, and on the very first entry the HUD has not been built yet.
    this.panel.mount();
    this.applySettings();
    // Storage is the authority, and it can have moved while the player was in
    // another mode or another window of the app. Reading it here is safe in the
    // one direction that matters: `recordRun` only ever adds to what is stored,
    // so what comes back is never less than what this instance was holding.
    this.progress = loadProgress(this.role.storageKey, this.role.order);
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

  /**
   * Backspace: play the tune that is on the board again, from its count-in.
   *
   * A run that has gone wrong two bars in is not worth sitting through, and the
   * alternative is Escape, the song list, and finding the tune again. Nothing
   * is kept from the abandoned attempt — `start` scores it from zero — because
   * a restart is a fresh attempt at the whole tune, not a rewind.
   *
   * `pending` as well as `tune`, so the tune a pause interrupted is the one
   * that comes back rather than nothing. A finished run still counts: its tune
   * is still the one on screen once the results are dismissed.
   */
  restart(): boolean {
    const again = this.tune ?? this.pending;
    return again ? this.start(again.id) : false;
  }

  /** The shell's "restart"/"play" entry point. Opens the song list. */
  newGame(): void {
    this.pending = null;
    this.stopRun();
    this.ctx.openScreen('songs');
  }

  // ------------------------------------------------------------------- run ---

  get tunes(): readonly Tune[] { return this.role.tunes; }

  /** Whether this chart can be reached on the keyboard that is plugged in. */
  fitFor(tune: Tune): number | null {
    const r = this.deck.range;
    return fitToRange(this.role.chart(tune), r.low, r.high);
  }

  start(id: string): boolean {
    const tune = findTune(id);
    // The other role's curve is not this role's to start. Without this, the
    // three chord studies would be reachable from the melody results screen.
    if (!tune || !this.role.tunes.includes(tune)) return false;
    const shift = this.fitFor(tune);
    if (shift === null) return false;

    this.stopRun();
    this.pending = null;
    this.tune = tune;
    this.shift = shift;
    this.ranWithAudio = false;
    this.scoring.reset();

    const settings = playTuneSettings();
    const t = this.transport;
    t.bpm = tune.bpm;
    t.beatsPerBar = tune.beatsPerBar;
    // The device's own latency is the starting guess; the settings slider is
    // for whatever it does not account for.
    t.offset = this.ctx.audio.latencyMs / 1000 + settings.offsetMs / 1000;

    // Long enough that the first aura gets the whole lane to fall down, which
    // a bar on its own is not whenever the bar is shorter than the approach.
    const countIn = t.countInBeats(settings.leadBeats);
    t.start(this.ctx.audio.now, countIn);

    // The release deadline is baked alongside the onset, for the same reason:
    // one conversion out of beats onto the audio clock, done once.
    const specs: TargetSpec[] = fitted(this.role.chart(tune), shift).map((n) => ({
      note: n.note, beat: n.beat, len: n.len,
      time: t.timeOf(n.beat), end: t.timeOf(n.beat + n.len),
    }));
    this.judge = new Judge(specs);
    this.perOnset = specs.length
      ? specs.length / new Set(specs.map((s) => s.beat)).size
      : 1;
    this.lastStruck = -1;
    this.endsAt = t.timeOf(lastBeat(tune) + tune.beatsPerBar);
    this.phase = 'countin';

    // Before the bed is wired, not after: an instrument only takes effect on
    // the next note the engine builds, and the bed schedules ahead of itself.
    this.applyVoices(tune);

    // The bed plays whatever half of the arrangement the player is not, in the
    // tune's own key, without disturbing the scale picked in settings.
    const backing = this.role.backing(tune);
    this.ctx.bed.setTrack(
      backing.chords, t, tune.root + shift, SCALES[tune.scaleId],
      backing.pattern, tune.pickup ?? 0, backing.parts,
    );
    this.ctx.bed.setNoteTrack(
      backing.notes ? fitted(backing.notes, shift) : null, t,
    );
    this.ctx.bed.start();

    this.panel.setTune(tune);
    this.ctx.hud.banner(tune.title, 1.6);
    return true;
  }

  /**
   * Hand the engine the instruments this tune is written for.
   *
   * A tune that names neither gets the sound the app makes everywhere else,
   * which is most of what keeps the library from turning into a costume box.
   * The role picks the pair, because in the chord role the player is on the
   * accompanist's timbre and the game's tune is on a lead-ish bed voice — not
   * the tune's own two swapped over, which would not even resolve: `voiceId`
   * and `bedVoiceId` name entries in different banks.
   *
   * `stopPads` rather than trusting the bed to have cleared: `ChordBed.stop`
   * fades the pad *bus*, and `start` turns it back up. A chord already handed
   * to the engine is still ringing behind that fade — Drift's swell is nearly
   * four seconds — so choosing another tune quickly would raise the last one's
   * tail back up, in the last one's timbre, under the new one's first bar.
   *
   * The tempo goes with them because the delay is tempo-locked and PlayTune has
   * never pointed it anywhere: it kept whatever the previous mode left, which
   * at Für Elise's 168 is a smear rather than a dotted eighth.
   */
  private applyVoices(tune: Tune): void {
    const { audio } = this.ctx;
    const v = this.role.voices(tune);
    // Which bank the keys are read from depends on what the player is doing
    // with them, so the voicing goes first: the two setters below write to
    // different fields and only one of them is about to be heard.
    audio.setKeyVoicing(v.keyVoicing);
    if (v.keyVoicing === 'bed') audio.setKeyBedVoice(v.keys);
    else audio.setLeadVoice(v.keys);
    audio.setBedVoice(v.backing);
    audio.stopPads();
    audio.setTempo(tune.bpm);
  }

  private stopRun(): void {
    this.transport.stop();
    this.ctx.bed.clearTracks();
    // Stopped, not merely detached: leaving the scheduler running drops the bed
    // back onto the current scale's own loop, which then plays over whatever
    // screen comes next.
    this.ctx.bed.stop();
    // Anything still down was struck as the last tune's instrument and keeps it:
    // a voice holds the spec it was built with, and the setters below only reach
    // the next note. A player holding a key while the results screen is up — the
    // last note of a tune that ended under their hand — would otherwise ring on
    // through the next tune's count-in in the wrong timbre, and an organ, whose
    // envelope never decays, would still be there at the first bar.
    this.ctx.audio.allNotesOff();
    this.deck.allOff();
    // A tune's instruments are the tune's, the way Freestyle's are Freestyle's.
    // Deliberately not done in `finish`, which does not come through here: the
    // keys still sound on the results screen, and a tune you have just played
    // should still sound like itself while you read what you scored. Nothing
    // escapes the mode by it — the only ways out of `finished` are `start`,
    // which sets them again, and `exit`, which calls this.
    const { audio, music } = this.ctx;
    // The voicing goes back too, or every other mode's keys would still be
    // swelling like a pad. Nothing else in the app sets it.
    audio.setKeyVoicing('lead');
    audio.setLeadVoice(DEFAULT_LEAD_VOICE);
    audio.setBedVoice(DEFAULT_BED_VOICE);
    audio.setKeyBedVoice(DEFAULT_BED_VOICE);
    audio.setTempo(music.bpm);
    this.dropSting();
    this.judge = null;
    this.phase = 'idle';
  }

  private dropSting(): void {
    this.sting?.cancel();
    this.sting = null;
  }

  /** Fold the finished run into the saved progress and open the results. */
  private finish(): void {
    const tune = this.tune;
    const judge = this.judge;
    this.phase = 'finished';
    this.transport.stop();
    this.ctx.bed.clearTracks();
    this.ctx.bed.stop();
    if (!tune || !judge) return;
    // Anything still open when the tune ends was never played, and anything
    // still down was held to the end. Resolving both here keeps the tally on
    // the results screen adding up to the whole tune.
    judge.finish();

    const accuracy = judge.accuracy;
    const held = judge.holdAccuracy;
    const letter = grade(accuracy);
    const card = this.role.card(tune);
    const passed = accuracy >= card.pass;
    // Read before the write, and this is the whole reason it is a separate
    // line: `recordRun` folds this run into the record it hands back, so
    // `outcome.best` is the best *including* what just happened. Taken from
    // there, the mark on the dial would sit exactly under the needle on every
    // improved run and could never be seen to be crossed — and after the write
    // there is nowhere left that says where the player was.
    const wasBest = this.progress.best[tune.id]?.accuracy ?? null;
    const outcome = recordRun(this.role.storageKey, this.progress, tune.id, this.role.order, {
      accuracy, score: this.scoring.score, grade: letter, passed,
    });

    const next = outcome.unlocked ? findTune(outcome.unlocked) : null;
    // `recordRun` calls a first play an improvement, because there was nothing
    // to be worse than. True of the record and useless to say out loud: a run
    // that missed every note was being congratulated on a new best. Beating
    // something requires there to have been something.
    const beaten = wasBest !== null && outcome.improved;
    const stats: Stat[] = [
      { kind: 'count', label: 'Score', value: this.scoring.score },
      { kind: 'count', label: 'Longest run', value: judge.bestCombo },
    ];
    if (held !== null) stats.push({ kind: 'share', label: 'Notes held', value: held });
    if (judge.tally.wrong) {
      stats.push({ kind: 'count', label: 'Wrong keys', value: judge.tally.wrong, tone: 'warn' });
    }
    stats.push({
      kind: 'share',
      label: 'Best run',
      value: outcome.best.accuracy,
      ...(wasBest === null ? {} : { mark: wasBest }),
      tone: beaten ? 'good' : 'plain',
    });
    // On whether the run passed, not on whether it earned a letter: the pass
    // marks all sit at or below C, so a run can clear the tune and still have no
    // grade — and being told what to reach after you have reached it reads as a
    // fail.
    if (!passed) stats.push({ kind: 'share', label: 'To pass', value: card.pass, tone: 'warn' });

    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const marks: { at: number; label: string; kind: 'pass' | 'best' }[] = [
      { at: card.pass, label: `to pass ${pct(card.pass)}`, kind: 'pass' },
    ];
    if (wasBest !== null && wasBest > 0) {
      marks.push({ at: wasBest, label: `your best ${pct(wasBest)}`, kind: 'best' });
    }

    this.ctx.setResult({
      title: tune.title,
      subtitle: `${tune.composer} · ${this.role.label.toLowerCase()}`,
      hero: {
        value: accuracy,
        readout: { kind: 'percent' },
        badge: letter,
        marks,
        tone: passed ? 'good' : 'warn',
      },
      run: bucketRun(onsetVerdicts(judge.targets), RUN_COLUMNS),
      split: SPLIT_ORDER.map((t): Split => ({ tone: t, count: judge.tally[t] })),
      stats,
      banner: next ? { text: `${next.title} unlocked`, tone: 'good' }
        : beaten ? { text: 'A new best on this tune', tone: 'warn' } : null,
    });
    this.ctx.openScreen('result');

    // On the dial landing rather than on the panel opening: the cadence is what
    // the sweep arriving sounds like, and a resolution that goes off while the
    // ring is still climbing belongs to nothing. The tune's own key, tempo and
    // instrument are all still loaded, because `stopRun` is deliberately not on
    // this path.
    this.dropSting();
    this.sting = playSting(
      this.ctx.audio,
      tuneSting(
        tune.root + this.shift,
        SCALES[tune.scaleId],
        this.transport.beatSeconds,
        beaten && passed ? 'best' : passed ? 'pass' : 'short',
      ),
      TIMING.badge.at,
    );
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
    if (!audio.running) {
      // The context has gone away mid-run. The clock every judgement is made
      // against will never advance again, so end the attempt rather than leave
      // the player on a board that can no longer finish.
      if (this.ranWithAudio) this.finish();
      return;
    }
    this.ranWithAudio = true;

    const now = audio.now;
    if (this.phase === 'countin' && this.transport.beatAt(now) >= 0) this.phase = 'playing';

    const judge = this.judge;
    if (!judge) return;
    const at = this.transport.judgeTime(now);
    // One kick per chord that went by, not one per note of it.
    let lastMiss = -1;
    for (const missed of judge.expire(at)) {
      this.onMiss(missed, missed.time !== lastMiss);
      lastMiss = missed.time;
    }
    for (const done of judge.settleHolds(at)) this.onHoldSettled(done);

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
    // Read live rather than from the snapshot `start` took, so a lead changed
    // mid-run lands on the next frame. The approach is the transport's to work
    // out and not `leadBeats * beatSeconds`: past a point, a quicker tune stops
    // being allowed to charge for the same four beats in less time.
    const views = this.judge && this.ctx.audio.running
      ? this.auras.view(
        this.judge,
        this.transport.judgeTime(this.ctx.audio.now),
        this.transport.approachSeconds(settings.leadBeats),
        this.transport.beatSeconds,
      )
      : [];

    this.auras.drawStrikeLine(em, this.strikePulse);
    this.auras.draw(em, views);

    const highlight = settings.assist ? this.auras.highlightFor(views) : undefined;
    drawKeys(stage.ctx, em, stage, this.deck, highlight ? { highlight } : {});
    stage.particles.draw(em, stage.cam);

    stage.composite();
    if (settings.noteNames && this.tune) {
      this.auras.drawLabels(stage.ctx, views, this.tune.root + this.shift);
    }
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
    this.panel.update(this.judge, total ? this.judge!.judged / total : 0, this.harmony());
  }

  /**
   * What the bed is playing, and what it plays next.
   *
   * Named from the chord that was authored rather than read back off the
   * sounding notes: voice leading can leave a chord in any inversion, and the
   * player is being told which chord this *is*, not which one it looks like.
   */
  private harmony(): { now: string | null; next: string | null } {
    const tune = this.tune;
    if (!tune || this.phase === 'idle' || this.phase === 'finished' || !this.ctx.audio.running) {
      return { now: null, next: null };
    }
    const beat = this.transport.beatAt(this.ctx.audio.now);
    const scale = SCALES[tune.scaleId];
    const root = tune.root + this.shift;
    const name = (c: ChartChord | undefined): string | null =>
      c ? chordLabel(degreeToNote(c.degree, root, scale), c.quality, root) : null;

    // Merged, so the readout does not blink the same chord twice where the
    // library wrote a pickup beat and its bar as two entries. In the chord role
    // this is also what the player is being asked for, so the two have to agree.
    const chords = mergedChords(tune.chords);
    let at = -1;
    for (let i = 0; i < chords.length; i++) {
      if (chords[i].beat > beat) break;
      at = i;
    }
    const current = at >= 0 ? chords[at] : undefined;
    // During the count-in nothing is playing yet, so the panel shows what is
    // about to arrive instead of a blank.
    if (!current) return { now: null, next: name(chords[0]) };
    const sounding = beat < current.beat + current.len;
    return { now: sounding ? name(current) : null, next: name(chords[at + 1]) };
  }

  debugLines(): string {
    const j = this.judge;
    return `${this.role.id} ${this.phase}  beat ${this.transport.beatAt(this.ctx.audio.now).toFixed(1)}\n`
      + (j ? `hit ${j.judged}/${j.total}  acc ${(j.accuracy * 100).toFixed(0)}%` : 'no tune');
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
      const settled = this.judge?.release(e.note, this.transport.judgeTime(audio.now));
      if (settled) this.onHoldSettled(settled);
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

    // Whether this press is the first of its chord. The rest of the chord gets
    // its own ring in its own lane — that is the picture of a chord landing —
    // but only one of them shakes the screen or says so in words.
    const onset = result.target?.time ?? at;
    const lead = onset !== this.lastStruck;
    this.lastStruck = onset;

    this.strikePulse = 1;
    p.ring(g.cx, g.cy + 16, 14, hue, 60 + force * 60, 0.45);
    p.burst(g.cx, g.cy + 10, 0, 1, 320 + force * 700, hue, 10 + Math.round(force * 10));
    if (result.verdict === 'perfect') {
      // A second, tighter ring is the only thing that separates perfect from
      // good on screen, and it should be earned rather than shouted about.
      p.ring(g.cx, g.cy + 16, 20, hue, 30, 0.3);
      if (lead) this.ctx.stage.kick(1.2);
    }

    // A note with a tail is only part paid for on the way in; the rest arrives
    // when the hold settles, so dropping it at once genuinely costs points.
    const share = result.target?.holdJudged ? HOLD_FLOOR : 1;
    const worth = WORTH[result.verdict] * comboMultiplier(result.combo, this.perOnset) * share;
    this.scoring.add(worth, g.cx, g.cy + 60, {
      flat: true, quiet: result.verdict !== 'perfect',
      label: lead && result.verdict === 'perfect' ? 'PERFECT' : '',
      tone: hue / 360,
    });
  }

  /** The rest of a held note's worth, paid out when its tail resolves. */
  private onHoldSettled(target: Target): void {
    if (!target.verdict || target.hold === null) return;
    const key = this.deck.byNote.get(target.note);
    if (!key) return;
    const g = key.geom;
    // The note's own multiplier, not whatever the combo has become since. A
    // tail settles a frame or a bar after the onset that priced it, and by
    // then the next note may have raised the combo or a wrong key sent it to
    // zero — neither of which is anything this note did.
    const worth = WORTH[target.verdict] * (1 - HOLD_FLOOR) * target.hold
      * comboMultiplier(target.combo, this.perOnset);
    if (worth > 0) this.scoring.add(worth, g.cx, g.cy + 60, { flat: true, quiet: true });
    if (target.hold < 0.6) {
      // The same colourless nudge a wrong note gets. The tune did not stop, but
      // the note did, and the player should be able to see which one.
      this.ctx.stage.particles.spawn('spark', g.cx, g.cy + 12, 10,
        { vz: 70, maxLife: 0.24, size: 10, hue: 0 });
    }
  }

  private onMiss(target: Target, lead: boolean): void {
    const key = this.deck.byNote.get(target.note);
    if (!key) return;
    const g = key.geom;
    // The aura shatters where it would have landed, in grey rather than in its
    // own colour: a miss should read as the note going out, not going off.
    this.ctx.stage.particles.shatter(g.cx, g.cy + 30, 16, this.ctx.stage.hue(target.note), 11);
    if (lead) this.ctx.stage.kick(0.8);
  }

  private pan(x: number): number {
    return clamp01(x / FIELD.width) * 1.5 - 0.75;
  }
}
