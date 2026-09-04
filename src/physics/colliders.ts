import { type Vec2, norm, sub } from './vec2';
import { angleInArc, normAngle, TAU } from '../core/math';

export interface AABB { minX: number; minY: number; maxX: number; maxY: number }

/** Physical + acoustic character of a surface. */
export interface Material {
  /** Normal-velocity retention on bounce, 0..1. */
  restitution: number;
  /** Tangential-velocity loss on contact, 0..1. */
  friction: number;
  /** Extra impulse along the contact normal, in table units/s. Live rubbers and bumpers use this. */
  kick: number;
  /** Audio bank used for impacts against this surface. */
  sound: SoundTag;
}

export type SoundTag = 'wood' | 'rail' | 'rubber' | 'metal' | 'plastic' | 'bumper' | 'key' | 'glass' | 'silent';

/** Every tag, as a list, so the sound bank can be checked for covering them all. */
export const SOUND_TAGS: readonly SoundTag[] =
  ['wood', 'rail', 'rubber', 'metal', 'plastic', 'bumper', 'key', 'glass', 'silent'];

export const MATERIALS = {
  wall:    { restitution: 0.42, friction: 0.045, kick: 0,    sound: 'wood'    },
  rail:    { restitution: 0.52, friction: 0.030, kick: 0,    sound: 'rail'    },
  metal:   { restitution: 0.62, friction: 0.020, kick: 0,    sound: 'metal'   },
  rubber:  { restitution: 0.78, friction: 0.090, kick: 60,   sound: 'rubber'  },
  post:    { restitution: 0.82, friction: 0.070, kick: 40,   sound: 'rubber'  },
  bumper:  { restitution: 0.55, friction: 0.050, kick: 980,  sound: 'bumper'  },
  sling:   { restitution: 0.50, friction: 0.060, kick: 1180, sound: 'rubber'  },
  target:  { restitution: 0.46, friction: 0.080, kick: 90,   sound: 'plastic' },
  key:     { restitution: 0.30, friction: 0.130, kick: 0,    sound: 'key'     },
  glassy:  { restitution: 0.70, friction: 0.015, kick: 0,    sound: 'glass'   },
  dead:    { restitution: 0.12, friction: 0.400, kick: 0,    sound: 'wood'    },
} as const satisfies Record<string, Material>;

export type MaterialName = keyof typeof MATERIALS;

interface ColliderBase {
  id: number;
  material: Material;
  /** Sensors report overlap but never change the ball's motion. */
  sensor: boolean;
  enabled: boolean;
  /** Identifies the owning table element, so the game layer can react to a hit. */
  owner: string | null;
  /** Optional MIDI note this surface is tuned to. */
  note: number | null;
  aabb: AABB;
}

/** A capsule: the set of points within `r` of the segment a..b. */
export interface SegmentCollider extends ColliderBase {
  kind: 'segment';
  a: Vec2;
  b: Vec2;
  r: number;
  /** When true the ball only collides coming from the `n` side (one-way gates). */
  oneSided: boolean;
  /** Unit normal, left of a->b. */
  n: Vec2;
}

/** A disc. `hollow` inverts it into a containing ring the ball stays inside. */
export interface CircleCollider extends ColliderBase {
  kind: 'circle';
  c: Vec2;
  r: number;
  hollow: boolean;
}

/**
 * A circular capsule: the set of points within `w` of the arc of radius `r`
 * swept counter-clockwise from `a0` to `a1`. Collides correctly from inside
 * and outside, which is what makes loops and orbits work.
 */
export interface ArcCollider extends ColliderBase {
  kind: 'arc';
  c: Vec2;
  r: number;
  a0: number;
  a1: number;
  w: number;
  /** Rounded ends. Off when the arc butts into other geometry. */
  caps: boolean;
}

export type Collider = SegmentCollider | CircleCollider | ArcCollider;

let nextId = 1;
export const resetColliderIds = () => { nextId = 1; };

interface ColliderOpts {
  material?: Material;
  sensor?: boolean;
  owner?: string | null;
  note?: number | null;
  enabled?: boolean;
}

function base(opts: ColliderOpts): Omit<ColliderBase, 'aabb'> {
  return {
    id: nextId++,
    material: opts.material ?? MATERIALS.wall,
    sensor: opts.sensor ?? false,
    enabled: opts.enabled ?? true,
    owner: opts.owner ?? null,
    note: opts.note ?? null,
  };
}

export function segment(a: Vec2, b: Vec2, r = 2, opts: ColliderOpts & { oneSided?: boolean } = {}): SegmentCollider {
  const d = sub(b, a);
  const n = norm({ x: -d.y, y: d.x });
  const s: SegmentCollider = {
    ...base(opts), kind: 'segment',
    a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, r,
    oneSided: opts.oneSided ?? false, n,
    aabb: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  };
  updateAABB(s);
  return s;
}

export function circle(c: Vec2, r: number, opts: ColliderOpts & { hollow?: boolean } = {}): CircleCollider {
  const s: CircleCollider = {
    ...base(opts), kind: 'circle',
    c: { x: c.x, y: c.y }, r, hollow: opts.hollow ?? false,
    aabb: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  };
  updateAABB(s);
  return s;
}

