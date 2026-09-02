import { World } from '../physics/world';
import type { Contact, ContactKind } from '../physics/world';
import { makeBall, type Ball } from '../physics/ball';
import { buildTable, type BuiltTable, type TableDef, type TableElement } from './table/schema';
import type { SoundTag } from '../physics/colliders';
import { Keybed, type LaunchEvent, type KeyState } from './keybed';
import { Tilt } from './tilt';
import { Scoring } from './scoring';
import { EventBus } from '../core/events';
import { makeRng } from '../core/rng';
import { clamp, clamp01 } from '../core/math';
import { pitchClass } from '../midi/notes';
import { intensityOf, type Intensity } from './intensity';
import {
  identifyChord, findMode, retuneNote, classifyInterval, MODES,
  type ActiveMusic, type MusicMode, type IntervalClass,
} from '../audio/music';
import type { InputHub } from '../midi/inputHub';
import type { MusicState } from '../audio/musicState';
import type { InputEvent } from '../midi/types';

export type GameState = 'attract' | 'serve' | 'play' | 'drained' | 'over';

export interface GameEvents {
  key: { key: KeyState; note: number; force: number; source: string };
  keyup: { note: number };
  launch: LaunchEvent;
  /**
   * The ball meeting something. `energy` is the closing speed along the
   * normal and `slide` the speed across it, so the sound can tell a square
   * hit from a graze; `kind` tells a wall from a key from another ball.
   */
  impact: {
    sound: SoundTag; energy: number; slide: number; kind: ContactKind;
    note: number | null; x: number; y: number; nx: number; ny: number; ball: number;
  };
  element: { el: TableElement; energised: boolean; impact: number; x: number; y: number };
  score: { amount: number; total: number; x: number; y: number; label: string };
  drain: { x: number; y: number; ballId: number; saved: boolean };
  serve: { ballId: number };
  multiball: { count: number };
  objective: { id: string; label: string };
  state: { from: GameState; to: GameState };
  tilt: { warning: boolean; tilted: boolean };
  chord: { notes: number[]; name: string };
  music: { id: string; label: string; root: number; scale: number[] };
  /** How much is happening, for the music to follow. An edge, not a repeat. */
  intensity: { level: Intensity; from: Intensity };
  /** One tick of the bonus count: a note of the lost ball's rally, played back. */
  bonus: { note: number; index: number; count: number; amount: number; total: number; x: number; y: number };
  /** A charged ball struck a tuned element: the interval between the two. */
  interval: { ball: number; note: number; name: string; cls: IntervalClass; amount: number; x: number; y: number };
}

export interface GameConfig {
  ballsPerGame: number;
  /** Seconds of ball save after a serve. */
  saveTime: number;
  /** How long a key press keeps its matching elements energised. */
  energiseTime: number;
  /** Slow-motion factor and how many seconds of it a full meter holds. */
  slowFactor: number;
  slowCapacity: number;
  slowRecharge: number;
  maxBalls: number;
}

export const DEFAULT_GAME: GameConfig = {
  ballsPerGame: 3,
  saveTime: 6,
  energiseTime: 1.1,
  slowFactor: 0.42,
  slowCapacity: 3.2,
  slowRecharge: 0.28,
  maxBalls: 4,
};

/**
 * Seconds a lower reading has to persist before the intensity drops.
 *
 * Rising is instant, because a rally should be heard the moment it starts.
 * Falling waits, because a bar-long lull between two shots is part of a rally
 * rather than the end of one, and stripping the band down and building it
 * back up over every gap would turn the accompaniment into a nervous tic.
 */
export const INTENSITY_HOLD = 1.6;

/** The pause between losing a ball and serving the next, with nothing to count. */
const DRAIN_PAUSE = 1.1;

/**
 * The bonus count at the end of a ball is the ball's own rally, played back.
 *
 * A real machine counts its bonus up with a sound a tick; here each tick is
 * one of the notes the ball actually struck, so the count is a phrase the
 * player made rather than a number being read out. The phrase is fitted into
 * about two seconds whatever its length, and the last few notes of a long
 * rally stand for the whole of it.
 */
