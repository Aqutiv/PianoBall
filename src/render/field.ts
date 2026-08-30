import type { Stage } from './stage';
import { tracePath, fillPoly, circlePoints } from './geom';
import { withAlpha } from './palette';
import type { Vec2 } from '../physics/vec2';

/**
 * The empty stage the two non-pinball modes play on.
 *
 * Same dimensions and same cabinet outline as the table, so the camera, the
 * keyboard and the piano-roll margins all land in exactly the same places. A
 * player moving between modes should feel they are looking at one machine.
 */
export const FIELD = { width: 1024, height: 1408, near: 300, far: 1360 };

let cached: Vec2[] | null = null;

/** A rounded cabinet outline matching the pinball table's shell. */
export function fieldOutline(): Vec2[] {
  if (cached) return cached;
  const W = FIELD.width, H = FIELD.height;
  const wall = 16, top = H - 14, r = 200;
  const cy = top - r;
  const pts: Vec2[] = [{ x: wall, y: 0 }, { x: wall, y: cy }];
  for (let i = 0; i <= 28; i++) {
    const a = Math.PI - (i / 28) * Math.PI;
    pts.push({ x: W / 2 + Math.cos(a) * (W / 2 - wall), y: cy + Math.sin(a) * r });
  }
  pts.push({ x: W - wall, y: cy }, { x: W - wall, y: 0 });
  cached = pts;
  return pts;
}

/** Paint the empty field into the stage's static layer. Once per resize. */
export function bakeField(ctx: CanvasRenderingContext2D, stage: Stage): void {
  const cam = stage.cam;
  const pal = stage.palette;
  const outline = fieldOutline();

  const near = { x: 0, y: 0 }, far = { x: 0, y: 0 };
  cam.project(FIELD.width / 2, 0, 0, near);
  cam.project(FIELD.width / 2, FIELD.height, 0, far);
  const floor = ctx.createLinearGradient(near.x, near.y, far.x, far.y);
  floor.addColorStop(0, pal.floorNear);
  floor.addColorStop(0.6, pal.floorFar);
  floor.addColorStop(1, pal.floorDeep);
  fillPoly(ctx, cam, outline, 0, floor);

  ctx.save();
  tracePath(ctx, cam, outline, 0, true);
  ctx.clip();

  // Rings centred behind the keyboard, so the empty field still has somewhere
  // for the eye to go and a sense of how far away the far end is.
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = pal.railTop;
  ctx.lineWidth = 1;
  for (let r = 240; r < 2400; r += 96) {
    tracePath(ctx, cam, circlePoints(FIELD.width / 2, FIELD.near - 220, r, 96), 0, true);
    ctx.stroke();
  }

  // Deterministic grain, so the surface never shimmers between resizes.
  let seed = 987654;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  ctx.globalAlpha = 0.045;
  const p = { x: 0, y: 0 };
  for (let i = 0; i < 2200; i++) {
    cam.project(rnd() * FIELD.width, rnd() * FIELD.height, 0, p);
    ctx.fillStyle = rnd() > 0.5 ? '#ffffff' : '#000000';
    ctx.fillRect(p.x, p.y, 1.2, 1.2);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = withAlpha(pal.railTop, 0.5);
  ctx.lineWidth = 2;
  tracePath(ctx, cam, outline, 0, true);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
