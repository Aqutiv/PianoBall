import type { World, Paddle } from '../physics/world';
import type { Contact } from '../physics/world';
import { segment, MATERIALS } from '../physics/colliders';
import { v2 } from '../physics/vec2';
import { clamp, clamp01 } from '../core/math';
import { buildKeyLayout, type KeyGeom, type KeybedLayout } from './keyLayout';

export interface KeyState {
  geom: KeyGeom;
  paddle: Paddle;
  /** Current extension towards the playfield, in table units. */
  pos: number;
  /** Extension rate, table units/s. Fed to the paddle as surface velocity. */
  rate: number;
  /** Extension the current press is heading for. */
  peak: number;
  down: boolean;
  /** Normalised velocity of the press that is currently sounding, 0..1. */
  velocity: number;
  /** Seconds since the last note-on. */
  since: number;
  /** Simulation time of the last note-on; drives the glow. */
  litAt: number;
  /** Balls this press has already launched, so one press cannot double-hit. */
  launched: Set<number>;
}

export interface LaunchEvent {
  key: KeyState;
  ballId: number;
  velocity: number;
  speed: number;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  /** Where across the key face it was struck, -1..1. Drives the aim. */
  offset: number;
}

export interface KeybedTuning {
  /** Extension of the key at the softest and hardest usable press. */
  minTravel: number;
  maxTravel: number;
  /** Time for a key to reach full extension. Short: this is the whole feel. */
  attack: number;
  release: number;
  /** Launch speed floor and velocity gain, table units/s. */
  baseSpeed: number;
  velocitySpeed: number;
  /** How much incoming ball speed is carried through the launch. */
  carry: number;
  /** Maximum aim deflection from striking the edge of a key, radians. */
  spread: number;
  /**
   * How far the outer keys aim back towards the middle of the table, radians.
   * The keybed is a crown, so its surface normal leans outwards at the edges —
   * launching along it would fire straight into an outlane. Leaning the throw
   * inwards instead makes the far keys a recovery tool rather than a trap.
   */
  lean: number;
  /** Balls this close to the face when a key fires still count as a hit. */
  reach: number;
  /** Seconds after a press during which contacts still launch. */
  window: number;
}

export const DEFAULT_TUNING: KeybedTuning = {
  minTravel: 7,
  maxTravel: 23,
  attack: 0.024,
  release: 0.085,
  baseSpeed: 540,
  velocitySpeed: 1420,
  carry: 0.34,
  spread: 0.62,
  lean: 0.23,
  reach: 22,
  window: 0.075,
};

/**
 * The 32 (or however many) key paddles along the bottom of the table.
 *
 * Physics gives us the bounce; this class owns the *feel*: how far a key throws
 * a ball for a given MIDI velocity, and how striking the left or right side of
 * a key aims the launch. That aiming is the skill ceiling of the whole game.
 */
export class Keybed {
  readonly keys: KeyState[] = [];
  readonly byNote = new Map<number, KeyState>();
  layout: KeybedLayout;
  tuning: KeybedTuning;
  /** Simulation clock in seconds, advanced by `update`. */
  time = 0;

  private world: World;

  constructor(world: World, baseNote: number, count: number, layoutOverrides: Partial<KeybedLayout> = {}, tuning: Partial<KeybedTuning> = {}) {
    this.world = world;
    this.tuning = { ...DEFAULT_TUNING, ...tuning };
    const built = buildKeyLayout(baseNote, count, layoutOverrides);
    this.layout = built.layout;
    for (const geom of built.keys) this.keys.push(this.makeKey(geom));
    for (const k of this.keys) this.byNote.set(k.geom.note, k);
  }

  /** Rebuild for a different controller range without recreating the world. */
  remap(baseNote: number, count: number): void {
    for (const k of this.keys) {
      const i = this.world.paddles.indexOf(k.paddle);
      if (i >= 0) this.world.paddles.splice(i, 1);
    }
    this.keys.length = 0;
    this.byNote.clear();
    const built = buildKeyLayout(baseNote, count, this.layout);
    this.layout = built.layout;
    for (const geom of built.keys) this.keys.push(this.makeKey(geom));
    for (const k of this.keys) this.byNote.set(k.geom.note, k);
  }