export const BONUS = {
  /** Notes played back: the most recent ones, if the rally was longer. */
  notes: 16,
  /** Seconds the phrase is fitted into, between the fastest and slowest tick. */
  span: 2.0,
  gapMin: 0.09,
  gapMax: 0.22,
  /** Silence before the first tick, so the drain's own fall is heard first. */
  lead: 0.5,
  /** Silence after the last, before the next ball is served. */
  tail: 0.6,
  /** Points a tick is worth, times the ball's best combo up to `comboCap`. */
  perNote: 150,
  comboCap: 12,
} as const;

/**
 * What the interval between the ball's note and an element's is worth.
 *
 * The consonances pay and are named on the table; seconds and sevenths count
 * for a little and say nothing, so a bumper rally is a run of light rather
 * than a wall of text. Multiplied like any other hit — it is the same shot.
 */
export const INTERVAL_SCORE: Record<IntervalClass, number> = {
  perfect: 500,
  consonant: 350,
  mild: 120,
  dissonant: 40,
};

export class Game {
  readonly bus = new EventBus<GameEvents>();
  readonly world: World;
  readonly table: BuiltTable;
  readonly keybed: Keybed;
  readonly tilt = new Tilt();
  readonly scoring = new Scoring();
  readonly cfg: GameConfig;
  /** The scale and chord loop currently in play. Set by `setMode`. */
  /** The key the table is currently in. Owned by the shared music state. */
  get music(): ActiveMusic { return this.musicState.active; }
  /** A `MODES` id, or 'random' to re-roll at the start of every game. */
  get modeChoice(): string { return this.musicState.choice; }

  state: GameState = 'attract';
  /** True only while the pinball mode is the one on screen. */
  active = false;
  time = 0;
  ballsLeft = 0;
  /** Ball waiting at the top for the player to drop it with a key press. */
  held: Ball | null = null;
  /** Slow-motion reserve, 0..1, spent by holding sustain. */
  slowCharge = 1;
  slowActive = false;
  /** Multiplied into the loop's time scale. */
  timeScale = 1;
  /** How much is happening, 0..3, for the music to follow. See `intensity.ts`. */
  intensity: Intensity = 0;
  /**
   * The note a key charges a ball with, given the key's own. Identity here;
   * the mode installs the same snapping its audio applies to the key, so the
   * interval the table scores is the one the player actually heard.
   */
  tuneNote: (note: number) => number = (note) => note;

  private input: InputHub;
  private rng: () => number;
  private launches: LaunchEvent[] = [];
  private lastNoteTime = -99;
  private attractAt = 0;
  /** Seconds left on the pause between losing a ball and serving the next. */
  private drainedFor = -1;
  private chordBuffer: number[] = [];
  /** Largest chord already scored from the current buffer. */
  private chordScored = 0;
  private bankResetAt = -1;
  /** Notes the attract demo is holding, and the sim time each is due to release. */
  private readonly attractHolds: { note: number; until: number }[] = [];
  /** Last tilt state broadcast, so `tilt` is an edge rather than a per-step spam. */
  private tiltWarned = false;
  private tiltedNow = false;
  /** When the rally first read lower than the level it is on, or -1. */
  private intensityLowSince = -1;
  /** The notes this ball has struck, oldest first, for the count at its end. */
  private readonly rally: { note: number; x: number; y: number }[] = [];
  /** The bonus count in progress, while the table is between balls. */
  private bonus: {
    notes: { note: number; x: number; y: number }[];
    amount: number;
    spacing: number;
    index: number;
    nextAt: number;
  } | null = null;
  /** The notes the table was authored with, by element id. */
  private readonly baseNotes = new Map<string, number | null>();
  /** The mode those notes were written in, and the source of every retune. */
  private baseMode!: MusicMode;
  private readonly musicState: MusicState;

  constructor(input: InputHub, def: TableDef, music: MusicState, cfg: Partial<GameConfig> = {}, seed = 0x5eed) {
    this.input = input;
    this.musicState = music;
    this.cfg = { ...DEFAULT_GAME, ...cfg };
    this.rng = makeRng(seed);

    this.world = new World({ width: def.width, height: def.height, magnus: 3e-3 }, this.rng);
    this.table = buildTable(def);
    this.world.add(this.table.colliders);
    this.world.reindex();

    // Retunes always read from here rather than from the live notes, so
    // switching scale over and over can never compound into a drift.
    for (const el of this.table.elements) this.baseNotes.set(el.id, el.note);
    this.baseMode = findMode(def.music.mode) ?? MODES[0];
    // The table's own notes are the source of every retune, so apply whatever
    // scale is already selected before anything reads a note off the playfield.
    this.retune();

    const m = input.mapping.settings;
    this.keybed = new Keybed(this.world, m.baseNote, m.count, def.keybed ?? {});

    input.on((e) => this.onInput(e));
  }

