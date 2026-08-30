import type { World, Paddle } from '../physics/world';
import type { Contact } from '../physics/world';
import { segment, MATERIALS } from '../physics/colliders';
import { v2 } from '../physics/vec2';
import type { Ball } from '../physics/ball';
import { clamp } from '../core/math';
import type { KeyGeom, KeybedLayout } from './keyLayout';
import { KeyDeck, DEFAULT_TRAVEL, type KeyLit, type KeyTravel } from './keys';

/** A key of the on-screen piano that is also a physics paddle. */
export interface KeyState extends KeyLit {
  paddle: Paddle;
  /** Balls this press has already launched, so one press cannot double-hit. */
  launched: Set<number>;
  /** Ball this key is cradling, if any, and for how long. */
  caught: number | null;
  caughtFor: number;
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
  /**
   * How much of the incoming speed a *dead* key gives back, 0..1. The rest is
   * unlocked by pressing harder, which is what makes a soft return soft.
   */
  bite: number;
  /** How far the ball's own sideways slide bends the aim, in units of `spread`. */
  slide: number;
  /** Slide speed that counts as a full deflection. */
  slideRef: number;
  /** Spin imparted by the aim and by the slide. Cosmetic unless Magnus is on. */
  spinAim: number;
  spinSlide: number;
  /** Impulse a pressed key adds to contacts it does not convert into a launch. */
  kickBase: number;
  kickVel: number;
  /** Whether a held key can cradle a ball that settles on it. */
  catch: boolean;
  /** Fastest a ball can be closing on the face and still be caught. */
  catchSpeed: number;
  /** Longest a key may hold a ball before it is thrown anyway. */
  catchHold: number;
}

