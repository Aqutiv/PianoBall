import { tracePath, fillPoly } from './geom';
import { mix } from './palette';
import type { Stage } from './stage';
import type { KeyDeck, KeyLit } from '../game/keys';
import type { Vec2 } from '../physics/vec2';
import { clamp01 } from '../core/math';

export interface KeyDrawOptions {
  /**
   * Extra light on a key, 0..1, on top of whatever the player's own press
   * gives it. PlayTune points at the key an aura is falling towards; Freestyle
   * lights the tones of the chord currently sounding.
   */
  highlight?: (note: number) => number;
  /** Draw the C labels. Defaults to the stage's `labels` quality setting. */
  labels?: boolean;
}

/**
 * The piano, drawn as extruded keys standing on the near edge of the table.
 *
 * Whites first, then blacks: the blacks stand in front of and above them, so
 * painting in that order is all the depth sorting a keyboard needs.
 */
export function drawKeys(
  ctx: CanvasRenderingContext2D,
  em: CanvasRenderingContext2D,
  stage: Stage,
  deck: KeyDeck<KeyLit>,
  opts: KeyDrawOptions = {},
): void {
  const cam = stage.cam;
  const pal = stage.palette;
  const labels = opts.labels ?? stage.quality.labels;

  for (const pass of [false, true]) {
    for (const k of deck.keys) {
      const g = k.geom;
      if (g.black !== pass) continue;
      const ax = Math.cos(g.tilt), ay = Math.sin(g.tilt);
      const fx = g.drawCx + g.nx * k.pos, fy = g.drawCy + g.ny * k.pos;
      const hw = g.drawHalfW - (g.black ? 0.5 : 1.4);
      const quad: Vec2[] = [
        { x: fx - ax * hw, y: fy - ay * hw },
        { x: fx + ax * hw, y: fy + ay * hw },
        { x: fx + ax * hw - g.nx * g.depth, y: fy + ay * hw - g.ny * g.depth },
        { x: fx - ax * hw - g.nx * g.depth, y: fy - ay * hw - g.ny * g.depth },
      ];

      const held = k.down ? 1 : 0;
      const lit = clamp01(1 - (deck.time - k.litAt) * 2.6);
      // A highlight can only ever add: a key the player is actually holding
      // must never look dimmer than one the game is merely pointing at.
      const glow = Math.max(lit, opts.highlight ? clamp01(opts.highlight(g.note)) : 0);
      const zTop = g.z - (k.pos / 24) * 5;
      const hue = stage.hue(g.note);

      // Side walls, then the face.
      const lo = g.black ? '#05060f' : '#171d33';
      const hi = g.black
        ? mix('#1b2038', `hsl(${hue} 70% 30%)`, 0.35 + glow * 0.5)
        : mix('#cfd8f0', `hsl(${hue} 85% 74%)`, glow * 0.75 + held * 0.12);
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        fillPoly(ctx, cam, quad, zTop * t, mix(lo, hi, t * t * 0.7 + 0.15));
      }

      const p0 = { x: 0, y: 0 }, p1 = { x: 0, y: 0 };
      cam.project(quad[0].x, quad[0].y, zTop, p0);
      cam.project(quad[2].x, quad[2].y, zTop, p1);
      const face = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
      if (g.black) {
        face.addColorStop(0, mix('#2a3150', `hsl(${hue} 80% 46%)`, glow * 0.85));
        face.addColorStop(1, '#0b0e1c');
      } else {
        face.addColorStop(0, mix('#f2f5ff', `hsl(${hue} 95% 82%)`, glow * 0.9));
        face.addColorStop(1, mix('#9aa6cb', `hsl(${hue} 60% 58%)`, glow * 0.5));
      }
      fillPoly(ctx, cam, quad, zTop, face);

      // Lit front lip: the edge the ball actually strikes.
      tracePath(ctx, cam, [quad[0], quad[1]], zTop);
      ctx.strokeStyle = g.black
        ? `hsl(${hue} ${40 + glow * 55}% ${28 + glow * 52}%)`
        : `hsl(${hue} ${34 + glow * 62}% ${64 + glow * 30}%)`;
      ctx.lineWidth = Math.max(1, 3 * cam.scaleAt(g.cx, g.cy));
      ctx.lineCap = 'round';
      ctx.stroke();

      if (glow > 0.02) stage.halo(em, g.cx, fy, zTop, hue, hw * 3.4, glow * (0.5 + k.velocity * 0.7));

      if (labels && !g.black && g.note % 12 === 0) {
        stage.label(ctx, g.drawCx - g.nx * g.depth * 0.62, g.drawCy - g.ny * g.depth * 0.62, zTop + 1,
          `C${Math.floor(g.note / 12) - 1}`, pal.void, 0.5);
      }
    }
  }
}
