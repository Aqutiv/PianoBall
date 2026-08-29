import type { AudioEngine } from '../../audio/engine';
import type { ChordBed } from '../../audio/bed';
import { snapToScale, degreeToNote } from '../../audio/music';
import type { Game } from '../../game/game';
import { clamp } from '../../core/math';

/**
 * Turns what happens on the table into music.
 *
 * Everything the game emits is already tuned — elements carry a note, the
 * keybed carries the player's own playing — so this layer mostly decides
 * loudness, panning and timbre. The chord bed underneath is shared with every
 * other mode and lives elsewhere.
 */
export class PinballAudio {
  private offs: (() => void)[] = [];
  private timers: number[] = [];

  constructor(
    private readonly engine: AudioEngine,
    private readonly bed: ChordBed,
    private readonly game: Game,
  ) {}

  private pan(x: number): number {
    return clamp((x / this.game.def.width - 0.5) * 1.5, -1, 1);
  }

  /** Off-scale notes are nudged into the table's key when assist is on. */
  private tune(note: number): number {
    const m = this.game.music;
    return this.engine.settings.assist ? snapToScale(note, m.root, m.scale) : note;
  }

  attach(): void {
    const bus = this.game.bus;
    const engine = this.engine;
    const offs = this.offs;

    offs.push(bus.on('key', ({ key, note, force }) => {
      engine.noteOn(this.tune(note), force, this.pan(key.geom.cx));
    }));

    offs.push(bus.on('keyup', ({ note }) => {
      engine.noteOff(this.tune(note));
    }));

    // The launch itself gets an accent, so a good hit is audible as well as visible.
    offs.push(bus.on('launch', (ev) => {
      engine.ping(220 + ev.velocity * 520, 0.1 + ev.velocity * 0.16, this.pan(ev.x), 0.16);
    }));

    offs.push(bus.on('impact', ({ sound, energy, note, x }) => {
      engine.impact(sound, energy, this.pan(x), note);
    }));

    offs.push(bus.on('element', ({ el, energised, impact, x }) => {
      if (el.note === null) return;
      const gain = clamp(0.18 + impact / 2600, 0.12, 0.62) * (energised ? 1.5 : 1);
      engine.mallet(el.note, gain, this.pan(x), energised ? 0.85 : 0.45);
      // Judge against the beat grid, and let the streak drive the multiplier.
      // With no audio clock running there is no grid to be on time with.
      if (!engine.running) return;
      const groove = this.bed.groove;
      this.game.scoring.setGroove(groove.judge(engine.now) ? groove.multiplier : 1);
    }));

    // A recognised chord gets a lift; a random cluster does not.
    offs.push(bus.on('chord', ({ name }) => {
      if (name) engine.swell(true, 0.5, 0.16);
    }));

    offs.push(bus.on('drain', ({ saved }) => {
      engine.swell(false, saved ? 0.7 : 1.3, saved ? 0.22 : 0.32);
      this.bed.groove.reset();
    }));

    offs.push(bus.on('multiball', () => {
      engine.swell(true, 1.4, 0.4);
      this.arpeggio(6, 0.055, 0.3);
    }));

    // Completing something pushes the progression on early, and the chord it
    // lands on still gets its full run of bars rather than a stub.
    offs.push(bus.on('objective', () => {
      this.bed.advance();
      this.arpeggio(5, 0.07, 0.26);
    }));

    offs.push(bus.on('serve', () => { this.bed.groove.reset(); }));
  }

  detach(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    // Leaving mid-flourish must not keep playing it into the next mode.
    for (const t of this.timers) clearTimeout(t);
    this.timers.length = 0;
  }

  /** Rising run through the table's scale. Used for objectives and multiball. */
  private arpeggio(count: number, spacing: number, gain: number): void {
    const m = this.game.music;
    for (let i = 0; i < count; i++) {
      this.timers.push(window.setTimeout(() => {
        this.engine.mallet(degreeToNote(i, m.root, m.scale) + 12, gain, (i / count - 0.5) * 1.2, 0.8);
      }, i * spacing * 1000));
    }
  }
}