  private makeKey(geom: KeyGeom): KeyState {
    const collider = segment(v2(0, 0), v2(0, 0), 5, {
      material: MATERIALS.key,
      owner: `key:${geom.lane}`,
      note: geom.note,
    });
    const paddle: Paddle = {
      collider,
      pivot: v2(geom.cx, geom.cy),
      omega: 0,
      vel: v2(0, 0),
      kick: 0,
    };
    const key: KeyState = {
      geom, paddle,
      pos: 0, rate: 0, peak: 0,
      down: false, velocity: 0, since: 99,
      litAt: -99, launched: new Set<number>(),
    };
    this.placePaddle(key);
    this.world.addPaddle(paddle);
    return key;
  }

  /** Position the paddle capsule for the key's current extension. */
  private placePaddle(k: KeyState): void {
    const g = k.geom;
    const ox = Math.cos(g.tilt), oy = Math.sin(g.tilt);   // along the key face
    const px = g.cx + g.nx * k.pos;
    const py = g.cy + g.ny * k.pos;
    const c = k.paddle.collider;
    c.a.x = px - ox * g.halfW; c.a.y = py - oy * g.halfW;
    c.b.x = px + ox * g.halfW; c.b.y = py + oy * g.halfW;
    c.n.x = g.nx; c.n.y = g.ny;
    c.aabb.minX = Math.min(c.a.x, c.b.x) - c.r;
    c.aabb.maxX = Math.max(c.a.x, c.b.x) + c.r;
    c.aabb.minY = Math.min(c.a.y, c.b.y) - c.r;
    c.aabb.maxY = Math.max(c.a.y, c.b.y) + c.r;
    k.paddle.pivot.x = px; k.paddle.pivot.y = py;
    k.paddle.vel.x = g.nx * k.rate;
    k.paddle.vel.y = g.ny * k.rate;
  }

  noteOn(note: number, velocity01: number): KeyState | null {
    const k = this.byNote.get(note);
    if (!k) return null;
    k.down = true;
    k.velocity = clamp01(velocity01);
    k.since = 0;
    k.litAt = this.time;
    k.launched.clear();
    const t = this.tuning;
    k.peak = t.minTravel + (t.maxTravel - t.minTravel) * k.velocity;
    return k;
  }

  noteOff(note: number): void {
    const k = this.byNote.get(note);
    if (k) k.down = false;
  }

  allOff(): void {
    for (const k of this.keys) { k.down = false; k.peak = 0; }
  }

  /** Advance the key envelopes and hand the resulting motion to the solver. */
  update(dt: number): void {
    this.time += dt;
    const t = this.tuning;
    for (const k of this.keys) {
      k.since = Math.min(k.since + dt, 99);
      let next: number;
      if (k.down) {
        if (k.since < t.attack) {
          // Ease-out: fastest at the very start, which is what throws the ball.
          const u = k.since / t.attack;
          next = k.peak * (1 - (1 - u) * (1 - u));
        } else {
          next = k.peak;
        }
      } else {
        next = k.pos * Math.max(0, 1 - dt / t.release);
        if (next < 0.01) next = 0;
      }
      k.rate = dt > 0 ? (next - k.pos) / dt : 0;
      k.pos = next;
      this.placePaddle(k);
    }
  }

  /**
   * Forgiveness pass, run the instant a key goes down: any ball hovering just
   * off the face counts as struck. Without this, hitting a fast-moving ball
   * would demand millisecond timing and the game would feel unfair rather than
   * hard.
   */
  sweepNearby(k: KeyState, out: LaunchEvent[]): void {
    const g = k.geom;
    const reach = this.tuning.reach;
    for (const ball of this.world.balls) {
      if (!ball.alive || k.launched.has(ball.id)) continue;
      const dx = ball.p.x - g.cx, dy = ball.p.y - g.cy;
      // Local frame: along the face, and out along the normal.
      const along = dx * Math.cos(g.tilt) + dy * Math.sin(g.tilt);
      const out2 = dx * g.nx + dy * g.ny;
      if (Math.abs(along) > g.halfW + ball.r) continue;
      if (out2 < -2 || out2 > ball.r + reach) continue;
      const ev = this.launch(k, ball.id, along / g.halfW, ball.p.x, ball.p.y);
      if (ev) out.push(ev);
    }
  }

