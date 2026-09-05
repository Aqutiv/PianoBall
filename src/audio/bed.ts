import type { AudioEngine, HeldPadHandle } from './engine';
import type { MusicState } from './musicState';
import type { ChordQuality } from '../game/table/schema';
import {
  Groove, approachNote, chordNotes, degreeToNote, voiceChord, voiceLead,
  type Step, type VoicingStyle,
} from './music';

export type BedControlMode = 'auto' | 'manual';
export type ManualChordQuality = Extract<ChordQuality, 'maj' | 'min' | 'dom7' | 'min7'>;
export interface ManualChord {
  root: number;
  quality: ManualChordQuality;
  velocity: number;
}

/** How a loop comes home: through its dominant, or its subdominant. */
export type CadenceKind = 'authentic' | 'plagal';
/** What the loop does once a cadence has landed: start again, or carry on where it was. */
export type AfterCadence = 'restart' | 'resume';
import {
  compEvents, ALL_PARTS, type CompEvent, type CompPart, type CompPattern, type Humanize,
} from './comp';
import { findBedVoice } from './voices';
import { soundsWithVoice, writtenNoteEvent } from './written';

/**
 * The hand on the bed, in the units a hand moves by: seconds and fractions.
 * The bed turns them into beats for each chord it writes, so the same feel
 * is the same feel at any tempo. Null is a sequencer, which is what the
 * tests want.
 */
export interface Feel {
  rng: () => number;
  /** Seconds either side of the written moment a struck note may land. */
  jitter: number;
  /** Fraction either side of the written gain. */
  gain: number;
  /** Seconds between the notes of a rolled chord. */
  roll: number;
  /** Multiplier on whatever lands on the bar line. */
  accent: number;
}

/** A chord placed at a beat, for a bed driven by a written piece. */
export interface TrackChord {
  beat: number;
  len: number;
  degree: number;
  quality: ChordQuality;
}

/** A single note placed at a beat, for a tune the game plays itself. */
export interface TrackNote {
  beat: number;
  len: number;
  note: number;
}

/** What a track needs from a clock: where a beat falls, on the audio clock. */
export interface BeatClock {
  running: boolean;
  beatSeconds: number;
  /** Needed by the accompaniment: a bass note belongs on the bar line. */
  beatsPerBar: number;
  timeOf(beat: number): number;
}

/** How the bass under the loop moves: on the root, or walking towards the next chord. */
export type BassStyle = 'root' | 'walk';

/**
 * How the scale's own loop is voiced, beyond which pattern plays it. All
 * optional; what is left out is the bed as it always was.
 */
export interface LoopStyle {
  voicing?: VoicingStyle;
  /** Colour from the key on top of the triad: half is the seventh, one adds the ninth. */
  colour?: number;
  bass?: BassStyle;
}

/** How often the scheduler wakes, and how far ahead it writes. */
const TICK_MS = 40;
const LOOKAHEAD = 0.15;
/**
 * How far in the past an event can be and still be handed over. Past this it
 * is dropped rather than piled onto the present — a slow load, a hidden tab.
 */
const LATE = 0.2;

/**
 * The slow chord bed under everything.
 *
 * Every other sound in the app plays the instant it happens; only this layer is
 * scheduled ahead, one bar at a time against the audio clock. That is what lets
 * a chord change always land on a downbeat without putting a lookahead queue
 * between a key press and the note it makes.
 */
export class ChordBed {
  readonly groove: Groove;
  /** Index into the current chord progression. */
  chordIndex = 0;
  /** Who is playing the chords. Set by the shell; left null, the bed is exact. */
  feel: Feel | null = null;
  /**
   * Bars each chord is held for. Two at 96 bpm is five seconds — the bed keeps
   * moving without turning into a backing track that competes with the player.
   */
  barsPerChord = 2;

  /**
   * Whether this mode wants a bed at all.
   *
   * Separate from the engine's `bed` setting, which is a master mute: Freestyle
   * starts silent underneath because the player came to make their own sound,
   * while the table wants its harmony from the first ball.
   */
  private on = true;
  private control: BedControlMode = 'auto';
  private manual: ManualChord | null = null;
  private manualPad: HeldPadHandle | null = null;
  private manualStarted = false;
  private manualVoice = '';
  private manualBeats = 0;
  private manualAt = 0;
  private manualMeter = 4;

