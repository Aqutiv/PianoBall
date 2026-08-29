import type { World, Paddle } from '../physics/world';
import type { Contact } from '../physics/world';
import { segment, MATERIALS } from '../physics/colliders';
import { v2 } from '../physics/vec2';
import { clamp } from '../core/math';
import type { KeyGeom, KeybedLayout } from './keyLayout';
import { KeyDeck, DEFAULT_TRAVEL, type KeyLit, type KeyTravel } from './keys';

/** A key of the on-screen piano that is also a physics paddle. */
export interface KeyState extends KeyLit {
  paddle: Paddle;
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

export interface KeybedTuning extends KeyTravel {
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
  ...DEFAULT_TRAVEL,
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
 * `KeyDeck` gives us the piano; this class owns the *feel*: how far a key
 * throws a ball for a given MIDI velocity, and how striking the left or right
 * side of a key aims the launch. That aiming is the skill ceiling of the whole
 * game.
 */
export class Keybed extends KeyDeck<KeyState> {
  tuning: KeybedTuning;
  private world: World;

  constructor(
    world: World,
    baseNote: number,
    count: number,
    layoutOverrides: Partial<KeybedLayout> = {},
    tuning: Partial<KeybedTuning> = {},
  ) {
    super(tuning);
    // Both assignments have to land before the first key is made, which is why
    // the base class does not build inside its own constructor.
    this.world = world;
    this.tuning = { ...DEFAULT_TUNING, ...tuning };
    this.build(baseNote, count, layoutOverrides);
  }

  // -------------------------------------------------------- deck hooks ---

  protected override makeKey(geom: KeyGeom): KeyState {
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
    this.world.addPaddle(paddle);
    return { ...super.makeKey(geom), paddle, launched: new Set<number>() };
  }

  protected override onRemove(k: KeyState): void {
    const i = this.world.paddles.indexOf(k.paddle);
    if (i >= 0) this.world.paddles.splice(i, 1);
  }

  protected override onPress(k: KeyState): void {
    k.launched.clear();
  }

  /** Position the paddle capsule for the key's current extension. */
  protected override place(k: KeyState): void {
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

  // ------------------------------------------------------------ launch ---

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
}