  get def(): TableDef { return this.table.def; }
  get balls(): Ball[] { return this.world.balls; }

  private setState(to: GameState): void {
    if (to === this.state) return;
    const from = this.state;
    this.state = to;
    this.bus.emit('state', { from, to });
  }

  private setIntensity(level: Intensity): void {
    if (level === this.intensity) return;
    const from = this.intensity;
    this.intensity = level;
    this.intensityLowSince = -1;
    this.bus.emit('intensity', { level, from });
  }

  /**
   * Follow the rally up at once and down only after a pause.
   *
   * Read off the scoring rather than off events, because the combo lapses on
   * a timer of its own and nothing announces that.
   */
  private updateIntensity(): void {
    const s = this.scoring;
    const raw = intensityOf({
      playing: this.state === 'play', combo: s.combo, resonance: s.resonance, multiball: s.multiball,
    });
    if (raw >= this.intensity) {
      this.intensityLowSince = -1;
      this.setIntensity(raw);
      return;
    }
    if (this.intensityLowSince < 0) this.intensityLowSince = this.time;
    else if (this.time - this.intensityLowSince >= INTENSITY_HOLD) this.setIntensity(raw);
  }

  // ---------------------------------------------------------------- input ---

  private onInput(e: InputEvent): void {
    // The table outlives the mode that shows it, and the input hub is shared.
    // Without this a note played in another mode would still work the keybed —
    // and queue launches that nothing is stepping to drain.
    if (!this.active) return;
    switch (e.type) {
      case 'noteon': {
        const force = this.input.force(e.raw);
        const key = this.keybed.noteOn(e.note, force);
        if (!key) return;
        this.bus.emit('key', { key, note: e.note, force, source: e.source });
        this.energise(e.note);
        this.trackChord(e.note);

        if (this.state === 'serve' && this.held) { this.release(key, force); return; }
        if (this.state === 'attract') return;
        // Forgiving strike: balls hovering near the face count as struck.
        if (!this.tilt.tilted) this.keybed.sweepNearby(key, this.launches);
        break;
      }
      case 'noteoff':
        this.keybed.noteOff(e.note);
        this.bus.emit('keyup', { note: e.note });
        break;
      case 'bend':
        this.tilt.setBend(e.value);
        break;
      case 'cc':
        if (e.controller === 64) this.slowActive = e.value >= 0.5;
        if (e.controller === 123) this.keybed.allOff();
        break;
      default:
        break;
    }
  }

  /** A pressed note lights every element tuned to that pitch class. */
  private energise(note: number): void {
    const pc = pitchClass(note);
    const until = this.time + this.cfg.energiseTime;
    for (const el of this.table.elements) {
      if (el.note !== null && pitchClass(el.note) === pc) el.energisedUntil = until;
    }
  }

  /**
   * Energising is a hold, not a flash.
   *
   * A press used to light its elements for a fraction of a second, which is far
   * too short to aim at — so the one mechanic that asks the player to *play*
   * rather than merely flip was unreachable. Keeping the note down keeps its
   * elements lit, which makes "hold the note you are shooting at" a real
   * decision with a real cost: that finger is not on a flipper.
   */
  private refreshEnergised(): void {
    let mask = 0;
    for (const k of this.keybed.keys) if (k.down) mask |= 1 << pitchClass(k.geom.note);
    if (!mask) return;
    const until = this.time + this.cfg.energiseTime;
    for (const el of this.table.elements) {
      if (el.note !== null && (mask & (1 << pitchClass(el.note)))) el.energisedUntil = until;
    }
  }

