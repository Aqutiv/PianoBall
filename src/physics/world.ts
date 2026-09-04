import { type Vec2, v2 } from './vec2';
import { type Ball } from './ball';
import {
  type AABB, type Collider, type Feature, type SegmentCollider, type SoundTag, type Material,
  closestFeature, updateAABB,
} from './colliders';
import { SpatialGrid } from './grid';
import { sweepVsCollider, sweepVsCapsule, type SweepHit } from './sweep';
import { clamp01, smoothstep } from '../core/math';

/**
 * A surface with prescribed motion: the 32 keybed paddles, plus any moving
 * table part. Its collider is repositioned by the owner every frame; the
 * motion terms below let the solver transfer that motion into the ball.
 */
export interface Paddle {
  collider: SegmentCollider;
  /** Point the paddle rotates about, in table space. */
  pivot: Vec2;
  /** Angular velocity about `pivot`, rad/s. */
  omega: number;
  /** Linear velocity of the whole paddle, table units/s. */
  vel: Vec2;
  /** Extra impulse along the contact normal on top of the transferred motion. */
  kick: number;
}

export type ContactKind = 'surface' | 'paddle' | 'sensor-enter' | 'sensor-exit' | 'ball';

export interface Contact {
  kind: ContactKind;
  ballId: number;
  colliderId: number;
  owner: string | null;
  note: number | null;
  sound: SoundTag;
  /** Closing speed along the normal before the bounce. Drives loudness and particles. */
  impact: number;
  /** Sliding speed along the surface. Drives scrape/roll sounds. */
  slide: number;
  x: number;
  y: number;
  nx: number;
  ny: number;
}

export interface WorldConfig {
  width: number;
  height: number;
  /** Downhill acceleration of the raked table, table units/s^2 (positive = pulls -y). */
  gravity: number;
  maxSpeed: number;
  /** Air/rolling drag, fraction of velocity shed per second. */
  damping: number;
  /** Impacts slower than this are progressively deadened so balls settle. */
  restingSpeed: number;
  /** Below this speed for this long, a ball is considered stuck and gets nudged. */
  stuckSpeed: number;
  stuckSeconds: number;
  cell: number;
  /**
   * Sideways force per unit of spin per unit of speed. Zero by default, so a
   * world that has not asked for it behaves exactly as it always did.
   */
  magnus: number;
}

export const DEFAULT_WORLD: WorldConfig = {
  width: 1024,
  height: 1408,
  gravity: 2450,
  maxSpeed: 3600,
  damping: 0.16,
  restingSpeed: 210,
  stuckSpeed: 26,
  stuckSeconds: 2.6,
  cell: 72,
  magnus: 0,
};

const MAX_TOI_ITER = 8;
const SKIN = 0.05;

export class World {
  readonly cfg: WorldConfig;
  readonly colliders: Collider[] = [];
  readonly paddles: Paddle[] = [];
  readonly balls: Ball[] = [];
  /** Drained by the game layer after every step. */
  readonly contacts: Contact[] = [];

  /** Extra acceleration from table tilt (pitch bend), table units/s^2. */
  tilt: Vec2 = v2(0, 0);
  /** Global time scale for slow-motion. Applied by the caller to `dt`. */
  gravityScale = 1;