export const DEFAULT_TUNING: KeybedTuning = {
  ...DEFAULT_TRAVEL,
  baseSpeed: 820,
  velocitySpeed: 1500,
  carry: 0.32,
  spread: 0.62,
  lean: 0.23,
  reach: 22,
  window: 0.075,
  bite: 0.55,
  slide: 0.28,
  slideRef: 900,
  spinAim: 0.55,
  spinSlide: 0.9,
  kickBase: 90,
  kickVel: 520,
  catch: true,
  catchSpeed: 560,
  catchHold: 1.5,
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
  /** The one key currently cradling a ball, if any. */
  private cradle: KeyState | null = null;
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
    return { ...super.makeKey(geom), paddle, launched: new Set<number>(), caught: null, caughtFor: 0 };
  }

  protected override onRemove(k: KeyState): void {
    const i = this.world.paddles.indexOf(k.paddle);
    if (i >= 0) this.world.paddles.splice(i, 1);
  }

  protected override onPress(k: KeyState): void {
    k.launched.clear();
    this.drop(k);
  }

  /** Hands off the keyboard: nothing is being held, so nothing is cradled. */
  override allOff(): void {
    super.allOff();
    if (this.cradle) this.drop(this.cradle);
  }

  /** Forget a cradle without throwing: the key is going away, not firing. */
  private drop(k: KeyState): void {
    if (this.cradle === k) this.cradle = null;
    k.caught = null;
    k.caughtFor = 0;
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
    // A ball that touches a key which is going down, but too late to be
    // converted into an aimed launch, still gets hit rather than absorbed. The
    // window gate is what stops a held key trickling a resting ball upwards.
    k.paddle.kick = k.down && k.since < this.tuning.window
      ? this.tuning.kickBase + this.tuning.kickVel * k.velocity
      : 0;
  }

  // ------------------------------------------------------------- catch ---

  /**
   * Cradle a ball on a held key, and throw it when the key comes up.
   *
   * The keybed is a crown, so a ball that lands on it is already rolling
   * towards an outlane and the player has a second or two to find the right
   * key. Finding it and then having nothing to do with it is what made that a
   * countdown rather than a decision. Holding the key stops the clock: the ball
   * sits, and the throw happens when the finger lifts — which is the same
   * gesture as playing a note, and costs the finger it takes to hold.
   *
   * One cradle at a time across the whole keybed, so multiball cannot be
   * frozen a ball at a time.
   *
   * Runs before the solver, like the serve's own pin, so `depenetrate` gets the
   * last word on any overlap this creates.
   */
  updateCatch(dt: number, enabled: boolean, out: LaunchEvent[]): void {
    const t = this.tuning;
    const held = this.cradle;

    if (held) {
      const ball = this.world.balls.find((b) => b.id === held.caught);
      if (!ball || !ball.alive || !enabled) { this.drop(held); return; }
      // Released, or held past the limit: throw it.
      if (!held.down || held.caughtFor >= t.catchHold) {
        const g = held.geom;
        const along = (ball.p.x - g.cx) * Math.cos(g.tilt) + (ball.p.y - g.cy) * Math.sin(g.tilt);
        this.drop(held);
        const ev = this.launch(held, ball.id, along / g.halfW, ball.p.x, ball.p.y);
        if (ev) out.push(ev);
        return;
      }
      held.caughtFor += dt;
      this.pin(held, ball);
      return;
    }

    if (!enabled || !t.catch) return;
    for (const k of this.keys) {
      // Only after the launch window has passed: inside it the press is a
      // strike, and a strike must never quietly become a catch.
      if (!k.down || k.since <= t.window) continue;
      const g = k.geom;
      for (const ball of this.world.balls) {
        if (!ball.alive || k.launched.has(ball.id)) continue;
        const dx = ball.p.x - g.cx, dy = ball.p.y - g.cy;
        const along = dx * Math.cos(g.tilt) + dy * Math.sin(g.tilt);
        const outward = dx * g.nx + dy * g.ny;
        if (Math.abs(along) > g.halfW + ball.r) continue;
        if (outward < 0 || outward > ball.r + t.reach) continue;
        // A ball still travelling hard is being hit, not caught.
        if (-(ball.v.x * g.nx + ball.v.y * g.ny) > t.catchSpeed) continue;
        k.caught = ball.id;
        k.caughtFor = 0;
        this.cradle = k;
        this.pin(k, ball);
        return;
      }
    }
  }

  /** Hold a ball against a key's face, dead still. */
  private pin(k: KeyState, ball: Ball): void {
    const g = k.geom;
    const px = g.cx + g.nx * k.pos, py = g.cy + g.ny * k.pos;
    ball.p.x = px + g.nx * (ball.r + 5.5);
    ball.p.y = py + g.ny * (ball.r + 5.5);
    ball.v.x = 0;
    ball.v.y = 0;
    // Otherwise the world's stuck-ball watchdog nudges the cradle apart.
    ball.slowFor = 0;
    ball.age = 0;
  }

  /**
   * The key whose striking slot owns an x. Slots tile the keybed exactly, so
   * every x inside it names one key; outside it, the nearest end key, because
   * a ball drifting off the edge is still heading somewhere the player can see.
   */
  keyAtX(x: number): KeyState | null {
    if (!this.keys.length) return null;
    let best = this.keys[0];
    let bestD = Infinity;
    for (const k of this.keys) {
      const d = Math.abs(x - k.geom.cx);
      if (d <= k.geom.halfW) return k;
      if (d < bestD) { bestD = d; best = k; }
    }
    return best;
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
   * Turn a contact into a designed launch: direction from where the key was
   * struck, magnitude from how hard it was pressed and how hard the ball
   * arrived.
   *
   * The incoming velocity is decomposed in the key's own frame rather than
   * discarded. The part heading *into* the face is what the key can give back,
   * and how much of it comes back is what the press velocity buys — so the same
   * ball returns soft or hard depending on the player, which is the difference
   * between hitting something and triggering it.
   */
  private launch(k: KeyState, ballId: number, offsetRaw: number, x: number, y: number): LaunchEvent | null {
    const ball = this.world.balls.find((b) => b.id === ballId);
    if (!ball || !ball.alive) return null;
    const t = this.tuning;
    const g = k.geom;

    // Incoming, split into the part closing on the face and the part sliding
    // across it.
    const vn = ball.v.x * g.nx + ball.v.y * g.ny;
    const closing = Math.max(0, -vn);
    const tx = ball.v.x - g.nx * vn, ty = ball.v.y - g.ny * vn;
    const along = tx * Math.cos(g.tilt) + ty * Math.sin(g.tilt);

    // Base throw is upright, leaning towards the middle for the outer keys;
    // where the key was struck then aims it, like hitting a ball with a bat.
    // A ball already sliding across the face carries a little of that through,
    // but the strike offset keeps the bulk of the authority.
    const aim = clamp(
      clamp(offsetRaw, -1, 1) + t.slide * clamp(along / t.slideRef, -1, 1),
      -1, 1,
    );
    const span = Math.max(1, (this.layout.right - this.layout.left) / 2);
    const across = clamp((g.cx - (this.layout.left + this.layout.right) / 2) / span, -1, 1);
    const ang = Math.PI / 2 + across * t.lean - aim * t.spread;
    const dirX = Math.cos(ang), dirY = Math.sin(ang);

    const drive = t.baseSpeed + t.velocitySpeed * k.velocity;
    const rebound = t.carry * closing * (t.bite + (1 - t.bite) * k.velocity);
    const speed = Math.min(this.world.cfg.maxSpeed, drive + rebound);

    ball.v.x = dirX * speed;
    ball.v.y = dirY * speed;
    // Step clear of the face so the next sweep does not immediately re-hit.
    ball.p.x += g.nx * 1.5;
    ball.p.y += g.ny * 1.5;
    ball.slowFor = 0;
    ball.spin = -(aim * t.spinAim * speed + along * t.spinSlide) / ball.r;
    k.launched.add(ballId);

    return { key: k, ballId, velocity: k.velocity, speed, x, y, dirX, dirY, offset: aim };
  }
}
