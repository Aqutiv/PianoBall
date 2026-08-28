export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
export const smootherstep = (t: number) => {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

/** Frame-rate independent exponential approach. `rate` = fraction closed per second. */
export const damp = (a: number, b: number, rate: number, dt: number) =>
  b + (a - b) * Math.exp(-rate * dt);

/** Shortest signed angular difference from `a` to `b`, in (-PI, PI]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/** Normalise an angle into [0, TAU). */
export function normAngle(a: number): number {
  const m = a % TAU;
  return m < 0 ? m + TAU : m;
}

/**
 * Is `a` inside the CCW sweep from `a0` to `a1`?
 * All angles are normalised first, so the sweep may wrap past 0.
 */
export function angleInArc(a: number, a0: number, a1: number): boolean {
  const span = normAngle(a1 - a0);
  const rel = normAngle(a - a0);
  return rel <= span;
}

/**
 * Smallest non-negative root of `a t^2 + b t + c = 0` that is <= tMax.
 * Returns -1 when there is no such root. Written to be stable for tiny `a`.
 */
export function smallestRoot(a: number, b: number, c: number, tMax: number): number {
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) < 1e-12) return -1;
    const t = -c / b;
    return t >= 0 && t <= tMax ? t : -1;
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  // Numerically stable quadratic (avoids cancellation when b dominates).
  const q = -0.5 * (b + Math.sign(b || 1) * sq);
  let t0 = q / a;
  let t1 = c / q;
  if (!isFinite(t0)) t0 = Infinity;
  if (!isFinite(t1)) t1 = Infinity;
  if (t0 > t1) { const tmp = t0; t0 = t1; t1 = tmp; }
  if (t0 >= 0 && t0 <= tMax) return t0;
  if (t1 >= 0 && t1 <= tMax) return t1;
  return -1;
}