  private readonly engine: AudioEngine;
  private music: MusicState;
  private musicListeners: (() => void)[] = [];
  /** Bare rather than `window.`-qualified, so the bed runs where it is tested. */
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBar = 0;
  /** Bars still owed to the current chord. */
  private barsLeft: number;
  /** The voicing the last bar used, so the next one can lead into it. */
  private lastVoicing: number[] = [];
  /** Set while a written piece is playing instead of the scale's own loop. */
  private track: readonly TrackChord[] | null = null;
  private clock: BeatClock | null = null;
  private trackRoot = 0;
  private trackScale: readonly number[] = [];
  private trackCursor = 0;
  private pattern: CompPattern = 'sustain';
  /** Which parts of the accompaniment this bed sounds. */
  private parts: readonly CompPart[] = ALL_PARTS;
  /**
   * How the scale's own loop is played, when no written piece is.
   *
   * Kept apart from `pattern` and `parts` above, which belong to a track and
   * are reset with it: a tune starting and finishing must not clobber what the
   * table asked for, and the table asking must not reach into a tune.
   */
  private loopPattern: CompPattern = 'sustain';
  private loopParts: readonly CompPart[] = ['chord', 'bass'];
  private loopVoicing: VoicingStyle = 'close';
  private loopColour = 0;
  private loopBass: BassStyle = 'root';
  /** Times round the loop so far. The second loop plays on the odd passes. */
  private pass = 0;
  /**
   * A cadence waiting to play, a chord a bar, ahead of whatever the loop was
   * doing. Queued rather than played at once, so it lands on a bar line like
   * every other change.
   */
  private cadenceQueue: Step[] = [];
  private afterCadence: AfterCadence = 'resume';
  /**
   * A tune the game plays itself, when the player is busy with the chords.
   *
   * It rides the same lookahead as the chord track rather than a scheduler of
   * its own, so that `stop` — which fades the pad bus — still kills everything
   * in one call. Two timers and two fades is exactly the shape of bug this
   * class has already had once.
   */
  private notes: readonly TrackNote[] | null = null;
  private noteCursor = 0;
  /** Beat the track's first bar line falls on. Non-zero when it has a pickup. */
  private barOrigin = 0;
  /**
   * Events expanded from chords whose turn has come, not yet sounded.
   *
   * A chord is turned into its accompaniment all at once, but the resulting
   * notes are handed to the engine a lookahead at a time. Building a Web Audio
   * graph for a whole bar of arpeggio in a single scheduler tick is a burst of
   * a hundred-odd nodes, which the audio thread absorbs but the frame it lands
   * on does not.
   */
  private pending: { at: number; ev: CompEvent }[] = [];

  constructor(engine: AudioEngine, music: MusicState) {
    this.engine = engine;
    this.music = music;
    this.groove = new Groove(music.bpm);
    this.barsLeft = this.barsPerChord;
    this.listenToMusic();
  }

  /** Follow the entering mode's music without retaining the previous listeners. */
  setMusic(music: MusicState): void {
    if (music === this.music) return;
    for (const off of this.musicListeners) off();
    this.clearManualChord();
    this.engine.stopPads();
    this.music = music;
    this.groove.bpm = music.bpm;
    this.listenToMusic();
    this.reset();
  }

  private listenToMusic(): void {
    const music = this.music;
    this.musicListeners = [
      music.bus.on('change', () => {
        this.groove.bpm = music.bpm;
        this.reset();
      }),
      music.bus.on('tempo', () => {
        this.advanceManualClock();
        this.groove.bpm = music.bpm;
      }),
    ];
  }

  get running(): boolean { return this.timer !== null; }

  get enabled(): boolean { return this.on; }

  get controlMode(): BedControlMode { return this.control; }
  get manualChord(): Readonly<ManualChord> | null { return this.manual; }

  setControlMode(mode: BedControlMode): void {
    if (mode === this.control) return;
    this.clearManualChord();
    this.pending.length = 0;
    this.engine.stopPads();
    this.control = mode;
    this.reset();
  }

  setManualChord(root: number, quality: ManualChordQuality, velocity = 0.7): void {
    if (this.control !== 'manual' || !this.on) return;
    this.manual = { root, quality, velocity };
    this.refreshManualChord();
  }

