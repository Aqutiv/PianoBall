import type { AudioEngine, RollHandle, Scheduled } from '../../audio/engine';
import type { ChordBed } from '../../audio/bed';
import { snapToScale } from '../../audio/music';
import type { Game } from '../../game/game';
import type { Intensity } from '../../game/intensity';
import type { KeyState } from '../../game/keybed';
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
/** A graze: sliding this fast, and this many times faster than it struck. One scrape per ball per gap. */
const SCRAPE_MIN = 300;
const SCRAPE_RATIO = 2.5;
const SCRAPE_GAP = 0.08;

/** A key press that landed on the beat. */
export interface GrooveHit {
  key: KeyState;
  note: number;
  streak: number;
}

export class PinballAudio {
  private offs: (() => void)[] = [];
  private readonly box: RhythmBox;
  /**
   * One-shots placed ahead on the clock — a flourish, a roll — with when each
   * will have finished. Leaving the mode takes back whatever is still to come,
   * the way clearing the timers used to; a sound already handed to the graph
   * is otherwise nobody's to stop.
   */
  private readonly ahead: { until: number; cancel(): void }[] = [];
  /**
   * Told of every press that lands on the beat. The mode shows the beat and
   * this layer judges it; a callback rather than a bus event because the bus
   * is the game's to publish on, and this is not the game.
   */
  onGroove: ((hit: GrooveHit) => void) | null = null;
  /** The last key struck: how hard, and where. The plunger fires from the serve it aimed. */
  private lastForce = 0.5;
  private lastPan = 0;
  /** The rolling sound under every live ball, by id. */
  private readonly rolls = new Map<number, RollHandle>();
  /** When each ball last scraped, so a long graze is one scrape and not forty. */
  private readonly scraped = new Map<number, number>();

  constructor(
    private readonly engine: AudioEngine,
    private readonly bed: ChordBed,
    private readonly game: Game,
  ) {
    const first = LADDER.find((r) => r.drums)?.drums ?? '';
    this.box = new RhythmBox(engine, () => game.music.bpm, findPattern(first));
    // A drummer, not a machine: a few milliseconds and a few percent either way.
    this.box.human = { rng: Math.random, jitter: 0.006, gain: 0.08 };
  }

  /** Whether the rhythm box is running. The teardown tests read this. */
  get drumming(): boolean { return this.box.playing; }

  /** Nothing should keep drumming, or rolling, behind a menu. */
  pause(): void {
    this.box.stop();
    this.stopRolls();
  }

  /**
   * Once a frame: a rolling sound under every ball on the table.
   *
   * A roll is a state the ball is in rather than something that happens to
   * it, so it cannot come off the bus; the mode calls this from its draw,
   * which is the rate the eye gets, and the engine smooths the rest. The
   * simulation never leaves the plane, so a ball is always on the table and
   * only its speed says how much it rolls: a ball in slow motion rolls
   * slowly, a resting ball is silent, and a ball that is gone is stopped.
   */
  frame(): void {
    const game = this.game;
    const seen = new Set<number>();
    for (const ball of game.balls) {
      if (!ball.alive) continue;
      seen.add(ball.id);
      let handle = this.rolls.get(ball.id);
      if (!handle) {
        // Not until audio can be heard: a roll opened while the context is
        // still locked is a no-op, and cached here it would stay one for the
        // life of the ball. Leave the ball unrolled and try again next frame.
        if (!this.engine.running) continue;
        handle = this.engine.roll();
        this.rolls.set(ball.id, handle);
      }
      const speed = Math.hypot(ball.v.x, ball.v.y) * game.timeScale;
      handle.update(speed, 1, this.pan(ball.p.x), this.depth(ball.p.y));
    }
    for (const [id, handle] of this.rolls) {
      if (seen.has(id)) continue;
      handle.stop();
      this.rolls.delete(id);
      this.scraped.delete(id);
    }
  }

  private stopRolls(): void {
    for (const handle of this.rolls.values()) handle.stop();
    this.rolls.clear();
    this.scraped.clear();
  }

  /** Back to whatever rung the table is on, drums included. */
  resume(): void { this.apply(this.game.intensity); }

  private pan(x: number): number {
    return clamp((x / this.game.def.width - 0.5) * 1.5, -1, 1);
  }