export function arc(c: Vec2, r: number, a0: number, a1: number, w = 2, opts: ColliderOpts & { caps?: boolean } = {}): ArcCollider {
  const s: ArcCollider = {
    ...base(opts), kind: 'arc',
    c: { x: c.x, y: c.y }, r, a0: normAngle(a0), a1: normAngle(a1), w,
    caps: opts.caps ?? true,
    aabb: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  };
  updateAABB(s);
  return s;
}

/** Chain of segments through a polyline. */
export function polyline(points: Vec2[], r = 2, opts: ColliderOpts & { closed?: boolean } = {}): SegmentCollider[] {
  const out: SegmentCollider[] = [];
  const n = points.length;
  const last = opts.closed ? n : n - 1;
  for (let i = 0; i < last; i++) out.push(segment(points[i], points[(i + 1) % n], r, opts));
  return out;
}

export function updateAABB(s: Collider): void {
  const bb = s.aabb;
  if (s.kind === 'segment') {
    bb.minX = Math.min(s.a.x, s.b.x) - s.r; bb.maxX = Math.max(s.a.x, s.b.x) + s.r;
    bb.minY = Math.min(s.a.y, s.b.y) - s.r; bb.maxY = Math.max(s.a.y, s.b.y) + s.r;
  } else if (s.kind === 'circle') {
    bb.minX = s.c.x - s.r; bb.maxX = s.c.x + s.r;
    bb.minY = s.c.y - s.r; bb.maxY = s.c.y + s.r;
  } else {
    // Tight arc bounds: the two endpoints, plus whichever cardinal extremes the sweep covers.
    const ro = s.r + s.w;
    const p0x = s.c.x + Math.cos(s.a0) * s.r, p0y = s.c.y + Math.sin(s.a0) * s.r;
    const p1x = s.c.x + Math.cos(s.a1) * s.r, p1y = s.c.y + Math.sin(s.a1) * s.r;
    bb.minX = Math.min(p0x, p1x) - s.w; bb.maxX = Math.max(p0x, p1x) + s.w;
    bb.minY = Math.min(p0y, p1y) - s.w; bb.maxY = Math.max(p0y, p1y) + s.w;
    for (let k = 0; k < 4; k++) {
      const a = (k * TAU) / 4;
      if (!angleInArc(a, s.a0, s.a1)) continue;
      const x = s.c.x + Math.cos(a) * ro, y = s.c.y + Math.sin(a) * ro;
      bb.minX = Math.min(bb.minX, x); bb.maxX = Math.max(bb.maxX, x);
      bb.minY = Math.min(bb.minY, y); bb.maxY = Math.max(bb.maxY, y);
    }
  }
}

/**
 * Distance from a point to the collider surface (negative inside), and the
 * outward unit normal there. Used for de-penetration and for resting contacts.
 */
/** Nearest point on a collider: how far outside it, and which way is out. */
export interface Feature { dist: number; nx: number; ny: number }

function feat(out: Feature, dist: number, nx: number, ny: number): Feature {
  out.dist = dist; out.nx = nx; out.ny = ny;
  return out;
}

/**
 * Nearest feature of `s` to `p`.
 *
 * `out` is here because this is one of the hottest functions in the solver:
 * `depenetrate` alone reaches it sixty-odd times per ball per step, and a
 * fresh three-field object each time is tens of thousands of allocations a
 * second for a value every caller reads immediately and then drops. Leaving it
 * off still returns a new object, so a caller that wants to keep the result
 * can simply not pass one.
 */
export function closestFeature(
  s: Collider, p: Vec2, out: Feature = { dist: 0, nx: 0, ny: 0 },
): Feature {
  if (s.kind === 'circle') {
    const dx = p.x - s.c.x, dy = p.y - s.c.y;
    const d = Math.hypot(dx, dy) || 1e-9;
    if (s.hollow) return feat(out, s.r - d, -dx / d, -dy / d);
    return feat(out, d - s.r, dx / d, dy / d);
  }
  if (s.kind === 'segment') {
    const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
    const l2 = dx * dx + dy * dy;
    let t = l2 < 1e-12 ? 0 : ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = s.a.x + dx * t, qy = s.a.y + dy * t;
    const ex = p.x - qx, ey = p.y - qy;
    const d = Math.hypot(ex, ey) || 1e-9;
    return feat(out, d - s.r, ex / d, ey / d);
  }
  // Arc: distance to the circular centreline, clamped into the angular sweep.
  const dx = p.x - s.c.x, dy = p.y - s.c.y;
  const d = Math.hypot(dx, dy) || 1e-9;
  if (angleInArc(Math.atan2(dy, dx), s.a0, s.a1)) {
    const radial = d - s.r;
    const sgn = radial >= 0 ? 1 : -1;
    return feat(out, Math.abs(radial) - s.w, (dx / d) * sgn, (dy / d) * sgn);
  }
  if (!s.caps) return feat(out, Infinity, 0, 0);
  const e0x = s.c.x + Math.cos(s.a0) * s.r, e0y = s.c.y + Math.sin(s.a0) * s.r;
  const e1x = s.c.x + Math.cos(s.a1) * s.r, e1y = s.c.y + Math.sin(s.a1) * s.r;
  const d0 = Math.hypot(p.x - e0x, p.y - e0y);
  const d1 = Math.hypot(p.x - e1x, p.y - e1y);
  const ex = d0 < d1 ? e0x : e1x, ey = d0 < d1 ? e0y : e1y;
  const dd = Math.min(d0, d1) || 1e-9;
  return feat(out, dd - s.w, (p.x - ex) / dd, (p.y - ey) / dd);
}