  clearManualChord(): void {
    this.manualPad?.release();
    this.manualPad = null;
    this.manual = null;
    this.manualStarted = false;
    this.manualBeats = 0;
  }

  transposeManualChord(semitones: number): void {
    if (this.manual && semitones) {
      this.setManualChord(this.manual.root + semitones, this.manual.quality, this.manual.velocity);
    }
  }

  setManualMeter(beats: number): void {
    this.manualMeter = Math.max(1, beats);
  }

  /** Also called when an instrument is picked while a chord is latched. */
  refreshManualChord(): void {
    this.manualPad?.release();
    this.manualPad = null;
    this.manualStarted = false;
    this.manualAt = this.engine.now;
    this.manualBeats = 0;
    if (!this.manual) return;
    // At the very top of MIDI, fold only overflowing upper tones down an
    // octave. The actual root and chord quality remain intact.
    const tones = chordNotes(this.manual.root, this.manual.quality).map((n) => {
      while (n > 127) n -= 12;
      while (n < 0) n += 12;
      return n;
    });
    this.manualPad = this.engine.holdPad(tones, this.manual.velocity);
    this.manualStarted = this.manualPad !== null;
    this.manualVoice = this.engine.bedVoice;
  }

  private advanceManualClock(): void {
    const now = this.engine.now;
    this.manualBeats += Math.max(0, now - this.manualAt) / this.groove.beatSeconds;
    this.manualAt = now;
  }

  private scheduleManual(): void {
    if (!this.manual) return;
    this.advanceManualClock();
    if (!this.engine.settings.bed) {
      this.manualPad?.release();
      this.manualPad = null;
      this.manualStarted = false;
      return;
    }
    const spec = findBedVoice(this.engine.bedVoice).spec;
    const repeats = spec.manualDecay ?? spec.pluck;
    if (!this.manualStarted || this.manualVoice !== this.engine.bedVoice
      || (repeats && this.manualBeats >= this.manualMeter * 2)) {
      // One strike after a stall, never a burst of missed repeats.
      this.refreshManualChord();
    }
  }

  /**
   * Turn the bed on or off.
   *
   * Switching it on puts the next bar at the front of the queue. Without that
   * the first chord waits for whatever bar the last mode left on the clock —
   * up to five seconds at the table's tempo, which reads as a button that does
   * nothing rather than as a bed about to start.
   */
  setEnabled(value: boolean): void {
    if (value === this.on) return;
    this.on = value;
    if (!value) {
      this.clearManualChord();
      this.pending.length = 0;
      this.engine.stopPads();
    }
    // Switching off silences what is already ringing; switching on lets it
    // through again and puts the next bar at the front of the queue.
    this.engine.setBedAudible(value);
    if (value) this.align();
  }

  /** Begin scheduling. Safe to call repeatedly; only the first one takes. */
  start(): void {
    if (this.timer !== null) return;
    this.align();
    // `stop` leaves the pads faded out, so starting has to bring them back —
    // to whatever this mode asked for rather than unconditionally on.
    this.engine.setBedAudible(this.on);
    this.timer = setInterval(() => this.schedule(), TICK_MS);
  }

  /** Put the next bar at the front of the queue, with nothing to lead from. */
  private align(): void {
    this.nextBar = this.engine.now;
    this.lastVoicing = [];
  }

  stop(): void {
    this.clearManualChord();
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.pending.length = 0;
    // Dropping the queue only stops what has not been written yet. A chord
    // already handed to the engine rings for its whole length — nearly four
    // seconds of Drift's swell — so the pads themselves have to be faded, or
    // the harmony plays on over the screen the run just left for.
    this.engine.setBedAudible(false);
  }

  /**
   * Play a written chord track against a clock, rather than the current
   * scale's own loop. The track carries its own tonic so that a tune in another
   * key does not disturb whatever the player chose in settings.
   */
  setTrack(
    track: readonly TrackChord[] | null,
    clock: BeatClock | null,
    root = 0,
    scale: readonly number[] = [],
    pattern: CompPattern = 'sustain',
    barOrigin = 0,
    parts: readonly CompPart[] = ALL_PARTS,
  ): void {
    this.track = track;
    this.clock = clock;
    this.trackRoot = root;
    this.trackScale = scale;
    this.trackCursor = 0;
    this.pattern = pattern;
    this.barOrigin = barOrigin;
    this.parts = parts;
    this.pending.length = 0;
    this.lastVoicing = [];
  }

