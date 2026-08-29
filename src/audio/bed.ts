import type { AudioEngine } from './engine';
import type { MusicState } from './musicState';
import type { ChordQuality } from '../game/table/schema';
import { Groove, chordNotes, degreeToNote, voiceLead } from './music';

/** A chord placed at a beat, for a bed driven by a written piece. */
export interface TrackChord {
  beat: number;
  len: number;
  degree: number;
  quality: ChordQuality;
}

/** What a track needs from a clock: where a beat falls, on the audio clock. */
export interface BeatClock {
  running: boolean;
  beatSeconds: number;
  timeOf(beat: number): number;
}

/** How often the scheduler wakes, and how far ahead it writes. */
const TICK_MS = 40;
const LOOKAHEAD = 0.15;

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

  private readonly engine: AudioEngine;
  private readonly music: MusicState;
  private timer = 0;
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

  constructor(engine: AudioEngine, music: MusicState) {
    this.engine = engine;
    this.music = music;
    this.groove = new Groove(music.bpm);
    this.barsLeft = this.barsPerChord;
    // A new scale means a new progression: start it from the top.
    music.bus.on('change', () => {
      this.groove.bpm = music.bpm;
      this.reset();
    });
  }

  get running(): boolean { return this.timer !== 0; }

  get enabled(): boolean { return this.on; }

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
    // Switching off silences what is already ringing; switching on lets it
    // through again and puts the next bar at the front of the queue.
    this.engine.setBedAudible(value);
    if (value) this.align();
  }

  /** Begin scheduling. Safe to call repeatedly; only the first one takes. */
  start(): void {
    if (this.timer) return;
    this.align();
    this.timer = window.setInterval(() => this.schedule(), TICK_MS);
  }

  /** Put the next bar at the front of the queue, with nothing to lead from. */
  private align(): void {
    this.nextBar = this.engine.now;
    this.lastVoicing = [];
  }

  stop(): void {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = 0;
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
  ): void {
    this.track = track;
    this.clock = clock;
    this.trackRoot = root;
    this.trackScale = scale;
    this.trackCursor = 0;
    this.lastVoicing = [];
  }

  /** Back to the top of the progression, with no voicing to lead from. */
  reset(): void {
    this.chordIndex = 0;
    this.barsLeft = this.barsPerChord;
    this.trackCursor = 0;
    this.align();
    this.groove.reset();
  }

  /** Push the progression on early. Completing an objective does this. */
  advance(): void {
    const n = this.music.progression.length;
    this.chordIndex = (this.chordIndex + 1) % n;
    this.barsLeft = this.barsPerChord;
  }

  /**
   * Current chord of the progression. The root is kept alongside the notes
   * because voice leading can leave it anywhere in the voicing, and the bass
   * still has to play the actual root.
   */
  get chordSpec(): { root: number; notes: number[] } {
    const m = this.music;
    const step = m.progression[this.chordIndex % m.progression.length];
    const root = degreeToNote(step.degree, m.root, m.scale) - 12;
    return { root, notes: chordNotes(root, step.quality) };
  }

  /** Bar-level lookahead. The only place in the app that schedules ahead. */
  private schedule(): void {
    if (!this.engine.running || !this.on) return;
    if (this.track && this.clock) { this.scheduleTrack(this.track, this.clock); return; }
    const now = this.engine.now;
    const bar = this.groove.beatSeconds * 4;
    // A long stall (a hidden tab, a slow load) must not turn into a burst of
    // catch-up bars all landing at once.
    if (this.nextBar < now - bar) this.nextBar = now;
    while (this.nextBar < now + LOOKAHEAD) {
      // The chord clock rides the bar loop rather than a timer of its own, so
      // a change always lands on a downbeat.
      if (this.barsLeft <= 0) this.advance();
      this.barsLeft--;
      this.play(bar);
      this.nextBar += bar;
    }
  }

  /**
   * A written piece: each chord is placed at its own beat rather than on a
   * rolling bar clock, so the harmony lines up with the melody the player is
   * being asked to play over it.
   */
  private scheduleTrack(track: readonly TrackChord[], clock: BeatClock): void {
    if (!clock.running) return;
    const now = this.engine.now;
    while (this.trackCursor < track.length) {
      const c = track[this.trackCursor];
      const at = clock.timeOf(c.beat);
      if (at > now + LOOKAHEAD) break;
      this.trackCursor++;
      // A chord whose moment has already passed — a slow load, a tab that was
      // hidden — is dropped rather than piled onto the present.
      if (at < now - 0.2) continue;
      const root = degreeToNote(c.degree, this.trackRoot, this.trackScale) - 12;
      const voiced = voiceLead(this.lastVoicing, chordNotes(root, c.quality));
      this.lastVoicing = voiced;
      const seconds = c.len * clock.beatSeconds;
      this.engine.pad(voiced, seconds * 1.05, 0.075, at);
      this.engine.pad([root - 12], seconds * 1.05, 0.05, at);
    }
  }

  private play(bar: number): void {
    const { root, notes } = this.chordSpec;
    const voiced = voiceLead(this.lastVoicing, notes);
    this.lastVoicing = voiced;
    this.engine.pad(voiced, bar * 1.05, 0.075);
    // The root an octave down, so the bed has a floor.
    this.engine.pad([root - 12], bar * 1.05, 0.05);
  }
}