  /**
   * Notes landing within a few tens of milliseconds count as one chord.
   *
   * Every note from the third onwards re-scores, rather than only the third: a
   * four-note voicing is harder than a triad and used to be worth exactly the
   * same, because the fourth note arrived after the one test that could fire.
   */
  private trackChord(note: number): void {
    if (this.time - this.lastNoteTime > 0.045) {
      this.chordBuffer.length = 0;
      this.chordScored = 0;
    }
    this.lastNoteTime = this.time;
    if (!this.chordBuffer.includes(note)) this.chordBuffer.push(note);
    const n = this.chordBuffer.length;
    if (n < 3 || n <= this.chordScored) return;
    this.chordScored = n;

    const name = identifyChord(this.chordBuffer);
    this.bus.emit('chord', { notes: [...this.chordBuffer], name: name ?? '' });
    // A named chord is worth more than notes that merely arrived together, and
    // a wider voicing is worth more than a narrower one.
    const base = (name ? 1200 : 500) + 350 * (n - 3);
    this.scoring.add(base, this.def.width / 2, 520, {
      label: name ? name.toUpperCase() : 'CLUSTER', tone: 0.6, flat: true,
    });
  }

  // ----------------------------------------------------------- ball flow ---

  newGame(): void {
    // Where 'random' re-rolls — before anything reads a note off the table.
    this.musicState.roll();
    this.scoring.reset();
    this.ballsLeft = this.cfg.ballsPerGame;
    // The demo was mid-phrase when the player pressed start.
    this.attractHolds.length = 0;
    this.keybed.allOff();
    this.tiltWarned = false;
    this.tiltedNow = false;
    this.tilt.reset();
    this.slowCharge = 1;
    this.setIntensity(0);
    // Backspace inside a bonus count: what was being counted belonged to the
    // run that has just been thrown away.
    this.bonus = null;
    for (const el of this.table.elements) this.resetElement(el);
    this.world.balls.length = 0;
    this.held = null;
    this.serve();
  }

  serve(): void {
    if (this.ballsLeft <= 0) { this.setState('over'); return; }
    // A saved ball is served again without coming through here, so its rally
    // carries on; only a new ball starts a new one.
    this.rally.length = 0;
    const s = this.def.serve;
    const ball = makeBall(s.x, s.y);
    ball.safeFor = this.cfg.saveTime;
    this.world.addBall(ball);
    this.held = ball;
    this.scoring.startBall();
    this.setState('serve');
    this.bus.emit('serve', { ballId: ball.id });
  }

  /** The serve is a drop you aim: the key you press decides where it falls. */
  private release(key: KeyState, force: number): void {
    const ball = this.held;
    if (!ball) return;
    this.held = null;
    ball.note = this.tuneNote(key.geom.note);
    const lean = (key.geom.cx - this.def.width / 2) / (this.def.width / 2);
    ball.v.x = lean * 420 * (0.5 + force);
    ball.v.y = -120 - force * 200;
    this.setState('play');
  }

  /** Extra balls for multiball. Launched from the bumper nest so they scatter. */
  spawnBall(x: number, y: number, vx = 0, vy = 0): Ball | null {
    if (this.world.balls.length >= this.cfg.maxBalls) return null;
    const ball = makeBall(x, y, 19, vx, vy);
    ball.safeFor = 2.5;
    this.world.addBall(ball);
    this.scoring.setMultiball(this.world.balls.length);
    return ball;
  }

  private drain(ball: Ball, x: number, y: number): void {
    const saved = ball.safeFor > 0 && this.state !== 'attract';
    this.world.removeBall(ball.id);
    if (this.held === ball) this.held = null;
    this.bus.emit('drain', { x, y, ballId: ball.id, saved });
    this.scoring.setMultiball(this.world.balls.length);
    // Attract mode just keeps feeding the table; nothing is at stake.
    if (this.state === 'attract') return;

    if (saved) {
      const s = this.def.serve;
      const again = makeBall(s.x, s.y);
      again.safeFor = Math.max(1.5, ball.safeFor);
      this.world.addBall(again);
      this.held = again;
      this.setState('serve');
      return;
    }
    if (this.world.balls.length > 0) return;    // multiball continues

    this.tilt.reset();
    this.scoring.breakChain();
    // Losing the ball ends the rally now, not after the hold: the band stops
    // with it, and the drain's own fall is what the player hears instead.
    this.setIntensity(0);
    this.ballsLeft--;
    this.drainedFor = this.startBonus();
    this.setState('drained');
  }