  /**
   * A written tune the game plays, against the same clock as the chord track.
   *
   * Handed to the engine as single-note pads with a stab of an attack, which is
   * what already makes a comped chord sound struck rather than swelled — so no
   * new engine path, and it stops when the pad bus does. One call per note
   * rather than grouping the simultaneous ones, because `pad` divides its gain
   * by how many notes it is given and grouping would quietly halve a
   * harmonised phrase.
   */
  setNoteTrack(notes: readonly TrackNote[] | null, clock: BeatClock | null): void {
    this.notes = notes;
    if (clock) this.clock = clock;
    this.noteCursor = 0;
  }

  /** Drop both written tracks. What has already been handed over still rings. */
  clearTracks(): void {
    this.setTrack(null, null);
    this.notes = null;
    this.noteCursor = 0;
  }

  /** Back to the top of the progression, with no voicing to lead from. */
  reset(): void {
    this.chordIndex = 0;
    this.pass = 0;
    this.cadenceQueue.length = 0;
    this.barsLeft = this.barsPerChord;
    // A written track keeps its place. Rewinding the cursor here would send the
    // next sweep back over chords whose moment has passed, which drops every
    // one of them and leaves the bed silent for the rest of the piece — and a
    // scale change fires this while a tune is playing.
    if (!this.track) {
      this.trackCursor = 0;
      // The loop's own bar, half expanded, is in the old key. Left queued it
      // would play out over the first bar of the new one.
      this.pending.length = 0;
    }
    this.align();
    this.groove.reset();
  }

  /** Push the progression on early. Completing an objective does this. */
  advance(): void {
    const n = this.loop(this.pass).length;
    this.chordIndex = (this.chordIndex + 1) % n;
    if (this.chordIndex === 0) this.pass++;
    this.barsLeft = this.barsPerChord;
  }

  /**
   * Bring the loop home, from the next bar: the cadence's chords one bar
   * each, and then either the top of the loop again or the chord the loop
   * was on. A drain ends a ball, so it restarts; a save is a reprieve, so it
   * resumes. Nothing while a written piece is playing — its harmony is its own.
   */
  cadence(kind: CadenceKind, then: AfterCadence = 'resume'): void {
    if (this.track) return;
    const steps = this.music.cadences?.[kind];
    if (!steps?.length) return;
    this.cadenceQueue = [...steps];
    this.afterCadence = then;
  }

  /** Which loop a pass plays: the second every other time round, where the mode has one. */
  private loop(pass: number): readonly Step[] {
    const m = this.music;
    return pass % 2 === 1 && m.variation?.length ? m.variation : m.progression;
  }

  /**
   * The chord at an index of the current pass — and on the last bar of the
   * last chord, the turnaround instead, when there is one and the chord has
   * more than one bar to give.
   */
  private stepAt(index: number, lastBar: boolean): Step {
    const list = this.loop(this.pass);
    const m = this.music;
    if (lastBar && index === list.length - 1 && m.turnaround && this.barsPerChord >= 2) return m.turnaround;
    return list[index % list.length];
  }

  /** The chord after this index, which may be the first of the other loop. */
  private stepAfter(index: number): Step {
    const list = this.loop(this.pass);
    const next = (index + 1) % list.length;
    return next === 0 ? this.loop(this.pass + 1)[0] : list[next];
  }

  private rootOf(step: Step): number {
    const m = this.music;
    return degreeToNote(step.degree, m.root, m.scale) - 12;
  }

  /**
   * How the loop plays its chords, from the next bar on.
   *
   * Only the fields move. A bar already expanded into `pending` finishes as it
   * was written, which is what makes a change land on a bar line rather than
   * in the middle of one: the table can ask as often as it likes and the
   * accompaniment still only ever changes on a downbeat.
   */
  setLoopPattern(pattern: CompPattern, parts: readonly CompPart[] = ALL_PARTS): void {
    this.loopPattern = pattern;
    this.loopParts = parts;
  }