  private grid: SpatialGrid;
  private readonly cand: Collider[] = [];
  private readonly hit: SweepHit = { t: 0, nx: 0, ny: 0 };
  private readonly probe: SweepHit = { t: 0, nx: 0, ny: 0 };
  /**
   * Which sensors this ball is touching, for the duration of one call to
   * `updateSensors`. Shared rather than made fresh each time: at four balls and
   * 240 Hz a new set per ball per step is a thousand of them a second, and the
   * only thing that ever reads it is the exit sweep at the end of that call.
   */
  private readonly seen = new Set<number>();
  /**
   * Every enabled paddle's bounds, unioned. Rebuilt once a step rather than
   * consulted per candidate: the paddles are not in the broadphase grid, so
   * `solveBall` had no way to reject them without walking all thirty-two, once
   * per TOI iteration, per ball — even for a ball at the top of the table with
   * the whole playfield between it and the keybed. Thirty-two reads a step
   * buys a single compare in the place that used to do a thousand.
   */
  private readonly padBounds: AABB = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  /** Scratch for `closestFeature`, which is read and dropped at both callers. */
  private readonly feat: Feature = { dist: 0, nx: 0, ny: 0 };
  /**
   * `solidNear` gets its own candidate list and feature. It is called from the
   * renderer rather than from `step`, and sharing the solver's scratch would
   * make that an ordering constraint nobody could see.
   */
  private readonly probeCand: Collider[] = [];
  private readonly probeFeat: Feature = { dist: 0, nx: 0, ny: 0 };
  private readonly probePoint: Vec2 = v2(0, 0);
  private rand: () => number;
  private dirty = true;

  constructor(cfg: Partial<WorldConfig> = {}, rand: () => number = Math.random) {
    this.cfg = { ...DEFAULT_WORLD, ...cfg };
    this.grid = new SpatialGrid(this.cfg.width, this.cfg.height, this.cfg.cell);
    this.rand = rand;
  }

  add(s: Collider | Collider[]): void {
    if (Array.isArray(s)) this.colliders.push(...s);
    else this.colliders.push(s);
    this.dirty = true;
  }

  addPaddle(p: Paddle): void {
    this.paddles.push(p);
  }

  clear(): void {
    this.colliders.length = 0;
    this.paddles.length = 0;
    this.balls.length = 0;
    this.contacts.length = 0;
    this.dirty = true;
  }

  /** Rebuild the broadphase. Call after adding or moving static geometry. */
  reindex(): void {
    this.grid = new SpatialGrid(this.cfg.width, this.cfg.height, this.cfg.cell);
    for (const s of this.colliders) {
      updateAABB(s);
      this.grid.insert(s);
    }
    this.dirty = false;
  }

  /**
   * Is a ball of radius `r`, centred here, touching anything solid?
   *
   * A read-only probe for things outside the solver that need to know what the
   * table is like at a point -- the landing predictor being the one that
   * matters, which asks a few hundred times a frame. It lives here rather than
   * on the caller because the broadphase does, and a caller without it has no
   * choice but to walk every collider on the table for each question.
   */
  solidNear(x: number, y: number, r: number): boolean {
    if (this.dirty) this.reindex();
    this.grid.query(x - r, y - r, x + r, y + r, this.probeCand);
    this.probePoint.x = x;
    this.probePoint.y = y;
    for (let i = 0; i < this.probeCand.length; i++) {
      const s = this.probeCand[i];
      if (!s.enabled || s.sensor) continue;
      const bb = s.aabb;
      if (x + r < bb.minX || x - r > bb.maxX || y + r < bb.minY || y - r > bb.maxY) continue;
      if (closestFeature(s, this.probePoint, this.probeFeat).dist < r) return true;
    }
    return false;
  }

  addBall(b: Ball): void { this.balls.push(b); }

  removeBall(id: number): void {
    const i = this.balls.findIndex((b) => b.id === id);
    if (i >= 0) this.balls.splice(i, 1);
  }

