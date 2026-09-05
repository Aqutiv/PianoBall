import { tracePath, fillPoly, silhouette } from './geom';
import { mix, tone } from './palette';
import type { Stage } from './stage';
import type { KeyDeck, KeyLit } from '../game/keys';
import type { Vec2 } from '../physics/vec2';
import { clamp01 } from '../core/math';
import { noteName } from '../midi/notes';

export interface KeyDrawOptions {
  /**
   * Extra light on a key, 0..1, on top of whatever the player's own press
   * gives it. PlayTune points at the key an aura is falling towards; Freestyle
   * lights the selected scale while Auto backing is on.
   */
  highlight?: (note: number) => number;
  /** Color the full face of guided keys without spreading light to neighbors. */
  keyTint?: boolean;
  /** Draw the C labels. Defaults to the stage's `labels` quality setting. */
  labels?: boolean;
  /** First melody note when Freestyle reserves an octave for chords. */
  chordSplit?: number;
  chordRoot?: number;
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
  const km = stage.theme.keys;
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
      const guide = opts.highlight ? clamp01(opts.highlight(g.note)) : 0;
      const scaleKey = !!opts.keyTint && guide > 0;
      const tonic = scaleKey && guide > 0.4;
      const glow = Math.max(lit, opts.keyTint ? 0 : guide);
      const zTop = g.z - (k.pos / 24) * 5;
      const hue = stage.hue(g.note);

      // Side walls, then the face.
      const lo = g.black ? km.blackSide : km.whiteSide;
      const hi = g.black
        ? mix(km.blackTop, tone(hue, 70, 30), 0.35 + glow * 0.5)
        : mix(km.whiteTop, tone(hue, 85, 74), glow * 0.75 + held * 0.12);

      // One fill for the whole wall rather than seven stacked copies of the
      // key. The stack was the single most expensive thing on the frame —
      // thirty-two keys times seven full rasterisations — and it banded, since
      // seven steps over twenty screen pixels is seven steps. The gradient
      // keeps the same `t * t * 0.7 + 0.15` curve the slices walked.
      const p0 = { x: 0, y: 0 }, p1 = { x: 0, y: 0 };
      cam.project(g.drawCx, g.drawCy, 0, p0);
      cam.project(g.drawCx, g.drawCy, zTop, p1);
      const wall = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        wall.addColorStop(t, mix(lo, hi, t * t * 0.7 + 0.15));
      }
      silhouette(ctx, cam, quad, 0, zTop);
      ctx.fillStyle = wall;
      ctx.fill();

      cam.project(quad[0].x, quad[0].y, zTop, p0);
      cam.project(quad[2].x, quad[2].y, zTop, p1);
      const face = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
      if (scaleKey) {
        // Color reaches the bottom of the key, so membership reads without bloom.
        const lift = tonic ? 8 : 0;
        face.addColorStop(0, tone(hue, 76, (g.black ? 54 : 72) + lift + held * 4));
        face.addColorStop(1, tone(hue, 64, (g.black ? 30 : 49) + lift + held * 4));
      } else if (g.black) {
        face.addColorStop(0, mix(km.blackFaceHi, tone(hue, 80, 46), glow * 0.85));
        face.addColorStop(1, km.blackFaceLo);
      } else {
        face.addColorStop(0, mix(km.whiteFaceHi, tone(hue, 95, 82), glow * 0.9));
        face.addColorStop(1, mix(km.whiteFaceLo, tone(hue, 60, 58), glow * 0.5));
      }
      fillPoly(ctx, cam, quad, zTop, face);
      if (scaleKey) {
        tracePath(ctx, cam, quad, zTop, true);
        ctx.strokeStyle = tone(hue, 80, 88, tonic ? 0.9 : 0.4);
        ctx.lineWidth = tonic ? 2 : 1;
        ctx.stroke();
      }

      // Lit front lip: the edge the ball actually strikes.
      tracePath(ctx, cam, [quad[0], quad[1]], zTop);
      ctx.strokeStyle = opts.keyTint && !scaleKey && glow < 0.02
        ? mix(g.black ? km.blackFaceLo : km.whiteFaceLo, g.black ? km.blackFaceHi : km.whiteFaceHi, 0.4)
        : g.black ? tone(hue, 40 + glow * 55, 28 + glow * 52)
        : tone(hue, 34 + glow * 62, 64 + glow * 30);
      ctx.lineWidth = Math.max(1, 3 * cam.scaleAt(g.cx, g.cy));
      ctx.lineCap = 'round';
      ctx.stroke();

      if (glow > 0.02) stage.halo(em, g.cx, fy, zTop, hue, hw * 3.4, glow * (0.5 + k.velocity * 0.7));

      const chordKey = opts.chordSplit !== undefined && g.note < opts.chordSplit;
      if (chordKey) {
        // A band along the playfield edge leaves the pressed face readable.
        tracePath(ctx, cam, [quad[0], quad[1]], zTop + 1);
        ctx.strokeStyle = pal.ink;
        ctx.globalAlpha = g.note === opts.chordRoot ? 0.95 : 0.35;
        ctx.lineWidth = g.note === opts.chordRoot ? 4 : 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (g.note === opts.chordRoot) {
          stage.label(ctx, g.cx, g.cy + 22, zTop + 2, '◆', pal.ink, 0.95, 18, { minSize: 9 });
        }
        stage.label(ctx, g.drawCx - g.nx * g.depth * 0.62, g.drawCy - g.ny * g.depth * 0.62, zTop + 1,
          noteName(g.note), g.black ? pal.ink : pal.void, 0.9, 18, { minSize: 8 });
      } else if (labels && scaleKey) {
        stage.label(ctx, g.drawCx - g.nx * g.depth * 0.68, g.drawCy - g.ny * g.depth * 0.68, zTop + 1,
          noteName(g.note), g.black ? pal.ink : pal.void, 0.9, 18, { minSize: 8 });
      } else if (labels && !g.black && g.note % 12 === 0) {
        stage.label(ctx, g.drawCx - g.nx * g.depth * 0.62, g.drawCy - g.ny * g.depth * 0.62, zTop + 1,
          `C${Math.floor(g.note / 12) - 1}`, pal.void, 0.5);
      }
    }
  }
  if (opts.chordSplit !== undefined) {
    const split = opts.chordSplit;
    const chords = deck.keys.filter((k) => k.geom.note < split);
    const melody = deck.keys.filter((k) => k.geom.note >= split);
    for (const [keys, caption] of [[chords, 'Chord keys'], [melody, 'Melody']] as const) {
      if (!keys.length) continue;
      const left = keys[0].geom, right = keys[keys.length - 1].geom;
      stage.label(ctx, (left.cx + right.cx) / 2,
        Math.max(...keys.map((k) => k.geom.cy)) + 75, 28,
        caption, pal.ink, 0.9, 23, { minSize: 10, edge: pal.void });
    }
    const first = melody[0]?.geom;
    if (first) {
      const x = first.cx - first.halfW;
      tracePath(ctx, cam, [{ x, y: first.cy + 8 }, { x, y: first.cy - first.depth - 18 }], 28);
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}
