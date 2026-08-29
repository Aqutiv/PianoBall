import { World } from '../physics/world';
import type { Contact } from '../physics/world';
import { makeBall, type Ball } from '../physics/ball';
import { buildTable, type BuiltTable, type TableDef, type TableElement } from './table/schema';
import type { SoundTag } from '../physics/colliders';
import { Keybed, type LaunchEvent, type KeyState } from './keybed';
import { Tilt } from './tilt';
import { Scoring } from './scoring';
import { EventBus } from '../core/events';
import { makeRng } from '../core/rng';
import { clamp01 } from '../core/math';
import { pitchClass } from '../midi/notes';
import {
  identifyChord, findMode, retuneNote, MODES,
  type ActiveMusic, type MusicMode,
} from '../audio/music';
import { load, save } from '../core/storage';
import type { InputHub } from '../midi/inputHub';
import type { InputEvent } from '../midi/types';

export type GameState = 'attract' | 'serve' | 'play' | 'drained' | 'over';

export interface GameEvents {
  key: { key: KeyState; note: number; force: number; source: string };
  keyup: { note: number };
  launch: LaunchEvent;
  impact: { sound: SoundTag; energy: number; note: number | null; x: number; y: number; ball: number };
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
  energiseTime: 0.42,
  slowFactor: 0.42,
  slowCapacity: 3.2,
  slowRecharge: 0.28,
  maxBalls: 6,
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
  music!: ActiveMusic;
  /** A `MODES` id, or 'random' to re-roll at the start of every game. */
  modeChoice: string;

  state: GameState = 'attract';
  time = 0;
  ballsLeft = 0;
  /** Ball waiting at the top for the player to drop it with a key press. */
  held: Ball | null = null;
  /** Slow-motion reserve, 0..1, spent by holding sustain. */
  slowCharge = 1;
  slowActive = false;
  /** Multiplied into the loop's time scale. */
  timeScale = 1;

  private input: InputHub;
  private rng: () => number;
  private launches: LaunchEvent[] = [];
  private lastNoteTime = -99;
  private attractAt = 0;
  /** Seconds left on the pause between losing a ball and serving the next. */
  private drainedFor = -1;
  private chordBuffer: number[] = [];
  private bankResetAt = -1;
  /** The notes the table was authored with, by element id. */
  private readonly baseNotes = new Map<string, number | null>();
  /** The mode those notes were written in, and the source of every retune. */
  private baseMode!: MusicMode;