  /** One fixed physics step. `dt` is already scaled for slow-motion by the caller. */
  step(dt: number): void {
    if (this.dirty) this.reindex();
    this.contacts.length = 0;
    this.boundPaddles();

    const gx = this.tilt.x;
    const gy = -this.cfg.gravity + this.tilt.y;
    const dampFactor = Math.max(0, 1 - this.cfg.damping * dt);

    for (const ball of this.balls) {
      if (!ball.alive) continue;
      ball.prev.x = ball.p.x;
      ball.prev.y = ball.p.y;
      ball.age += dt;
      if (ball.safeFor > 0) ball.safeFor = Math.max(0, ball.safeFor - dt);

      ball.v.x = (ball.v.x + gx * dt) * dampFactor;
      ball.v.y = (ball.v.y + gy * dt) * dampFactor;
      // A spinning ball curves. The keybed puts real spin on a launch — from
      // where the key was struck, and from how the ball was sliding across it —
      // so this is what makes an aimed shot bend rather than just leave at an
      // angle. A contact re-derives the spin, so a bounce ends the curve.
      if (this.cfg.magnus !== 0 && ball.spin !== 0) {
        const a = this.cfg.magnus * ball.spin * dt;
        const vx = ball.v.x;
        ball.v.x -= a * ball.v.y;
        ball.v.y += a * vx;
      }
      this.clampSpeed(ball);

      this.solveBall(ball, dt);
      this.depenetrate(ball);
      this.updateSensors(ball, dt);
      this.watchdog(ball, dt);

      // Cosmetic roll, eased towards the rolling rate implied by contact.
      ball.angle += ball.spin * dt;
      ball.spin *= Math.max(0, 1 - 1.4 * dt);
    }

    this.solveBallPairs();
  }

  private clampSpeed(b: Ball): void {
    const s2 = b.v.x * b.v.x + b.v.y * b.v.y;
    const max = this.cfg.maxSpeed;
    if (s2 > max * max) {
      const s = Math.sqrt(s2);
      b.v.x = (b.v.x / s) * max;
      b.v.y = (b.v.y / s) * max;
    }
  }

  /**
   * Continuous solve: repeatedly advance to the earliest time of impact and
   * resolve exactly that one contact. Because motion is never applied past a
   * collision, a ball can never pass through a wall regardless of speed.
   */
  /**
   * Union of the enabled paddles' bounds, for this step.
   *
   * Empty when nothing is enabled — the sentinels invert the box so every test
   * against it fails, which is what a world with no paddles should do.
   */
  private boundPaddles(): void {
    const bb = this.padBounds;
    bb.minX = bb.minY = Infinity;
    bb.maxX = bb.maxY = -Infinity;
    for (let i = 0; i < this.paddles.length; i++) {
      const s = this.paddles[i].collider;
      if (!s.enabled) continue;
      const a = s.aabb;
      if (a.minX < bb.minX) bb.minX = a.minX;
      if (a.minY < bb.minY) bb.minY = a.minY;
      if (a.maxX > bb.maxX) bb.maxX = a.maxX;
      if (a.maxY > bb.maxY) bb.maxY = a.maxY;
    }
  }