  /**
   * Contacts the solver reported against a key face. A key that was pressed
   * within the launch window converts the bounce into an aimed throw.
   */
  handleContacts(contacts: readonly Contact[], out: LaunchEvent[]): void {
    for (const c of contacts) {
      if (c.kind !== 'paddle' || !c.owner || !c.owner.startsWith('key:')) continue;
      const lane = Number(c.owner.slice(4));
      const k = this.keys[lane];
      if (!k || k.since > this.tuning.window || k.launched.has(c.ballId)) continue;
      const g = k.geom;
      const along = (c.x - g.cx) * Math.cos(g.tilt) + (c.y - g.cy) * Math.sin(g.tilt);
      const ev = this.launch(k, c.ballId, along / g.halfW, c.x, c.y);
      if (ev) out.push(ev);
    }
  }

  /**
   * Replace the ball's velocity with a designed launch: direction from where
   * the key was struck, magnitude from how hard it was pressed.
   */
  private launch(k: KeyState, ballId: number, offsetRaw: number, x: number, y: number): LaunchEvent | null {
    const ball = this.world.balls.find((b) => b.id === ballId);
    if (!ball || !ball.alive) return null;
    const t = this.tuning;
    const g = k.geom;
    const offset = clamp(offsetRaw, -1, 1);

    // Base throw is upright, leaning towards the middle for the outer keys;
    // where the key was struck then aims it, like hitting a ball with a bat.
    const span = Math.max(1, (this.layout.right - this.layout.left) / 2);
    const across = clamp((g.cx - (this.layout.left + this.layout.right) / 2) / span, -1, 1);
    const ang = Math.PI / 2 + across * t.lean - offset * t.spread;
    const dirX = Math.cos(ang), dirY = Math.sin(ang);

    const incoming = Math.hypot(ball.v.x, ball.v.y);
    const speed = Math.min(
      this.world.cfg.maxSpeed,
      t.baseSpeed + t.velocitySpeed * k.velocity + t.carry * incoming,
    );

    ball.v.x = dirX * speed;
    ball.v.y = dirY * speed;
    // Step clear of the face so the next sweep does not immediately re-hit.
    ball.p.x += g.nx * 1.5;
    ball.p.y += g.ny * 1.5;
    ball.slowFor = 0;
    ball.spin = -offset * speed * 0.02;
    k.launched.add(ballId);

    return { key: k, ballId, velocity: k.velocity, speed, x, y, dirX, dirY, offset };
  }

  /** Which key, if any, sits under a table-space point. For touch input. */
  pick(x: number, y: number): KeyState | null {
    let best: KeyState | null = null;
    let bestD = Infinity;
    // Black keys first: they sit in front and should win ties.
    for (const pass of [true, false]) {
      for (const k of this.keys) {
        if (k.geom.black !== pass) continue;
        const g = k.geom;
        const dx = x - g.cx, dy = y - g.cy;
        const along = dx * Math.cos(g.tilt) + dy * Math.sin(g.tilt);
        const out = dx * g.nx + dy * g.ny;
        if (Math.abs(along) > g.drawHalfW + 2) continue;
        if (out > 16 || out < -g.depth) continue;
        const d = Math.abs(along);
        if (d < bestD) { bestD = d; best = k; }
      }
      if (best) return best;
    }
    return null;
  }

  /** Fraction across a key's face for a table-space point, -1..1. */
  offsetOn(k: KeyState, x: number, y: number): number {
    const g = k.geom;
    const along = (x - g.cx) * Math.cos(g.tilt) + (y - g.cy) * Math.sin(g.tilt);
    return clamp(along / g.halfW, -1, 1);
  }

  /** Highest and lowest notes currently mapped. */
  get range(): { low: number; high: number } {
    return {
      low: this.keys.length ? this.keys[0].geom.note : 0,
      high: this.keys.length ? this.keys[this.keys.length - 1].geom.note : 0,
    };
  }
}
