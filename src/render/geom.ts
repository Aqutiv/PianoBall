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

/** Fill a table-space polygon at a given height. */
export function fillPoly(
  ctx: CanvasRenderingContext2D, cam: TableCamera,
  pts: readonly Vec2[], z: number, style: string | CanvasGradient,
): void {
  tracePath(ctx, cam, pts, z, true);
  ctx.fillStyle = style;
  ctx.fill();
}