  private solveBall(ball: Ball, dt: number): void {
    let remaining = dt;
    let iter = 0;

    while (remaining > 1e-7 && iter++ < MAX_TOI_ITER) {
      const vx = ball.v.x, vy = ball.v.y;
      if (vx * vx + vy * vy < 1e-8) break;

      const pad = ball.r + SKIN;
      const ex = vx * remaining, ey = vy * remaining;
      const minX = Math.min(ball.p.x, ball.p.x + ex) - pad;
      const maxX = Math.max(ball.p.x, ball.p.x + ex) + pad;
      const minY = Math.min(ball.p.y, ball.p.y + ey) - pad;
      const maxY = Math.max(ball.p.y, ball.p.y + ey) + pad;
      this.grid.query(minX, minY, maxX, maxY, this.cand);

      let bestT = Infinity, bnx = 0, bny = 0;
      let bestCollider: Collider | null = null;
      let bestPaddle: Paddle | null = null;

      for (let i = 0; i < this.cand.length; i++) {
        const s = this.cand[i];
        if (!s.enabled || s.sensor) continue;
        const bb = s.aabb;
        if (bb.maxX < minX || bb.minX > maxX || bb.maxY < minY || bb.minY > maxY) continue;
        if (sweepVsCollider(ball.p.x, ball.p.y, vx, vy, ball.r, s, remaining, this.hit) && this.hit.t < bestT) {
          bestT = this.hit.t; bnx = this.hit.nx; bny = this.hit.ny;
          bestCollider = s; bestPaddle = null;
        }
      }

      // One reject for the whole keybed. A ball anywhere but the bottom of the
      // table misses every paddle, and this is the only place that can say so
      // cheaply: paddles move every step, so they are not in the grid.
      const pb = this.padBounds;
      const nearPaddles = pb.maxX >= minX && pb.minX <= maxX
        && pb.maxY >= minY && pb.minY <= maxY;
      for (let i = 0; nearPaddles && i < this.paddles.length; i++) {
        const p = this.paddles[i];
        const s = p.collider;
        if (!s.enabled) continue;
        const bb = s.aabb;
        if (bb.maxX < minX || bb.minX > maxX || bb.maxY < minY || bb.minY > maxY) continue;
        // Sweep in the paddle's frame: its motion becomes the ball's relative motion.
        const sv = this.surfaceVelocity(p, ball.p.x, ball.p.y);
        const rvx = vx - sv.x, rvy = vy - sv.y;
        if (sweepVsCapsule(ball.p.x, ball.p.y, rvx, rvy, ball.r,
              s.a.x, s.a.y, s.b.x, s.b.y, s.r, false, 0, 0, remaining, this.hit)
            && this.hit.t < bestT) {
          bestT = this.hit.t; bnx = this.hit.nx; bny = this.hit.ny;
          bestCollider = s; bestPaddle = p;
        }
      }

      if (!bestCollider) {
        ball.p.x += vx * remaining;
        ball.p.y += vy * remaining;
        return;
      }

      ball.p.x += vx * bestT;
      ball.p.y += vy * bestT;
      remaining -= bestT;

      let svx = 0, svy = 0, kick = bestCollider.material.kick;
      if (bestPaddle) {
        const sv = this.surfaceVelocity(bestPaddle, ball.p.x, ball.p.y);
        svx = sv.x; svy = sv.y;
        kick = bestPaddle.kick;
      }
      this.resolve(ball, bnx, bny, bestCollider, bestCollider.material, svx, svy, kick, !!bestPaddle);
    }
  }

  private readonly svTmp: Vec2 = v2(0, 0);

  /** Velocity of a paddle's surface at a world point: linear + rotation about the pivot. */
  private surfaceVelocity(p: Paddle, x: number, y: number): Vec2 {
    const rx = x - p.pivot.x, ry = y - p.pivot.y;
    this.svTmp.x = p.vel.x - p.omega * ry;
    this.svTmp.y = p.vel.y + p.omega * rx;
    return this.svTmp;
  }

  /**
   * Bounce. Everything happens in the surface's frame so that a moving paddle
   * transfers its motion into the ball the way a real flipper does.
   */
  private resolve(
    ball: Ball, nx: number, ny: number,
    collider: Collider, mat: Material,
    svx: number, svy: number, kick: number, isPaddle: boolean,
  ): void {
    const rvx = ball.v.x - svx, rvy = ball.v.y - svy;
    const vn = rvx * nx + rvy * ny;          // negative while closing
    const impact = -vn;
    const tx = rvx - nx * vn, ty = rvy - ny * vn;
    const slide = Math.hypot(tx, ty);

    // Real rubber eats low-speed bounces; without this the ball buzzes forever.
    const bite = clamp01(impact / this.cfg.restingSpeed);
    const soft = smoothstep(bite);
    const e = mat.restitution * soft;

    // Friction scales with how hard the contact is. A ball merely resting on a
    // surface is rolling, not sliding, and rolling resistance is almost nothing
    // -- without this the ball welds itself to the keybed instead of rolling
    // down the crown towards an outlane.
    const keep = 1 - mat.friction * bite * bite;

    let nvx = tx * keep - nx * vn * e;
    let nvy = ty * keep - ny * vn * e;

    if (kick > 0) {
      // Live surfaces add a fixed impulse rather than scaling the incoming speed,
      // which is what makes bumpers feel punchy at any approach speed.
      nvx += nx * kick;
      nvy += ny * kick;
    }

    ball.v.x = nvx + svx;
    ball.v.y = nvy + svy;
    this.clampSpeed(ball);

    // Nudge clear of the surface so the next sweep starts outside it.
    ball.p.x += nx * SKIN;
    ball.p.y += ny * SKIN;

    // Cosmetic roll from the tangential component.
    const tangential = tx * -ny + ty * nx;
    ball.spin += (-tangential / ball.r - ball.spin) * 0.5;
    ball.lastColliderId = collider.id;

    this.contacts.push({
      kind: isPaddle ? 'paddle' : 'surface',
      ballId: ball.id,
      colliderId: collider.id,
      owner: collider.owner,
      note: collider.note,
      sound: mat.sound,
      impact,
      slide,
      x: ball.p.x - nx * ball.r,
      y: ball.p.y - ny * ball.r,
      nx, ny,
    });
  }