  /**
   * Advance past the drain pause. Driven by simulation time rather than a
   * wall-clock timer, so the game stays in step with itself under slow-motion
   * and stays testable headlessly.
   */
  nextBall(): void {
    if (this.state !== 'drained') return;
    this.drainedFor = -1;
    if (this.ballsLeft <= 0) this.setState('over');
    else this.serve();
  }

  /**
   * Queue the bonus count for the ball just lost, and say how long the pause
   * before the next ball has to be to fit it. A ball that struck nothing has
   * nothing to count, and gets the plain pause.
   */
  private startBonus(): number {
    const notes = this.rally.slice(-BONUS.notes);
    if (!notes.length) return DRAIN_PAUSE;
    const spacing = clamp(BONUS.span / notes.length, BONUS.gapMin, BONUS.gapMax);
    const amount = BONUS.perNote * clamp(this.scoring.ballComboBest, 1, BONUS.comboCap);
    this.bonus = { notes, amount, spacing, index: 0, nextAt: this.time + BONUS.lead };
    return BONUS.lead + notes.length * spacing + BONUS.tail;
  }

  /**
   * Pay out whatever ticks of the count have come due. Simulation time, like
   * the drain pause it runs inside, so it is deterministic and headless; the
   * audio side sounds each tick as it is announced.
   */
  private tickBonus(): void {
    const b = this.bonus;
    if (!b) return;
    while (b.index < b.notes.length && this.time >= b.nextAt) {
      const n = b.notes[b.index];
      this.scoring.add(b.amount, n.x, n.y, {
        label: b.index === 0 ? 'BONUS' : '', tone: pitchClass(n.note) / 12, flat: true,
      });
      b.index++;
      b.nextAt += b.spacing;
      this.bus.emit('bonus', {
        note: n.note, index: b.index - 1, count: b.notes.length,
        amount: b.amount, total: b.amount * b.index, x: n.x, y: n.y,
      });
    }
    if (b.index >= b.notes.length) this.bonus = null;
  }

  // ------------------------------------------------------------- stepping ---

  /** One fixed simulation step. `dt` is already scaled for slow-motion. */
  step(dt: number): void {
    this.time += dt;
    const realDt = dt / Math.max(0.01, this.timeScale);

    this.tickBonus();
    if (this.drainedFor > 0) {
      this.drainedFor -= dt;
      if (this.drainedFor <= 0) this.nextBall();
    }

    this.updateSlowMotion(realDt);
    this.tilt.setBend(this.input.bend);
    this.tilt.update(dt);
    this.world.tilt.x = this.tilt.accelX(this.world.cfg.gravity);

    // A tilted table kills the paddles until the ball is lost.
    for (const k of this.keybed.keys) k.paddle.collider.enabled = !this.tilt.tilted;

    if (this.held) {
      this.held.p.x = this.def.serve.x;
      this.held.p.y = this.def.serve.y;
      this.held.v.x = 0;
      this.held.v.y = 0;
    }

    if (this.state === 'attract') this.attract(dt);

    this.keybed.update(dt);
    // Cradles are resolved before the solver, like the serve's own pin, so the
    // depenetration pass gets the last word on anything they overlap. A release
    // queues a launch here, which is why the queue is drained after the step
    // rather than before it — and never emptied here. A press that strikes a
    // ball hovering off the face queues its launch at input time, between
    // steps, and clearing the queue on the way in threw those away: the ball
    // flew, but nothing that listens for a launch ever heard about it.
    this.keybed.updateCatch(dt, this.state === 'play' && !this.tilt.tilted, this.launches);
    this.world.step(dt);

    if (this.state === 'attract') this.attractKeys();

    this.keybed.handleContacts(this.world.contacts, this.launches);
    // Returning the ball is not a failure. The combo lapses on its own if
    // nothing scores for a while, which is what makes a rally worth building.
    // The throw charges the ball with the key's note, which is what every
    // element it strikes from here is heard against.
    for (const ev of this.launches) {
      const ball = this.world.balls.find((b) => b.id === ev.ballId);
      if (ball) ball.note = this.tuneNote(ev.key.geom.note);
      this.bus.emit('launch', ev);
    }
    this.launches.length = 0;

    this.processContacts(this.world.contacts);
    this.refreshEnergised();
    this.updateElements(dt);
    this.scoring.update(dt);
    this.scoring.setResonance(Math.max(1, this.scoring.resonance - 0.55 * dt));
    this.updateIntensity();

    // Only on a change. Emitting every step made every listener responsible for
    // de-duplicating an event that was never really repeating.
    if (this.tilt.warning !== this.tiltWarned || this.tilt.tilted !== this.tiltedNow) {
      this.tiltWarned = this.tilt.warning;
      this.tiltedNow = this.tilt.tilted;
      this.bus.emit('tilt', { warning: this.tiltWarned, tilted: this.tiltedNow });
    }
  }

