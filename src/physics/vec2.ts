export interface Vec2 { x: number; y: number }

export const v2 = (x = 0, y = 0): Vec2 => ({ x, y });
export const clone = (a: Vec2): Vec2 => ({ x: a.x, y: a.y });
export const set = (o: Vec2, x: number, y: number): Vec2 => { o.x = x; o.y = y; return o; };
export const copy = (o: Vec2, a: Vec2): Vec2 => { o.x = a.x; o.y = a.y; return o; };

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const addScaled = (a: Vec2, b: Vec2, s: number): Vec2 => ({ x: a.x + b.x * s, y: a.y + b.y * s });

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
/** 2D scalar cross product (z-component of the 3D cross). */
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const len2 = (a: Vec2): number => a.x * a.x + a.y * a.y;
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const dist2 = (a: Vec2, b: Vec2): number => {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
};

export function norm(a: Vec2): Vec2 {
  const l = Math.hypot(a.x, a.y);
  return l > 1e-12 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
}

/** Rotate 90 degrees counter-clockwise. */
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });

export function rotate(a: Vec2, ang: number): Vec2 {
  const c = Math.cos(ang), s = Math.sin(ang);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}

/** Rotate `a` around `pivot` by `ang`. */
export function rotateAround(a: Vec2, pivot: Vec2, ang: number): Vec2 {
  const c = Math.cos(ang), s = Math.sin(ang);
  const dx = a.x - pivot.x, dy = a.y - pivot.y;
  return { x: pivot.x + dx * c - dy * s, y: pivot.y + dx * s + dy * c };
}

/** Reflect `v` about the unit normal `n`, scaling the normal component by `restitution`. */
export function reflect(v: Vec2, n: Vec2, restitution: number, friction: number): Vec2 {
  const vn = dot(v, n);
  const nx = n.x * vn, ny = n.y * vn;
  const tx = v.x - nx, ty = v.y - ny;         // tangential component
  const keep = 1 - friction;
  return { x: tx * keep - nx * restitution, y: ty * keep - ny * restitution };
}

export function fromAngle(ang: number, m = 1): Vec2 {
  return { x: Math.cos(ang) * m, y: Math.sin(ang) * m };
}

export const angleOf = (a: Vec2): number => Math.atan2(a.y, a.x);

/** Closest point on segment [a,b] to p, plus the parametric position along it. */
export function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number } {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-12) return { point: { x: a.x, y: a.y }, t: 0 };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { point: { x: a.x + dx * t, y: a.y + dy * t }, t };
}