  /**
   * Numerical safety net, and the path by which a rising key pushes a resting
   * ball off itself: shove anything overlapping back out along its normal.
   */
  private depenetrate(ball: Ball): void {
    const r = ball.r;
    const minX = ball.p.x - r - 2, minY = ball.p.y - r - 2;
    const maxX = ball.p.x + r + 2, maxY = ball.p.y + r + 2;
    this.grid.query(minX, minY, maxX, maxY, this.cand);
    // The grid candidates arrive already filtered by the query box; the
    // paddles do not, and this loop used to reach `closestFeature` for all
    // thirty-two of them, twice, for every ball on the table — with no bounds
    // test of any kind. A capsule that fails its own AABB cannot be
    // overlapping the ball, so rejecting on it changes nothing but the bill.
    const pb = this.padBounds;
    const nearPaddles = pb.maxX >= minX && pb.minX <= maxX
      && pb.maxY >= minY && pb.minY <= maxY;
    for (let pass = 0; pass < 2; pass++) {
      let moved = false;
      for (let i = 0; i < this.cand.length; i++) {
        const s = this.cand[i];
        if (!s.enabled || s.sensor) continue;
        moved = this.pushOut(ball, s, 0, 0) || moved;
      }
      for (let i = 0; nearPaddles && i < this.paddles.length; i++) {
        const p = this.paddles[i];
        const s = p.collider;
        if (!s.enabled) continue;
        const bb = s.aabb;
        if (bb.maxX < minX || bb.minX > maxX || bb.maxY < minY || bb.minY > maxY) continue;
        const sv = this.surfaceVelocity(p, ball.p.x, ball.p.y);
        moved = this.pushOut(ball, s, sv.x, sv.y) || moved;
      }
      if (!moved) break;
    }
  }

  private pushOut(ball: Ball, s: Collider, svx: number, svy: number): boolean {
    const f = closestFeature(s, ball.p, this.feat);
    if (!isFinite(f.dist)) return false;
    const pen = ball.r - f.dist;
    if (pen <= 1e-4) return false;
    ball.p.x += f.nx * (pen + SKIN);
    ball.p.y += f.ny * (pen + SKIN);
    // Cancel any velocity still driving into the surface, in the surface's frame.
    const rvx = ball.v.x - svx, rvy = ball.v.y - svy;
    const vn = rvx * f.nx + rvy * f.ny;
    if (vn < 0) {
      ball.v.x = rvx - f.nx * vn + svx;
      ball.v.y = rvy - f.ny * vn + svy;
    }
    return true;
  }