  /** Demo play behind the menus: the table is never a still image. */
  private attract(dt: number): void {
    // The demo's own note releases, on simulation time. A wall-clock timer here
    // would drift out of step under slow motion, fire after the mode had left,
    // and there is no `window` at all when the game is stepped headlessly.
    for (let i = this.attractHolds.length - 1; i >= 0; i--) {
      if (this.time < this.attractHolds[i].until) continue;
      this.keybed.noteOff(this.attractHolds[i].note);
      this.attractHolds.splice(i, 1);
    }
    this.attractAt -= dt;
    if (this.world.balls.length >= 2 || this.attractAt > 0) return;
    this.attractAt = 1.6 + this.rng() * 1.6;
    const x = 260 + this.rng() * 504;
    this.spawnBall(x, 1180 + this.rng() * 60, (this.rng() - 0.5) * 700, -this.rng() * 300);
    // Attract balls play themselves off the keybed.
    for (const el of this.table.elements) if (el.group === 'bank') { el.down = false; for (const c of el.colliders) c.enabled = true; }
  }

  /**
   * True when a ball is coming down fast into the last stretch before the
   * keybed — the moment the player has to have found a key by, and the one
   * they are most likely to lose the ball in.
   */
  private get inDanger(): boolean {
    if (this.state !== 'play') return false;
    for (const b of this.balls) {
      if (b.v.y < 0 && b.p.y < 470 && Math.hypot(b.v.x, b.v.y) > 900) return true;
    }
    return false;
  }

  private updateSlowMotion(realDt: number): void {
    // Sustain is the manual control, but it wants a thumb that is already on
    // the low notes. The table lends the same meter automatically at the one
    // moment it is needed, at a slower burn so it can never starve the pedal.
    const auto = !this.slowActive && this.inDanger;
    const on = (this.slowActive || auto) && this.slowCharge > 0 && this.state === 'play';
    if (on) {
      const burn = auto ? 0.6 : 1;
      this.slowCharge = Math.max(0, this.slowCharge - realDt * burn / this.cfg.slowCapacity);
      this.timeScale = this.cfg.slowFactor;
    } else {
      this.slowCharge = clamp01(this.slowCharge + realDt * this.cfg.slowRecharge / this.cfg.slowCapacity);
      this.timeScale = 1;
    }
  }

  /** In attract mode the table plays itself: keys fire under falling balls. */
  private attractKeys(): void {
    for (const ball of this.world.balls) {
      if (ball.v.y > 0 || ball.p.y > 340) continue;
      const key = this.keybed.keys.find((k) => Math.abs(ball.p.x - k.geom.cx) < k.geom.halfW);
      if (!key || key.since < 0.25) continue;
      const force = 0.45 + this.rng() * 0.45;
      this.keybed.noteOn(key.geom.note, force);
      this.bus.emit('key', { key, note: key.geom.note, force, source: 'debug' });
      this.energise(key.geom.note);
      this.keybed.sweepNearby(key, this.launches);
      this.attractHolds.push({ note: key.geom.note, until: this.time + 0.12 });
    }
  }

  private processContacts(contacts: readonly Contact[]): void {
    for (const c of contacts) {
      if (c.impact > 24 && c.kind !== 'sensor-exit') {
        this.bus.emit('impact', {
          sound: c.sound, energy: c.impact, slide: c.slide, kind: c.kind, note: c.note,
          x: c.x, y: c.y, nx: c.nx, ny: c.ny, ball: c.ballId,
        });
      }
      if (!c.owner) continue;
      if (c.owner.startsWith('key:')) continue;
      const el = this.table.byOwner.get(c.owner);
      if (!el || !el.enabled) continue;

      if (el.kind === 'drain') {
        if (c.kind !== 'sensor-enter') continue;
        const ball = this.world.balls.find((b) => b.id === c.ballId);
        if (ball) this.drain(ball, c.x, c.y);
        continue;
      }
      const isSensorElement = el.kind === 'rollover' || el.kind === 'spinner';
      if (isSensorElement ? c.kind !== 'sensor-enter' : c.kind === 'sensor-enter' || c.kind === 'sensor-exit') continue;
      this.hitElement(el, c);
    }
  }

