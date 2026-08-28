import { AudioEngine } from './engine';
import { Groove, chordNotes, snapToScale, degreeToNote } from './music';
import type { Game } from '../game/game';
import type { InputHub } from '../midi/inputHub';
import { clamp } from '../core/math';

/**
 * Turns what happens on the table into music.
 *
 * Everything the game emits is already tuned — elements carry a note, the
 * keybed carries the player's own playing — so this layer mostly decides
 * loudness, panning and timbre, and keeps a slow chord bed underneath so the
 * whole run reads as one piece rather than a pile of sound effects.
 */
export class AudioDirector {
  readonly engine = new AudioEngine();
  readonly groove: Groove;

  /** Index into the table's chord progression. */
  chordIndex = 0;
  /** Set true once the context has actually started. */
  get ready(): boolean { return this.engine.ready; }

  private game: Game;
  private input: InputHub;
  private nextBar = 0;
  private timer = 0;

  constructor(game: Game, input: InputHub) {
    this.game = game;
    this.input = input;
    this.groove = new Groove(game.def.music.bpm);
    this.wire();
  }

  /** Must be called from a user gesture. */
  async start(): Promise<boolean> {
    const ok = await this.engine.start();
    if (ok) {
      this.nextBar = this.engine.now + 0.1;
      this.timer = window.setInterval(() => this.schedule(), 40);
    }
    return ok;
  }

  stop(): void {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = 0;
    this.engine.allNotesOff();
  }

  private pan(x: number): number {
    return clamp((x / this.game.def.width - 0.5) * 1.5, -1, 1);
  }

  /** Off-scale notes are nudged into the table's key when assist is on. */
  private tune(note: number): number {
    const m = this.game.def.music;
    return this.engine.settings.assist ? snapToScale(note, m.root, m.scale) : note;
  }

  private wire(): void {
    const bus = this.game.bus;

    bus.on('key', ({ key, note, force }) => {
      this.engine.noteOn(this.tune(note), force, this.pan(key.geom.cx));
    });

    bus.on('keyup', ({ note }) => {
      this.engine.noteOff(this.tune(note));
    });

    // The launch itself gets an accent, so a good hit is audible as well as visible.
    bus.on('launch', (ev) => {
      this.engine.ping(220 + ev.velocity * 520, 0.1 + ev.velocity * 0.16, this.pan(ev.x), 0.16);
    });

    bus.on('impact', ({ sound, energy, note, x }) => {
      this.engine.impact(sound, energy, this.pan(x), note);
    });

    bus.on('element', ({ el, energised, impact, x }) => {
      if (el.note === null) return;
      const gain = clamp(0.18 + impact / 2600, 0.12, 0.62) * (energised ? 1.5 : 1);
      this.engine.mallet(el.note, gain, this.pan(x), energised ? 0.85 : 0.45);
      // Judge against the beat grid, and let the streak drive the multiplier.
      // With no audio clock running there is no grid to be on time with.
      if (!this.engine.ready) return;
      if (this.groove.judge(this.engine.now)) {
        this.game.scoring.setGroove(this.groove.multiplier);
      } else {
        this.game.scoring.setGroove(1);
      }
    });

    // A recognised chord gets a lift; a random cluster does not.
    bus.on('chord', ({ name }) => {
      if (name) this.engine.swell(true, 0.5, 0.16);
    });

    bus.on('drain', ({ saved }) => {
      this.engine.swell(false, saved ? 0.7 : 1.3, saved ? 0.22 : 0.32);
      this.groove.reset();
    });

    bus.on('multiball', () => {
      this.engine.swell(true, 1.4, 0.4);
      this.arpeggio(6, 0.055, 0.3);
    });

    bus.on('objective', () => {
      this.chordIndex = (this.chordIndex + 1) % this.game.def.music.progression.length;
      this.arpeggio(5, 0.07, 0.26);
    });

    bus.on('serve', () => { this.groove.reset(); });

    this.input.on((e) => {
      if (e.type === 'cc' && e.controller === 64) this.engine.setSustain(e.value >= 0.5);
      if (e.type === 'cc' && e.controller === 123) this.engine.allNotesOff();
    });
  }

  /** Rising run through the table's scale. Used for objectives and multiball. */
  private arpeggio(count: number, spacing: number, gain: number): void {
    const m = this.game.def.music;
    for (let i = 0; i < count; i++) {
      window.setTimeout(() => {
        this.engine.mallet(degreeToNote(i, m.root, m.scale) + 12, gain, (i / count - 0.5) * 1.2, 0.8);
      }, i * spacing * 1000);
    }
  }

  /** Current chord of the progression, as absolute notes. */
  get currentChord(): number[] {
    const m = this.game.def.music;
    const step = m.progression[this.chordIndex % m.progression.length];
    const root = degreeToNote(step.degree, m.root, m.scale) - 12;
    return chordNotes(root, step.quality);
  }

  /**
   * Bar-level lookahead for the bed. Everything else in the game plays the
   * instant it happens; only this slow layer is scheduled ahead.
   */
  private schedule(): void {
    if (!this.engine.ready) return;
    const now = this.engine.now;
    const bar = this.groove.beatSeconds * 4;
    while (this.nextBar < now + 0.15) {
      const chord = this.currentChord;
      this.engine.pad(chord, bar * 1.05, 0.075);
      // Root an octave down, so the bed has a floor.
      this.engine.pad([chord[0] - 12], bar * 1.05, 0.05);
      this.nextBar += bar;
    }
  }
}