  /** How far up the table, 0 at the keys and 1 at the far wall. */
  private depth(y: number): number {
    const near = this.game.def.keybed?.baseY ?? 0;
    return clamp01((y - near) / Math.max(1, this.game.def.height - near));
  }

  /** Off-scale notes are nudged into the table's key when assist is on. */
  tune(note: number): number {
    const m = this.game.music;
    return this.engine.settings.assist ? snapToScale(note, m.root, m.scale) : note;
  }

  attach(): void {
    const bus = this.game.bus;
    const engine = this.engine;
    const offs = this.offs;

    offs.push(bus.on('key', ({ key, note, force }) => {
      engine.noteOn(this.tune(note), force, this.pan(key.geom.cx));
      this.lastForce = force;
      this.lastPan = this.pan(key.geom.cx);
      // Groove is judged on the press, not on the ball's arrival. When a ball
      // landing on an element was what got judged, the thing being scored was
      // something the player could not aim at — a near-random gate that reset
      // the streak far more often than it extended it. Playing in time is a
      // thing a player can actually do.
      if (!engine.running) return;
      const groove = this.bed.groove;
      const on = groove.judge(engine.now);
      this.game.scoring.setGroove(on ? groove.multiplier : 1);
      if (on) this.onGroove?.({ key, note, streak: groove.streak });
    }));

    offs.push(bus.on('keyup', ({ note }) => {
      engine.noteOff(this.tune(note));
    }));

    // The throw itself is the flipper's solenoid, harder the harder the key
    // was hit, so a good hit is audible as well as visible.
    offs.push(bus.on('launch', (ev) => {
      engine.mech('flipper', 0.5 + ev.velocity * 0.5, this.pan(ev.x));
    }));

    // The ball meeting the table: the surface rung at its own modes, from
    // wherever on the table it happened, as square or as glancing as it was.
    offs.push(bus.on('impact', ({ sound, energy, slide, kind, note, x, y, ball }) => {
      const pan = this.pan(x);
      if (kind === 'ball') {
        engine.mech('ballclick', clamp01(energy / 900), pan);
        return;
      }
      const depth = this.depth(y);
      const glance = energy / Math.max(1e-6, Math.hypot(energy, slide));
      engine.hit(sound, energy, { pan, depth, glance, note });
      // A graze — far more sliding than striking — scrapes as well, but a
      // ball skimming a rail touches it every step, and that is one scrape.
      if (slide > SCRAPE_MIN && slide > SCRAPE_RATIO * energy) {
        const last = this.scraped.get(ball) ?? -Infinity;
        if (engine.now - last >= SCRAPE_GAP) {
          this.scraped.set(ball, engine.now);
          engine.scrape(slide, pan, depth);
        }
      }
    }));

    // The serve: the spring let go, from the key that aimed it.
    offs.push(bus.on('state', ({ from, to }) => {
      if (from === 'serve' && to === 'play') engine.mech('plunger', 0.4 + this.lastForce * 0.6, this.lastPan);
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
      // The machine under the music: a coil, a target falling, a switch.
      if (s.mech) engine.mech(s.mech.name, Math.min(1, base * 1.4 * s.mech.gain), pan);
      if (s.roll) {
        // A roll's length follows the spin the hit has just put on the
        // element, dying away tick by tick; placed ahead on the audio clock.
        const n = Math.min(s.roll.max, Math.round(el.spinRate * s.roll.perSpin));
        const gain = Math.min(1, base * 1.2 * s.roll.gain);
        for (let i = 1; i <= n; i++) {
          const at = engine.now + i * s.roll.gap;
          this.hold(engine.mech(s.roll.mech, gain * (1 - i / (n + 1)), pan, at), at + 0.5);
        }
      }
    }));

    // The ball carries the note of the key that threw it, and every element
    // it strikes sounds the interval. The element's own body is already
    // played above; this is the dyad's second voice, underneath it, a little
    // louder when the interval is one worth hearing.
    offs.push(bus.on('interval', ({ ball, x, cls }) => {
      const gain = cls === 'perfect' || cls === 'consonant' ? 0.22 : 0.14;
      engine.mallet(ball, gain, this.pan(x), 0.5);
    }));

    // A recognised chord gets a lift; a random cluster does not.
    offs.push(bus.on('chord', ({ name }) => {
      if (name) engine.swell(true, 0.5, 0.16);
    }));

    offs.push(bus.on('drain', ({ saved, x }) => {
      engine.swell(false, saved ? 0.7 : 1.3, saved ? 0.22 : 0.32);
      // The ball into the trough, or the saver throwing it back.
      engine.mech(saved ? 'kickback' : 'trough', 0.9, this.pan(x));
      // The harmony comes home under the loss — through the dominant when the
      // ball is gone, and starting over; through the subdominant when it was
      // saved, and carrying on.
      this.bed.cadence(saved ? 'plagal' : 'authentic', saved ? 'resume' : 'restart');
      this.bed.groove.reset();
    }));

    offs.push(bus.on('multiball', () => {
      engine.swell(true, 1.4, 0.4);
      this.flourish('multiball');
    }));

    // Completing something pushes the progression on early, and the chord it
    // lands on still gets its full run of bars rather than a stub.
    offs.push(bus.on('objective', () => {
      this.bed.advance();
      this.flourish('objective');
    }));

    offs.push(bus.on('serve', () => { this.bed.groove.reset(); }));

    // The bonus count is the rally played back, a tick a note, rising and
    // brightening towards the end the way a machine's count gathers pace.
    offs.push(bus.on('bonus', ({ note, index, count, x }) => {
      const f = index / Math.max(1, count - 1);
      engine.mallet(note, 0.24 + 0.18 * f, this.pan(x), 0.55 + 0.4 * f);
    }));

    // The accompaniment follows the rally. Applied on the way in as well, so a
    // mode re-entered mid-run is not left on whatever rung it was detached at.
    offs.push(bus.on('intensity', ({ level }) => this.apply(level)));
    this.apply(this.game.intensity);
  }

