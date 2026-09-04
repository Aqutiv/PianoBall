import type { TableCamera } from './project';
import type { Vec2 } from '../physics/vec2';
import { TAU } from '../core/math';

const p = { x: 0, y: 0 };

/** Build a screen-space path from table-space points at a given height. */
export function tracePath(
  ctx: CanvasRenderingContext2D, cam: TableCamera,
  pts: readonly Vec2[], z: number, close = false,
): void {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    cam.project(pts[i].x, pts[i].y, z, p);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  if (close) ctx.closePath();
}

/** Tessellate an arc centreline into table-space points. */
export function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number, steps?: number): Vec2[] {
  let span = a1 - a0;
  while (span < 0) span += TAU;
  const n = steps ?? Math.max(6, Math.ceil((span / TAU) * 96));
  const out: Vec2[] = new Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const a = a0 + (span * i) / n;
    out[i] = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  }
  return out;
}

/** Table-space circle as a point list. */
export function circlePoints(cx: number, cy: number, r: number, steps = 40): Vec2[] {
  const out: Vec2[] = new Array(steps);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * TAU;
    out[i] = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  }
  return out;
}

/**
 * Fake an extruded solid by stroking the same path repeatedly from the
 * playfield up to its height. Cheap, and because the projection shifts each
 * slice up-screen it reads as a genuine side wall.
 */
export function extrudeStroke(
  ctx: CanvasRenderingContext2D, cam: TableCamera,
  pts: readonly Vec2[], z0: number, z1: number, width: number,
  colorAt: (t: number) => string, close = false, steps = 7,
): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const z = z0 + (z1 - z0) * t;
    tracePath(ctx, cam, pts, z, close);
    ctx.strokeStyle = colorAt(t);
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

/** Scratch for `silhouette`: eight projected corners and their hull. */
const CORNERS: ScreenPoint[] = Array.from({ length: 16 }, () => ({ x: 0, y: 0 }));
const ORDER: number[] = new Array(16);
const HULL: number[] = new Array(34);

interface ScreenPoint { x: number; y: number }

function cross(o: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Path the outline of a convex table-space polygon extruded from `z0` to `z1`.
 *
 * Stacking translucent copies of the polygon up its own height is how the
 * extrusions were drawn, and it costs one full rasterisation per slice for a
 * shape whose silhouette could be filled once. It is also visibly banded,
 * because seven slices over twenty screen pixels is seven steps.
 *
 * The silhouette is exactly the convex hull of the two end polygons, with no
 * approximation in it: projecting a fixed (x, y) at rising z traces a straight
 * line on screen — both coordinates are affine in 1/depth, and depth is affine
 * in z — so the swept region of a convex polygon is the hull of its endpoints.
 *
 * Monotone chain over at most sixteen points, through scratch arrays, because
 * this runs once per key per frame.
 */
export function silhouette(
  ctx: CanvasRenderingContext2D, cam: TableCamera,
  pts: readonly Vec2[], z0: number, z1: number,
): void {
  const n = Math.min(pts.length, 8);
  let m = 0;
  for (let i = 0; i < n; i++) cam.project(pts[i].x, pts[i].y, z0, CORNERS[m++]);
  for (let i = 0; i < n; i++) cam.project(pts[i].x, pts[i].y, z1, CORNERS[m++]);

  for (let i = 0; i < m; i++) ORDER[i] = i;
  // Insertion sort by x then y. At sixteen points this beats anything cleverer,
  // and it does not allocate a comparator closure per call.
  for (let i = 1; i < m; i++) {
    const v = ORDER[i];
    const p = CORNERS[v];
    let j = i - 1;
    while (j >= 0 && (CORNERS[ORDER[j]].x > p.x
      || (CORNERS[ORDER[j]].x === p.x && CORNERS[ORDER[j]].y > p.y))) {
      ORDER[j + 1] = ORDER[j];
      j--;
    }
    ORDER[j + 1] = v;
  }

  let k = 0;
  for (let i = 0; i < m; i++) {
    const v = ORDER[i];
    while (k >= 2 && cross(CORNERS[HULL[k - 2]], CORNERS[HULL[k - 1]], CORNERS[v]) <= 0) k--;
    HULL[k++] = v;
  }
  for (let i = m - 2, lower = k + 1; i >= 0; i--) {
    const v = ORDER[i];
    while (k >= lower && cross(CORNERS[HULL[k - 2]], CORNERS[HULL[k - 1]], CORNERS[v]) <= 0) k--;
    HULL[k++] = v;
  }

  ctx.beginPath();
  for (let i = 0; i < k - 1; i++) {
    const p = CORNERS[HULL[i]];
    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
}

/** Fill a table-space polygon at a given height. */
export function fillPoly(
  ctx: CanvasRenderingContext2D, cam: TableCamera,
  pts: readonly Vec2[], z: number, style: string | CanvasGradient,
): void {
  tracePath(ctx, cam, pts, z, true);
  ctx.fillStyle = style;
  ctx.fill();
}
