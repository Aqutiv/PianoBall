import type { AudioEngine } from '../../audio/engine';
import type { ChordBed } from '../../audio/bed';
import { snapToScale, degreeToNote } from '../../audio/music';
import type { Game } from '../../game/game';
import type { Intensity } from '../../game/intensity';
import { RhythmBox } from '../../audio/rhythmBox';
import { findPattern } from '../../audio/patterns';
import { clamp, clamp01 } from '../../core/math';
import { LADDER } from './ladder';
import { pinballSettings } from './settings';
import { strikeFor } from './strikes';

/**
 * Turns what happens on the table into music.
 *
 * Everything the game emits is already tuned — elements carry a note, the
 * keybed carries the player's own playing — so this layer mostly decides
 * loudness, panning and timbre. The chord bed underneath is shared with every
 * other mode and lives elsewhere; the rhythm box is this mode's own, and
 * follows the rally rather than the mode, the way Freestyle's follows the run.
 */
export class PinballAudio {
  private offs: (() => void)[] = [];
  private timers: number[] = [];
  private readonly box: RhythmBox;

  constructor(
    private readonly engine: AudioEngine,
    private readonly bed: ChordBed,
    private readonly game: Game,
  ) {
    const first = LADDER.find((r) => r.drums)?.drums ?? '';
    this.box = new RhythmBox(engine, () => game.music.bpm, findPattern(first));
  }

  /** Whether the rhythm box is running. The teardown tests read this. */
  get drumming(): boolean { return this.box.playing; }

  /** Nothing should keep drumming behind a menu. */
  pause(): void { this.box.stop(); }

  /** Back to whatever rung the table is on, drums included. */
  resume(): void { this.apply(this.game.intensity); }

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
      // Groove is judged on the press, not on the ball's arrival. When a ball
      // landing on an element was what got judged, the thing being scored was
      // something the player could not aim at — a near-random gate that reset
      // the streak far more often than it extended it. Playing in time is a
      // thing a player can actually do.
      if (!engine.running) return;
      const groove = this.bed.groove;
      this.game.scoring.setGroove(groove.judge(engine.now) ? groove.multiplier : 1);
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

    // Each family of element is its own instrument; see `strikes.ts`. What
    // the impact and the energising buy is the same for all of them: louder,
    // and for a pitched body brighter, so a held note still lights up the
    // sound of the thing it is aimed at.
    offs.push(bus.on('element', ({ el, energised, impact, x }) => {
      const s = strikeFor(el);
      if (!s) return;
      const base = clamp(0.18 + impact / 2600, 0.12, 0.62) * (energised ? 1.5 : 1);
      const pan = this.pan(x);
      if (s.mallet && el.note !== null) {
        engine.mallet(el.note, base * s.mallet.gain, pan, clamp01(s.mallet.bright + (energised ? 0.4 : 0)));
      }
      if (s.drum) {
        const voice = s.drum.voices[pan < 0 || s.drum.voices.length < 2 ? 0 : 1];
        engine.drum(voice, Math.min(1, base * 1.6 * s.drum.gain));
      }
      if (s.roll) {
        // A roll's length follows the spin the hit has just put on the
        // element, dying away hit by hit; placed ahead on the audio clock.
        const n = Math.min(s.roll.max, Math.round(el.spinRate * s.roll.perSpin));
        const gain = Math.min(1, base * 1.2 * s.roll.gain);
        for (let i = 1; i <= n; i++) {
          engine.drum(s.roll.voice, gain * (1 - i / (n + 1)), engine.now + i * s.roll.gap);
        }
      }
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

    // The accompaniment follows the rally. Applied on the way in as well, so a
    // mode re-entered mid-run is not left on whatever rung it was detached at.
    offs.push(bus.on('intensity', ({ level }) => this.apply(level)));
    this.apply(this.game.intensity);
  }

  detach(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.box.stop();
    // The bed is shared. The other modes expect to find it plain.
    this.apply(0);
    // Leaving mid-flourish must not keep playing it into the next mode.
    for (const t of this.timers) clearTimeout(t);
    this.timers.length = 0;
  }

  /**
   * Put the bed and the drums on the rung the table is on.
   *
   * The bed takes it at the next bar. The drums fade rather than switch: a
   * rally that lapses is heard to wind down, not to be cut off, and one that
   * picks up again inside the fade simply climbs back.
   */
  private apply(level: Intensity): void {
    const rung = LADDER[level];
    this.bed.setLoopPattern(rung.pattern, rung.parts);
    if (rung.drums && pinballSettings().drums) {
      this.box.setPattern(findPattern(rung.drums));
      this.box.start();
      this.box.fadeTo(rung.level, 0.6);
    } else {
      this.box.fadeOut(0.35);
    }
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