  constructor(input: InputHub, def: TableDef, cfg: Partial<GameConfig> = {}, seed = 0x5eed) {
    this.input = input;
    this.cfg = { ...DEFAULT_GAME, ...cfg };
    this.rng = makeRng(seed);

    this.world = new World({ width: def.width, height: def.height }, this.rng);
    this.table = buildTable(def);
    this.world.add(this.table.colliders);
    this.world.reindex();

    // Retunes always read from here rather than from the live notes, so
    // switching scale over and over can never compound into a drift.
    for (const el of this.table.elements) this.baseNotes.set(el.id, el.note);
    this.baseMode = findMode(def.music.mode) ?? MODES[0];
    this.modeChoice = load<{ mode: string }>('music', { mode: def.music.mode }).mode;
    this.setMode(this.resolveModeId());

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

  // ---------------------------------------------------------------- input ---

  private onInput(e: InputEvent): void {
    switch (e.type) {
      case 'noteon': {
        if (this.input.mapping.observe(e.note)) {
          const m = this.input.mapping.settings;
          this.keybed.remap(m.baseNote, m.count);
        }
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

  /** Notes landing within a few tens of milliseconds count as one chord. */
  private trackChord(note: number): void {
    if (this.time - this.lastNoteTime > 0.045) this.chordBuffer.length = 0;
    this.lastNoteTime = this.time;
    if (!this.chordBuffer.includes(note)) this.chordBuffer.push(note);
    if (this.chordBuffer.length === 3) {
      const name = identifyChord(this.chordBuffer);
      this.bus.emit('chord', { notes: [...this.chordBuffer], name: name ?? '' });
      // A named chord is worth more than three notes that merely arrived together.
      this.scoring.add(name ? 1200 : 500, this.def.width / 2, 520, {
        label: name ? name.toUpperCase() : 'CLUSTER', tone: 0.6, flat: true,
      });
    }
  }

  // ----------------------------------------------------------- ball flow ---

  newGame(): void {
    // Where 'random' re-rolls — before anything reads a note off the table.
    this.setMode(this.resolveModeId());
    this.scoring.reset();
    this.ballsLeft = this.cfg.ballsPerGame;
    this.tilt.reset();
    this.slowCharge = 1;
    for (const el of this.table.elements) this.resetElement(el);
    this.world.balls.length = 0;
    this.held = null;
    this.serve();
  }

  serve(): void {
    if (this.ballsLeft <= 0) { this.setState('over'); return; }
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
    this.ballsLeft--;
    this.drainedFor = 1.1;
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

  // ------------------------------------------------------------- stepping ---

  /** One fixed simulation step. `dt` is already scaled for slow-motion. */
  step(dt: number): void {
    this.time += dt;
    const realDt = dt / Math.max(0.01, this.timeScale);

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
    this.world.step(dt);

    if (this.state === 'attract') this.attractKeys();

    this.launches.length = 0;
    this.keybed.handleContacts(this.world.contacts, this.launches);
    for (const ev of this.launches) {
      this.scoring.breakChain();
      this.bus.emit('launch', ev);
    }
    this.launches.length = 0;

    this.processContacts(this.world.contacts);
    this.updateElements(dt);
    this.scoring.update(dt);
    this.scoring.setResonance(Math.max(1, this.scoring.resonance - 1.4 * dt));

    if (this.tilt.warning || this.tilt.tilted) {
      this.bus.emit('tilt', { warning: this.tilt.warning, tilted: this.tilt.tilted });
    }
  }

  /** Demo play behind the menus: the table is never a still image. */
  private attract(dt: number): void {
    this.attractAt -= dt;
    if (this.world.balls.length >= 2 || this.attractAt > 0) return;
    this.attractAt = 1.6 + this.rng() * 1.6;
    const x = 260 + this.rng() * 504;
    this.spawnBall(x, 1180 + this.rng() * 60, (this.rng() - 0.5) * 700, -this.rng() * 300);
    // Attract balls play themselves off the keybed.
    for (const el of this.table.elements) if (el.group === 'bank') { el.down = false; for (const c of el.colliders) c.enabled = true; }
  }

  private updateSlowMotion(realDt: number): void {
    if (this.slowActive && this.slowCharge > 0 && this.state === 'play') {
      this.slowCharge = Math.max(0, this.slowCharge - realDt / this.cfg.slowCapacity);
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
      window.setTimeout(() => this.keybed.noteOff(key.geom.note), 120);
    }
  }

  private processContacts(contacts: readonly Contact[]): void {
    for (const c of contacts) {
      if (c.impact > 24 && c.kind !== 'sensor-exit') {
        this.bus.emit('impact', {
          sound: c.sound, energy: c.impact, note: c.note,
          x: c.x, y: c.y, ball: c.ballId,
        });
      }
      if (!c.owner) continue;
      if (c.owner.startsWith('key:')) {
        if (c.kind === 'paddle' && c.impact > 60) this.scoring.breakChain();
        continue;
      }
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
      this.scoring.setResonance(this.scoring.resonance + 0.3);
      this.scoring.add(160, el.x, el.y, { label: 'RESONANCE', tone: 0.75, quiet: true });
    }

    switch (el.kind) {
      case 'bumper':
      case 'sling':
        this.scoring.chain();
        this.award(el, el.score * (energised ? 2 : 1));
        break;
      case 'target':
        if (el.down) break;
        this.scoring.chain();
        this.award(el, el.score * (energised ? 2 : 1));
        // Only the bank drops; standups stay up and just score.
        if (el.group === 'bank') {
          el.down = true;
          for (const col of el.colliders) col.enabled = false;
          this.checkBank();
        }
        break;
      case 'rollover':
        if (!el.down) { el.down = true; this.checkLanes(); }
        this.scoring.chain();
        this.award(el, el.score * (energised ? 2 : 1));
        break;
      case 'spinner':
        el.spinRate += Math.min(26, c.impact * 0.02);
        this.award(el, el.score * (energised ? 2 : 1));
        break;
      case 'post':
        break;
      default:
        break;
    }

    this.bus.emit('element', { el, energised, impact: c.impact, x: c.x, y: c.y });
  }

  private award(el: TableElement, base: number): void {
    const amount = this.scoring.add(base, el.x, el.y, { tone: el.note ? (el.note % 12) / 12 : 0 });
    this.bus.emit('score', { amount, total: this.scoring.score, x: el.x, y: el.y, label: '' });
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

  private checkLanes(): void {
    const lanes = this.table.elements.filter((e) => e.group === 'lanes');
    if (!lanes.length || lanes.some((e) => !e.down)) return;
    for (const el of lanes) el.down = false;
    this.scoring.setGroove(Math.min(6, this.scoring.groove + 1));
    this.scoring.add(2500, this.def.width / 2, 1236, { label: 'LANES', tone: 0.35, flat: true });
    this.bus.emit('objective', { id: 'lanes', label: 'LANES' });
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
    const def = this.def;
    const mode = findMode(id) ?? this.baseMode;
    this.music = {
      root: def.music.root,
      bpm: def.music.bpm,
      id: mode.id,
      label: mode.label,
      scale: mode.scale,
      progression: mode.progression,
    };
    for (const el of this.table.elements) {
      const base = this.baseNotes.get(el.id);
      if (base === null || base === undefined) continue;
      el.note = retuneNote(base, def.music.root, this.baseMode.scale, this.music.root, this.music.scale);
      // Contacts carry the collider's note, not the element's.
      for (const col of el.colliders) col.note = el.note;
    }
    this.bus.emit('music', {
      id: this.music.id, label: this.music.label,
      root: this.music.root, scale: this.music.scale,
    });
  }

  /** Remember what the player picked, and apply it now so they can hear it. */
  setModeChoice(choice: string): void {
    this.modeChoice = choice;
    save('music', { mode: choice });
    this.setMode(this.resolveModeId());
  }

  private resolveModeId(): string {
    // Deliberately not the seeded rng: that one exists so a run can be
    // replayed, whereas which scale you land in should genuinely vary.
    if (this.modeChoice === 'random') return MODES[Math.floor(Math.random() * MODES.length)].id;
    return this.modeChoice;
  }

  /** Rebuild the keybed after the mapped range changes. */
  remapKeybed(): void {
    const m = this.input.mapping.settings;
    this.keybed.remap(m.baseNote, m.count);
  }
}
