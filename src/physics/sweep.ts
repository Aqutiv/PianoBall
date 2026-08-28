import type { Collider } from './colliders';
import { angleInArc, smallestRoot } from '../core/math';

/** Filled in by the sweep routines. `t` is only meaningful when the call returns true. */
export interface SweepHit {
  t: number;
  /** Unit normal at the contact, pointing from the surface towards the ball. */
  nx: number;
  ny: number;
}

const EPS = 1e-9;

/**
 * Swept circle (centre p, radius R, velocity v) against a static disc of radius `rc`.
 * Solves |p + v t - c| = R + rc for the entry root.
 */
export function sweepVsDisc(
  px: number, py: number, vx: number, vy: number, R: number,
  cx: number, cy: number, rc: number,
  dtMax: number, out: SweepHit,
): boolean {
  const rr = R + rc;
  const mx = px - cx, my = py - cy;
  const a = vx * vx + vy * vy;
  const b = 2 * (mx * vx + my * vy);
  const c = mx * mx + my * my - rr * rr;

  // Already touching or overlapping: only report it if we are still closing in,
  // otherwise a resting ball would re-collide every step.
  if (c <= 0) {
    if (b >= 0) return false;
    const d = Math.hypot(mx, my) || EPS;
    out.t = 0; out.nx = mx / d; out.ny = my / d;
    return true;
  }
  if (a < EPS) return false;
  const t = smallestRoot(a, b, c, dtMax);
  if (t < 0) return false;
  const hx = mx + vx * t, hy = my + vy * t;
  const d = Math.hypot(hx, hy) || EPS;
  out.t = t; out.nx = hx / d; out.ny = hy / d;
  return true;
}

/**
 * Swept circle against the *inside* of a containing ring of radius `rc`.
 * The ball is constrained to |p - c| <= rc - R, so we look for the outward crossing.
 */
export function sweepVsRing(
  px: number, py: number, vx: number, vy: number, R: number,
  cx: number, cy: number, rc: number,
  dtMax: number, out: SweepHit,
): boolean {
  const rr = rc - R;
  if (rr <= EPS) return false;
  const mx = px - cx, my = py - cy;
  const a = vx * vx + vy * vy;
  const b = 2 * (mx * vx + my * vy);
  const c = mx * mx + my * my - rr * rr;

  if (c >= 0) {
    // Already at or beyond the wall. Report only while still moving outward.
    if (b <= 0) return false;
    const d = Math.hypot(mx, my) || EPS;
    out.t = 0; out.nx = -mx / d; out.ny = -my / d;
    return true;
  }
  if (a < EPS) return false;
  // c < 0 means exactly one positive root: the outward crossing.
  const t = smallestRoot(a, b, c, dtMax);
  if (t < 0) return false;
  const hx = mx + vx * t, hy = my + vy * t;
  const d = Math.hypot(hx, hy) || EPS;
  out.t = t; out.nx = -hx / d; out.ny = -hy / d;
  return true;
}

const tmp: SweepHit = { t: 0, nx: 0, ny: 0 };

/**
 * Swept circle against a capsule (segment a..b inflated by `rs`).
 * A capsule is the union of a slab and two end discs, so we test the
 * cylindrical part within its axial range and both caps, and take the earliest.
 */
export function sweepVsCapsule(
  px: number, py: number, vx: number, vy: number, R: number,
  ax: number, ay: number, bx: number, by: number, rs: number,
  oneSided: boolean, fnx: number, fny: number,
  dtMax: number, out: SweepHit,
): boolean {
  const rr = R + rs;
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy;
  if (L2 < EPS) return sweepVsDisc(px, py, vx, vy, R, ax, ay, rs, dtMax, out);

  const mx = px - ax, my = py - ay;

  // One-way gates only bite when the ball starts on the front face.
  if (oneSided && mx * fnx + my * fny < 0) return false;

  const L = Math.sqrt(L2);
  const ux = dx / L, uy = dy / L;

  let best = Infinity;
  let bnx = 0, bny = 0;

  // --- Cylindrical part: work in the frame perpendicular to the axis. ---
  const mAxial = mx * ux + my * uy;
  const vAxial = vx * ux + vy * uy;
  const mpx = mx - ux * mAxial, mpy = my - uy * mAxial;
  const vpx = vx - ux * vAxial, vpy = vy - uy * vAxial;

  const a = vpx * vpx + vpy * vpy;
  const b = 2 * (mpx * vpx + mpy * vpy);
  const c = mpx * mpx + mpy * mpy - rr * rr;

  if (c <= 0) {
    // Inside the slab already. Only a closing velocity counts as a new contact.
    const s = mAxial;
    if (s >= 0 && s <= L && b < 0) {
      const d = Math.hypot(mpx, mpy) || EPS;
      best = 0; bnx = mpx / d; bny = mpy / d;
    }
  } else if (a >= EPS) {
    const t = smallestRoot(a, b, c, dtMax);
    if (t >= 0) {
      const s = mAxial + vAxial * t;
      if (s >= 0 && s <= L) {
        const hx = mpx + vpx * t, hy = mpy + vpy * t;
        const d = Math.hypot(hx, hy) || EPS;
        best = t; bnx = hx / d; bny = hy / d;
      }
    }
  }

  // --- End caps ---
  if (sweepVsDisc(px, py, vx, vy, R, ax, ay, rs, Math.min(dtMax, best), tmp) && tmp.t < best) {
    best = tmp.t; bnx = tmp.nx; bny = tmp.ny;
  }
  if (sweepVsDisc(px, py, vx, vy, R, bx, by, rs, Math.min(dtMax, best), tmp) && tmp.t < best) {
    best = tmp.t; bnx = tmp.nx; bny = tmp.ny;
  }

  if (!isFinite(best)) return false;
  out.t = best; out.nx = bnx; out.ny = bny;
  return true;
}