  private hitElement(el: TableElement, c: Contact): void {
    const energised = el.energisedUntil > this.time;
    el.hitAt = this.time;
    el.flash = 1;

    if (energised) {
      this.scoring.setResonance(this.scoring.resonance + 0.45);
      this.scoring.add(160, el.x, el.y, { label: 'RESONANCE', tone: 0.75, quiet: true });
    }

    switch (el.kind) {
      case 'bumper':
      case 'sling':
        this.scoring.chain();
        this.award(el, el.score * (energised ? 2 : 1), c);
        break;
      case 'target':
        if (el.down) break;
        this.scoring.chain();
        this.award(el, el.score * (energised ? 2 : 1), c);
        // Only the bank drops; standups stay up and just score.
        if (el.group === 'bank') {
          el.down = true;
          for (const col of el.colliders) col.enabled = false;
          this.checkBank();
        }
        break;
      case 'rollover':
        if (!el.down) { el.down = true; this.checkGroup(el.group); }
        this.scoring.chain();
        this.award(el, el.score * (energised ? 2 : 1), c);
        break;
      case 'spinner':
        el.spinRate += Math.min(26, c.impact * 0.02);
        this.award(el, el.score * (energised ? 2 : 1), c);
        break;
      case 'post':
        break;
      default:
        break;
    }

    this.bus.emit('element', { el, energised, impact: c.impact, x: c.x, y: c.y });
  }

  private award(el: TableElement, base: number, c: Contact): void {
    const amount = this.scoring.add(base, el.x, el.y, { tone: el.note ? (el.note % 12) / 12 : 0 });
    this.bus.emit('score', { amount, total: this.scoring.score, x: el.x, y: el.y, label: '' });
    // Every pitched hit joins the rally, to be played back when the ball is
    // lost. Bounded, because a long multiball is many hundreds of them.
    if (el.note !== null) {
      this.rally.push({ note: el.note, x: el.x, y: el.y });
      if (this.rally.length > 64) this.rally.shift();
    }
    this.scoreInterval(el, c);
  }

  /**
   * The ball carries the note of the key that threw it, so every tuned
   * element it strikes sounds an interval, and the table pays for it by how
   * consonant it is. Which key the ball was thrown from starts to matter
   * musically and not only ballistically — and the same finger that aims a
   * shot is choosing what it will sound like when it lands.
   */
  private scoreInterval(el: TableElement, c: Contact): void {
    if (el.note === null) return;
    // At most four balls; a scan is the cheapest lookup there is.
    const ball = this.world.balls.find((b) => b.id === c.ballId);
    if (!ball || ball.note === null) return;
    const iv = classifyInterval(ball.note, el.note);
    const quiet = iv.cls === 'mild' || iv.cls === 'dissonant';
    // Above the element's own pop, so the name and the number do not collide.
    const amount = this.scoring.add(INTERVAL_SCORE[iv.cls], el.x, el.y + 46, {
      label: iv.name, tone: pitchClass(ball.note) / 12, quiet,
    });
    this.bus.emit('interval', {
      ball: ball.note, note: el.note, name: iv.name, cls: iv.cls, amount, x: el.x, y: el.y,
    });
  }

  // ----------------------------------------------------------- objectives ---

  /**
   * Clearing the scale-degree bank starts multiball — but only once. The bank
   * resets so the table keeps flowing, and clearing it again during multiball
   * pays a jackpot instead of stacking another wave of balls.
   */
  private checkBank(): void {
    const bank = this.table.elements.filter((e) => e.group === 'bank');
    if (!bank.length || bank.some((e) => !e.down)) return;
    this.bankResetAt = this.time + 1.6;

    if (this.world.balls.length > 1) {
      this.scoring.add(28000, this.def.width / 2, 764, { label: 'JACKPOT', tone: 0.12, flat: true });
      this.bus.emit('objective', { id: 'jackpot', label: 'JACKPOT' });
      return;
    }
    this.scoring.add(5000, this.def.width / 2, 764, { label: 'SCALE COMPLETE', tone: 0.5, flat: true });
    this.bus.emit('objective', { id: 'bank', label: 'SCALE COMPLETE' });
    this.startMultiball();
  }

