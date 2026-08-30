import type { Ball } from '../physics/ball';
import type { World } from '../physics/world';
import type { Vec2 } from '../physics/vec2';
import { closestFeature } from '../physics/colliders';
import { crownAt } from './keyLayout';
import type { Keybed } from './keybed';

/** Where a ball is going to come down, and which key will be under it. */
export interface Landing {
  ballId: number;
  /** Touchdown point on the keybed, in table units. */
  x: number;
  y: number;
  /** Seconds from now. */
  t: number;
  lane: number;
  note: number;
  /** Sampled flight path, for drawing the arc. */
  path: Vec2[];
}

/**
 * Integration step. Coarser than the solver's, but fine enough that a step
 * never carries the ball past a post without noticing it.
 */
const DT = 1 / 120;
const MAX_TIME = 3;
/** Path points are sampled this many steps apart. */
const SAMPLE = 8;
/** Radius of a key's paddle capsule: a ball comes to rest this far off the face. */
const KEY_R = 5;

/**
 * Where the ball will land, and which key that names.
 *
 * Thirty-two flippers is only playable if the player can see which one is
 * theirs. Reading that off a falling ball is a lookup under a two-second
 * clock, and nothing on screen used to help — so this exists to point at the
 * key, and the renderer lights it.
 *
 * Deliberately *not* the real solver. Re-simulating would need a cloned ball
 * and would push contacts and sensor crossings into the world that never
 * happened. This is plain ballistics with the same gravity, damping and side
 * walls, which over a one-second flight lands well inside one key's width —
 * and it is an affordance, so being readable matters more than being exact.
 */
/** Would a ball of this radius, centred here, be touching something solid? */
function obstructed(world: World, x: number, y: number, r: number): boolean {
  for (const col of world.colliders) {
    if (!col.enabled || col.sensor) continue;
    const a = col.aabb;
    if (x + r < a.minX || x - r > a.maxX || y + r < a.minY || y - r > a.maxY) continue;
    if (closestFeature(col, { x, y }).dist < r) return true;
  }
  return false;
}

export function predictLanding(ball: Ball, world: World, keybed: Keybed): Landing | null {
  if (!ball.alive) return null;
  const L = keybed.layout;
  const gx = world.tilt.x;
  const gy = -world.cfg.gravity + world.tilt.y;
  const damp = Math.max(0, 1 - world.cfg.damping * DT);
  // The shell's side rails, as a cheap reflection rather than a real contact.
  const minX = 40 + ball.r;
  const maxX = world.cfg.width - 40 - ball.r;

  let px = ball.p.x, py = ball.p.y;
  let vx = ball.v.x, vy = ball.v.y;
  const path: Vec2[] = [];

  for (let i = 0; i * DT < MAX_TIME; i++) {
    vx = (vx + gx * DT) * damp;
    vy = (vy + gy * DT) * damp;
    px += vx * DT;
    py += vy * DT;

    if (px < minX) { px = minX; vx = -vx; }
    else if (px > maxX) { px = maxX; vx = -vx; }

    if (i % SAMPLE === 0) path.push({ x: px, y: py });

    // Anything solid in the way makes the rest of this a guess, and a hint
    // pointing at the wrong key is worse than no hint at all. Stop and say
    // nothing; the ball will clear the obstruction and be predicted then.
    if (obstructed(world, px, py, ball.r)) return null;

    // Only a descending ball lands. Rising through the plane is the launch.
    const face = L.baseY + crownAt(px, L) + ball.r + KEY_R;
    if (vy < 0 && py <= face) {
      const k = keybed.keyAtX(px);
      if (!k) return null;
      path.push({ x: px, y: py });
      return { ballId: ball.id, x: px, y: py, t: i * DT, lane: k.geom.lane, note: k.geom.note, path };
    }
  }
  return null;
}