  /**
   * Sensors fire once on entry and once on exit. Detection is swept as well as
   * overlap-based, so a ball crossing a thin trigger at full speed still counts.
   */
  private updateSensors(ball: Ball, dt: number): void {
    const r = ball.r;
    const minX = Math.min(ball.prev.x, ball.p.x) - r, maxX = Math.max(ball.prev.x, ball.p.x) + r;
    const minY = Math.min(ball.prev.y, ball.p.y) - r, maxY = Math.max(ball.prev.y, ball.p.y) + r;
    this.grid.query(minX, minY, maxX, maxY, this.cand);

    const vx = (ball.p.x - ball.prev.x) / dt;
    const vy = (ball.p.y - ball.prev.y) / dt;
    const seen = this.seen;
    seen.clear();

    for (let i = 0; i < this.cand.length; i++) {
      const s = this.cand[i];
      if (!s.enabled || !s.sensor) continue;
      let touching = closestFeature(s, ball.p, this.feat).dist < r;
      if (!touching) {
        touching = sweepVsCollider(ball.prev.x, ball.prev.y, vx, vy, r, s, dt, this.probe);
      }
      if (!touching) continue;
      seen.add(s.id);
      if (!ball.sensors.has(s.id)) {
        ball.sensors.add(s.id);
        this.contacts.push({
          kind: 'sensor-enter', ballId: ball.id, colliderId: s.id,
          owner: s.owner, note: s.note, sound: s.material.sound,
          impact: Math.hypot(vx, vy), slide: 0,
          x: ball.p.x, y: ball.p.y, nx: 0, ny: 0,
        });
      }
    }

    if (ball.sensors.size) {
      for (const id of ball.sensors) {
        if (seen.has(id)) continue;
        ball.sensors.delete(id);
        this.contacts.push({
          kind: 'sensor-exit', ballId: ball.id, colliderId: id,
          owner: null, note: null, sound: 'silent',
          impact: 0, slide: 0, x: ball.p.x, y: ball.p.y, nx: 0, ny: 0,
        });
      }
    }
  }

  /** Pinball tables trap balls. After long enough, shove it somewhere useful. */
  private watchdog(ball: Ball, dt: number): void {
    const speed = Math.hypot(ball.v.x, ball.v.y);
    if (speed < this.cfg.stuckSpeed) {
      ball.slowFor += dt;
      if (ball.slowFor > this.cfg.stuckSeconds) {
        ball.slowFor = 0;
        const ang = (this.rand() * 0.8 - 0.4) + Math.PI * 0.5;
        const mag = 260 + this.rand() * 140;
        ball.v.x += Math.cos(ang) * mag;
        ball.v.y += Math.sin(ang) * mag;
      }
    } else {
      ball.slowFor = 0;
    }
  }

  /**
   * Ball-to-ball for multiball. Discrete is safe here: at 240 Hz even two balls
   * closing at max speed move well under one diameter per step.
   */
  private solveBallPairs(): void {
    const n = this.balls.length;
    if (n < 2) return;
    for (let i = 0; i < n; i++) {
      const a = this.balls[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < n; j++) {
        const b = this.balls[j];
        if (!b.alive) continue;
        const dx = b.p.x - a.p.x, dy = b.p.y - a.p.y;
        const rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 1e-9) continue;

        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        const overlap = rr - d;
        a.p.x -= nx * overlap * 0.5; a.p.y -= ny * overlap * 0.5;
        b.p.x += nx * overlap * 0.5; b.p.y += ny * overlap * 0.5;

        const rvx = b.v.x - a.v.x, rvy = b.v.y - a.v.y;
        const vn = rvx * nx + rvy * ny;
        if (vn >= 0) continue;
        const e = 0.92;
        const jimp = -(1 + e) * vn * 0.5;
        a.v.x -= nx * jimp; a.v.y -= ny * jimp;
        b.v.x += nx * jimp; b.v.y += ny * jimp;

        this.contacts.push({
          kind: 'ball', ballId: a.id, colliderId: -b.id,
          owner: null, note: null, sound: 'metal',
          impact: -vn, slide: 0,
          x: a.p.x + nx * a.r, y: a.p.y + ny * a.r, nx, ny,
        });
      }
    }
  }

  /** Stable fingerprint of the simulation, used by the determinism test. */
  hash(): number {
    let h = 2166136261;
    const mix = (v: number) => {
      const q = Math.round(v * 4096) | 0;
      h ^= q; h = Math.imul(h, 16777619);
    };
    for (const b of this.balls) { mix(b.p.x); mix(b.p.y); mix(b.v.x); mix(b.v.y); }
    return h >>> 0;
  }
}