  /**
   * A set of rollovers was completed. Both groups reset themselves so the table
   * keeps flowing; what they pay is what tells them apart.
   */
  private checkGroup(group: string | null): void {
    if (!group) return;
    const set = this.table.elements.filter((e) => e.group === group);
    if (!set.length || set.some((e) => !e.down)) return;
    for (const el of set) el.down = false;

    if (group === 'lanes') {
      this.scoring.setGroove(this.scoring.groove + 1);
      this.scoring.add(2500, this.def.width / 2, 1236, { label: 'LANES', tone: 0.35, flat: true });
      this.bus.emit('objective', { id: 'lanes', label: 'LANES' });
      return;
    }
    if (group === 'arc') {
      this.scoring.setResonance(this.scoring.resonance + 1);
      this.scoring.add(3200, this.def.width / 2, 486, { label: 'ARC', tone: 0.7, flat: true });
      this.bus.emit('objective', { id: 'arc', label: 'ARC' });
    }
  }

  startMultiball(): void {
    // One wave at a time: multiball must be re-qualified, not chained.
    if (this.world.balls.length > 1) return;
    let added = 0;
    const nest = this.table.elements.filter((e) => e.kind === 'bumper');
    for (const b of nest) {
      if (this.world.balls.length >= this.cfg.maxBalls) break;
      const ang = this.rng() * Math.PI * 2;
      if (this.spawnBall(b.x, b.y - b.r - 20, Math.cos(ang) * 380, Math.sin(ang) * 380)) added++;
    }
    if (added) this.bus.emit('multiball', { count: this.world.balls.length });
  }

  private resetElement(el: TableElement): void {
    el.down = false;
    el.flash = 0;
    el.hitAt = -99;
    el.energisedUntil = -99;
    el.spin = 0;
    el.spinRate = 0;
    el.enabled = true;
    for (const col of el.colliders) col.enabled = true;
  }

  private updateElements(dt: number): void {
    for (const el of this.table.elements) {
      if (el.flash > 0) el.flash = Math.max(0, el.flash - dt * 3.4);
      if (el.kind === 'spinner') {
        el.spin += el.spinRate * dt;
        el.spinRate *= Math.max(0, 1 - 1.9 * dt);
        if (Math.abs(el.spinRate) < 0.05) el.spinRate = 0;
      }
    }
    if (this.bankResetAt > 0 && this.time >= this.bankResetAt) {
      this.bankResetAt = -1;
      for (const el of this.table.elements) {
        if (el.group !== 'bank') continue;
        el.down = false;
        for (const col of el.colliders) col.enabled = true;
      }
    }
  }

  // ---------------------------------------------------------------- music ---

  /**
   * Put the game in a scale.
   *
   * The bed reads `this.music`; the playfield's own notes are mapped across by
   * scale degree, so the table and the backing can never end up in different
   * keys. Unknown ids fall back to the table's own mode, which is what a stale
   * saved preference looks like.
   */
  setMode(id: string): void {
    this.musicState.set(id);
  }

  /**
   * Carry the playfield into whatever scale is now selected.
   *
   * Elements are retuned from the notes they were *authored* with rather than
   * from their live ones, so switching scale over and over can never compound
   * into a drift.
   */
  retune(): void {
    const def = this.def;
    const m = this.musicState;
    for (const el of this.table.elements) {
      const base = this.baseNotes.get(el.id);
      if (base === null || base === undefined) continue;
      el.note = retuneNote(base, def.music.root, this.baseMode.scale, m.root, m.scale);
      // Contacts carry the collider's note, not the element's.
      for (const col of el.colliders) col.note = el.note;
    }
    this.bus.emit('music', { id: m.id, label: m.label, root: m.root, scale: m.scale });
  }

  /** Remember what the player picked, and apply it now so they can hear it. */
  setModeChoice(choice: string): void {
    this.musicState.setChoice(choice);
  }

  /** Rebuild the keybed after the mapped range changes. */
  remapKeybed(): void {
    const m = this.input.mapping.settings;
    this.keybed.remap(m.baseNote, m.count);
  }
}