  detach(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.onGroove = null;
    this.box.stop();
    this.stopRolls();
    // Leaving mid-flourish must not keep playing it into the next mode.
    for (const h of this.ahead) h.cancel();
    this.ahead.length = 0;
    // The bed is shared. The other modes expect to find it plain.
    this.apply(0);
  }

  /** Remember a one-shot placed ahead, dropping the ones already over. */
  private hold(handle: Scheduled, until: number): void {
    const now = this.engine.now;
    let keep = 0;
    for (const h of this.ahead) if (h.until > now) this.ahead[keep++] = h;
    this.ahead.length = keep;
    this.ahead.push({ until, cancel: () => handle.cancel() });
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
    this.bed.setLoopStyle({ voicing: rung.voicing, colour: rung.colour, bass: rung.bass });
    if (rung.drums && pinballSettings().drums) {
      this.box.setPattern(findPattern(rung.drums));
      this.box.start();
      this.box.fadeTo(rung.level, 0.6);
    } else {
      this.box.fadeOut(0.35);
    }
  }

  /**
   * A run through the chord the bed is playing, starting on the next
   * subdivision of the beat. Used for objectives and multiball.
   *
   * Through the chord rather than the scale, so it belongs to the harmony
   * under it, and on the grid rather than the instant it was asked for, so
   * it belongs to the beat. An objective's run goes up and turns back; a
   * multiball's is twice as fast and only climbs. Placed on the audio clock
   * and held on to, so leaving can still take it back.
   */
  private flourish(kind: 'objective' | 'multiball'): void {
    const tones = this.bed.chordTones;
    if (!tones.length) return;
    const groove = this.bed.groove;
    const order = kind === 'multiball' ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 1, 0];
    const spacing = kind === 'multiball' ? groove.stepSeconds / 2 : groove.stepSeconds;
    const gain = kind === 'multiball' ? 0.3 : 0.26;
    const start = groove.nextStep(this.engine.now);
    order.forEach((idx, i) => {
      const note = tones[idx % tones.length] + 12 * Math.floor(idx / tones.length) + 12;
      const at = start + i * spacing;
      this.hold(this.engine.mallet(note, gain, (i / order.length - 0.5) * 1.2, 0.8, at), at + 1);
    });
    // A multiball's run lands on a crash.
    if (kind === 'multiball') {
      const at = start + order.length * spacing;
      this.hold(this.engine.drum('crash', 0.8, at), at + 2);
    }
  }
}