  /**
   * How the loop's chords are voiced, from the next bar on. Only the fields
   * move, like `setLoopPattern`; a bar already written keeps its voicing.
   */
  setLoopStyle(style: LoopStyle): void {
    this.loopVoicing = style.voicing ?? 'close';
    this.loopColour = style.colour ?? 0;
    this.loopBass = style.bass ?? 'root';
  }

  /** How the bass under the loop moves. */
  get bassStyle(): BassStyle { return this.loopBass; }

  /**
   * The tones the bed is sounding, as voiced. What a flourish arpeggiates,
   * so a run over the table is a run through the chord under it rather than
   * through the scale. The chord to come, before the first bar has played.
   */
  get chordTones(): number[] {
    return this.lastVoicing.length ? this.lastVoicing : this.chordSpec.notes;
  }

  /**
   * Current chord of the progression. The root is kept alongside the notes
   * because voice leading can leave it anywhere in the voicing, and the bass
   * still has to play the actual root.
   */
  get chordSpec(): { root: number; notes: number[] } {
    const step = this.stepAt(this.chordIndex, this.barsLeft === 0);
    const root = this.rootOf(step);
    return { root, notes: chordNotes(root, step.quality) };
  }

  /** Bar-level lookahead. The only place in the app that schedules ahead. */
  private schedule(): void {
    if (!this.engine.running || !this.on) return;
    if (this.control === 'manual') { this.scheduleManual(); return; }
    if (this.clock && (this.track || this.notes)) {
      if (this.notes) this.scheduleNotes(this.notes, this.clock);
      if (this.track) this.scheduleTrack(this.track, this.clock);
      // `scheduleTrack` flushes for itself; a note track on its own still has
      // to be handed over.
      else this.flush(this.engine.now, this.clock.beatSeconds);
      return;
    }
    const now = this.engine.now;
    const bar = this.groove.beatSeconds * 4;
    // A stall (a hidden tab, a slow load) must not turn into a burst of
    // catch-up bars all landing at once. A bar `flush` would drop as late is
    // re-aligned to now instead, so it plays late rather than not at all, and
    // the one after it goes back onto the grid.
    if (this.nextBar < now - LATE) this.nextBar = now;
    while (this.nextBar < now + LOOKAHEAD) {
      // The chord clock rides the bar loop rather than a timer of its own, so
      // a change always lands on a downbeat.
      if (this.cadenceQueue.length) {
        // A cadence, a chord a bar, in front of the loop; when it has landed
        // the loop either starts over or picks up where it was.
        const step = this.cadenceQueue.shift()!;
        const following = this.cadenceQueue[0] ?? this.stepAfterCadence();
        this.playStep(step, bar, following);
        if (!this.cadenceQueue.length && this.afterCadence === 'restart') {
          this.chordIndex = 0;
          this.barsLeft = this.barsPerChord;
          this.pass = 0;
        }
      } else {
        if (this.barsLeft <= 0) this.advance();
        this.barsLeft--;
        const last = this.barsLeft === 0;
        this.playStep(this.stepAt(this.chordIndex, last), bar, last ? this.stepAfter(this.chordIndex) : undefined);
      }
      // Onto the shared grid. `Groove` and the rhythm box both measure phase
      // from audio time zero, so the bed's downbeats have to land there too,
      // or the harmony moves against the drums. Rounding rather than ceiling
      // keeps the correction under half a bar, so the bar the bed is switched
      // on in reads as a pick-up rather than as a stumble — and once it is on
      // the grid every later bar stays there exactly.
      this.nextBar = Math.round((this.nextBar + bar) / bar) * bar;
    }
    // The bar is expanded all at once but handed over a lookahead at a time,
    // the way a written track is: a comped bar is a dozen stabs, each of which
    // has to land on its own beat rather than the instant the bar came due.
    this.flush(now, bar / 4);
  }

