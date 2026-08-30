import type { AudioEngine } from './engine';
import type { MusicState } from './musicState';
import type { ChordQuality } from '../game/table/schema';
import { Groove, chordNotes, degreeToNote, voiceLead } from './music';
import { compEvents, type CompEvent, type CompPart, type CompPattern } from './comp';

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

/** Every part of an accompaniment, which is what a bed normally sounds. */
const ALL_PARTS: readonly CompPart[] = ['chord', 'bass', 'wash'];

/** Peak gain of a note the game plays. A chord stab is 0.055 across three tones. */
const NOTE_GAIN = 0.05;
/** Struck rather than swelled, in beats. The same figure `comp.ts` uses. */
const NOTE_ATTACK = 0.02;

/** What a track needs from a clock: where a beat falls, on the audio clock. */
export interface BeatClock {
  running: boolean;
  beatSeconds: number;
  /** Needed by the accompaniment: a bass note belongs on the bar line. */
  beatsPerBar: number;
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
    // A new scale means a new progression: start it from the top.
    music.bus.on('change', () => {
      this.groove.bpm = music.bpm;
      this.reset();
    });
    // A tempo move is not a new progression. Follow it and keep playing.
    music.bus.on('tempo', () => { this.groove.bpm = music.bpm; });
  }

  get running(): boolean { return this.timer !== null; }

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
    this.barsLeft = this.barsPerChord;
    // A written track keeps its place. Rewinding the cursor here would send the
    // next sweep back over chords whose moment has passed, which drops every
    // one of them and leaves the bed silent for the rest of the piece — and a
    // scale change fires this while a tune is playing.
    if (!this.track) this.trackCursor = 0;
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
    // A long stall (a hidden tab, a slow load) must not turn into a burst of
    // catch-up bars all landing at once.
    if (this.nextBar < now - bar) this.nextBar = now;
    while (this.nextBar < now + LOOKAHEAD) {
      // The chord clock rides the bar loop rather than a timer of its own, so
      // a change always lands on a downbeat.
      if (this.barsLeft <= 0) this.advance();
      this.barsLeft--;
      this.play(bar);
      // Onto the shared grid. `Groove` and the rhythm box both measure phase
      // from audio time zero, so the bed's downbeats have to land there too,
      // or the harmony moves against the drums. Rounding rather than ceiling
      // keeps the correction under half a bar, so the bar the bed is switched
      // on in reads as a pick-up rather than as a stumble — and once it is on
      // the grid every later bar stays there exactly.
      this.nextBar = Math.round((this.nextBar + bar) / bar) * bar;
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
    const beat = clock.beatSeconds;
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
      // The chord is written out as the pattern plays it: one lookahead pays
      // for the whole of it, so the comping inside a chord costs no more
      // scheduler wakes than the single pad it replaces.
      const phase = c.beat - this.barOrigin;
      for (const ev of compEvents(this.pattern, voiced, root, c.len, clock.beatsPerBar, phase)) {
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
      if (at < now - 0.2) continue;
      this.pending.push({
        at,
        ev: {
          offset: 0, len: n.len, notes: [n.note],
          gain: NOTE_GAIN, attack: NOTE_ATTACK, part: 'chord',
        },
      });
    }
  }

  /** Hand the engine everything now due, and drop whatever the tab slept past. */
  private flush(now: number, beat: number): void {
    let keep = 0;
    for (const p of this.pending) {
      if (p.at > now + LOOKAHEAD) { this.pending[keep++] = p; continue; }
      if (p.at < now - 0.2) continue;
      this.engine.pad(p.ev.notes, p.ev.len * beat, p.ev.gain, p.at, p.ev.attack * beat);
    }
    this.pending.length = keep;
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