/**
 * Swept circle against a circular capsule (an arc of radius `r` inflated by `w`).
 * Tested as: outer surface, inner surface, and the two rounded ends — whichever
 * comes first. The angular check is applied at the impact point, not the start.
 */
export function sweepVsArc(
  px: number, py: number, vx: number, vy: number, R: number,
  cx: number, cy: number, r: number, a0: number, a1: number, w: number, caps: boolean,
  dtMax: number, out: SweepHit,
): boolean {
  let best = Infinity;
  let bnx = 0, bny = 0;
  const startRadius = Math.hypot(px - cx, py - cy);

  // An arc is an annular stroke, not a filled disc. Testing its outer boundary
  // while the ball is on the inner side can report a false t=0 collision from
  // anywhere inside the outer radius. Concentric arcs then return opposing
  // normals until the solver exhausts its iteration budget without advancing.
  if (startRadius >= r && sweepVsDisc(px, py, vx, vy, R, cx, cy, r + w, dtMax, tmp)) {
    const hx = px + vx * tmp.t - cx, hy = py + vy * tmp.t - cy;
    if (angleInArc(Math.atan2(hy, hx), a0, a1) && tmp.t < best) {
      best = tmp.t; bnx = tmp.nx; bny = tmp.ny;
    }
  }
  // Inner wall (only exists if the arc has a hole big enough for the ball).
  if (startRadius < r && r - w - R > EPS
      && sweepVsRing(px, py, vx, vy, R, cx, cy, r - w, dtMax, tmp)) {
    const hx = px + vx * tmp.t - cx, hy = py + vy * tmp.t - cy;
    if (angleInArc(Math.atan2(hy, hx), a0, a1) && tmp.t < best) {
      best = tmp.t; bnx = tmp.nx; bny = tmp.ny;
    }
  }
  if (caps) {
    for (const ang of [a0, a1]) {
      const ex = cx + Math.cos(ang) * r, ey = cy + Math.sin(ang) * r;
      if (sweepVsDisc(px, py, vx, vy, R, ex, ey, w, Math.min(dtMax, best), tmp) && tmp.t < best) {
        best = tmp.t; bnx = tmp.nx; bny = tmp.ny;
      }
    }
  }

  if (!isFinite(best)) return false;
  out.t = best; out.nx = bnx; out.ny = bny;
  return true;
}

/** Dispatch to the right primitive for a static collider. */
export function sweepVsCollider(
  px: number, py: number, vx: number, vy: number, R: number,
  s: Collider, dtMax: number, out: SweepHit,
): boolean {
  switch (s.kind) {
    case 'segment':
      return sweepVsCapsule(px, py, vx, vy, R, s.a.x, s.a.y, s.b.x, s.b.y, s.r,
        s.oneSided, s.n.x, s.n.y, dtMax, out);
    case 'circle':
      return s.hollow
        ? sweepVsRing(px, py, vx, vy, R, s.c.x, s.c.y, s.r, dtMax, out)
        : sweepVsDisc(px, py, vx, vy, R, s.c.x, s.c.y, s.r, dtMax, out);
    case 'arc':
      return sweepVsArc(px, py, vx, vy, R, s.c.x, s.c.y, s.r, s.a0, s.a1, s.w, s.caps, dtMax, out);
  }
}