  /**
   * A written piece: each chord is placed at its own beat rather than on a
   * rolling bar clock, so the harmony lines up with the melody the player is
   * being asked to play over it.
   */
  private scheduleTrack(track: readonly TrackChord[], clock: BeatClock): void {
    if (!clock.running) return;
    const now = this.engine.now;
    const beat = clock.beatSeconds;
    while (this.trackCursor < track.length) {
      const c = track[this.trackCursor];
      const at = clock.timeOf(c.beat);
      if (at > now + LOOKAHEAD) break;
      this.trackCursor++;
      // A chord whose moment has already passed — a slow load, a tab that was
      // hidden — is dropped rather than piled onto the present.
      if (at < now - LATE) continue;
      const root = degreeToNote(c.degree, this.trackRoot, this.trackScale) - 12;
      const voiced = voiceLead(this.lastVoicing, chordNotes(root, c.quality));
      this.lastVoicing = voiced;
      // The chord is written out as the pattern plays it: one lookahead pays
      // for the whole of it, so the comping inside a chord costs no more
      // scheduler wakes than the single pad it replaces.
      const phase = c.beat - this.barOrigin;
      const opts = { human: this.human(beat) };
      for (const ev of compEvents(this.pattern, voiced, root, c.len, clock.beatsPerBar, phase, opts)) {
        // A role may keep only part of the accompaniment: PlayTune's chord role
        // leaves the bed the bass and takes the chords for the player.
        if (!this.parts.includes(ev.part)) continue;
        this.pending.push({ at: at + ev.offset * beat, ev });
      }
    }
    this.flush(now, beat);
  }

  /** The game's own tune, placed note by note against the same clock. */
  private scheduleNotes(notes: readonly TrackNote[], clock: BeatClock): void {
    if (!clock.running) return;
    const now = this.engine.now;
    while (this.noteCursor < notes.length) {
      const n = notes[this.noteCursor];
      const at = clock.timeOf(n.beat);
      if (at > now + LOOKAHEAD) break;
      this.noteCursor++;
      // A note whose moment has passed is dropped, not piled onto the present.
      if (at < now - LATE) continue;
      this.pending.push({ at, ev: writtenNoteEvent(n) });
    }
  }

  /** Hand the engine everything now due, and drop whatever the tab slept past. */
  private flush(now: number, beat: number): void {
    let keep = 0;
    const spec = findBedVoice(this.engine.bedVoice).spec;
    for (const p of this.pending) {
      if (p.at > now + LOOKAHEAD) { this.pending[keep++] = p; continue; }
      if (p.at < now - LATE) continue;
      // A plucked stab already rings across the following beats. Starting the
      // generic wash beside it would launch the same rendered string again at
      // the same pitch and moment, producing a loud, phase-locked transient.
      if (!soundsWithVoice(p.ev, spec)) continue;
      this.engine.pad(p.ev.notes, p.ev.len * beat, p.ev.gain, p.at, p.ev.attack * beat);
    }
    this.pending.length = keep;
  }

  /**
   * One bar of the loop, written out as the pattern plays it.
   *
   * `sustain` over `chord` and `bass` is the bed as it has always been: the
   * chord for the bar, and its root an octave down so there is a floor. The
   * other patterns are what a table asks for as a rally builds. Queued against
   * the bar line rather than handed straight to the engine, so a stab three
   * beats in lands three beats in.
   */
  private playStep(step: Step, bar: number, next?: Step): void {
    const root = this.rootOf(step);
    const notes = chordNotes(root, step.quality);
    const m = this.music;
    const key = { root: m.root, scale: m.scale };
    const voiced = voiceChord(this.lastVoicing, notes, this.loopVoicing, this.loopColour, key);
    this.lastVoicing = voiced;
    const beat = bar / 4;
    // When the chord to come is known — this is the last bar of this one — a
    // walking bass steps into it.
    const approach = this.loopBass === 'walk' && next ? approachNote(this.rootOf(next) - 12, key) : undefined;
    const opts = { human: this.human(beat), bass: { style: this.loopBass, approach } };
    for (const ev of compEvents(this.loopPattern, voiced, root, 4, 4, 0, opts)) {
      if (!this.loopParts.includes(ev.part)) continue;
      this.pending.push({ at: this.nextBar + ev.offset * beat, ev });
    }
  }

  /** What the loop plays once a cadence has landed: its top, or the chord it left. */
  private stepAfterCadence(): Step {
    return this.afterCadence === 'restart' ? this.loop(0)[0] : this.stepAt(this.chordIndex, false);
  }

  /** The feel, in beats of this length. */
  private human(beatSeconds: number): Humanize | undefined {
    const f = this.feel;
    if (!f) return undefined;
    return { rng: f.rng, jitter: f.jitter / beatSeconds, gain: f.gain, roll: f.roll / beatSeconds, accent: f.accent };
  }
}
