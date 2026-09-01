import type { TableCamera } from './project';
import { tracePath, arcPoints, circlePoints, extrudeStroke, fillPoly } from './geom';
import { mix, withAlpha, pitchColor, tone } from './palette';
import type { Stage, RenderQuality } from './stage';
import { drawKeys } from './keys';
import type { Game } from '../game/game';
import type { WallStyle } from '../game/table/schema';
import type { Theme } from './theme';
import type { Vec2 } from '../physics/vec2';
import { clamp01, TAU } from '../core/math';
import { noteName } from '../midi/notes';
import type { Landing } from '../game/predict';
import { crownAt } from '../game/keyLayout';

/** Where the music is: which beat of the bar, and how far through it. */
export interface BeatHint {
  beat: number;
  phase: number;
}

/**
 * What the mode knows about the immediate future and the renderer does not.
 *
 * The landing predictor is a display affordance, so it runs once per drawn
 * frame in the mode rather than in the simulation, and arrives here as advice.
 * So does the beat: the renderer never sees the audio clock, only where the
 * mode says the beat is — or null, when there is no beat to show.
 */
export interface DrawHints {
  /** Extra light per note, for the key a ball is falling towards. */
  highlight(note: number): number;
  landings: Landing[];
  beat: BeatHint | null;
}

/** The centre of the bumper nest, which is where the table's pulse is drawn from. */
export function nestOf(game: Game): { x: number; y: number } {
  let x = 0, y = 0, n = 0;
  for (const el of game.table.elements) {
    if (el.kind === 'bumper') { x += el.x; y += el.y; n++; }
  }
  return n ? { x: x / n, y: y / n } : { x: game.def.width / 2, y: game.def.height / 2 };
}

/**
 * Bottom and top colours of each extruded wall style.
 *
 * Was a switch of literals; the theme now carries the whole table, so a look
 * can say what metal and rubber mean to it without touching the renderer.
 */
function wallColors(style: WallStyle, theme: Theme): [string, string] {
  return theme.walls[style] ?? theme.walls.rail;
}

/**
 * The pinball table, drawn onto a shared Stage.
 *
 * The playfield is baked once into the Stage's static layer and blitted; only
 * balls, keys and effects are redrawn. Emissive work goes to the Stage's own
 * layer so the bloom pass can be a couple of cheap downscales rather than a
 * real blur.
 */
export class PinballRenderer {
  constructor(readonly stage: Stage) {}

  // Shorthands onto the stage. The drawing code below reads better for them,
  // and they keep it honest that none of this state is the renderer's own.
  private get cam(): TableCamera { return this.stage.cam; }
  private get quality(): RenderQuality { return this.stage.quality; }
  private get cssW(): number { return this.stage.cssW; }
  private get cssH(): number { return this.stage.cssH; }
  private get dpr(): number { return this.stage.dpr; }
  private get bounds(): { minX: number; maxX: number; minY: number; maxY: number } { return this.stage.bounds; }
  private get t(): number { return this.stage.t; }
  private hue(note: number): number { return this.stage.hue(note); }

  // ------------------------------------------------------------- baking ---

  /** Redraw the static playfield. Runs on load and on resize only. */
  private bake(game: Game): void {
    if (!this.stage.needsBake(game.def.id)) return;

    const ctx = this.stage.baked.ctx;
    const pal = this.stage.palette;
    const H = game.def.height;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);

    this.stage.measureBounds(game.def.outline);
    this.bakeCabinet(ctx);

    // --- Playfield surface ---
    const corners: Vec2[] = game.def.outline;
    const nearPt = { x: 0, y: 0 }, farPt = { x: 0, y: 0 };
    this.cam.project(game.def.width / 2, 0, 0, nearPt);
    this.cam.project(game.def.width / 2, H, 0, farPt);
    const floor = ctx.createLinearGradient(nearPt.x, nearPt.y, farPt.x, farPt.y);
    floor.addColorStop(0, pal.floorNear);
    floor.addColorStop(0.55, mix(pal.floorNear, pal.floorFar, 0.7));
    floor.addColorStop(1, pal.floorFar);
    fillPoly(ctx, this.cam, corners, 0, floor);

    ctx.save();
    tracePath(ctx, this.cam, corners, 0, true);
    ctx.clip();

    // Brushed arcs, the way a real playfield catches the light.
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = pal.railTop;
    for (let r = 220; r < 2200; r += 46) {
      tracePath(ctx, this.cam, arcPoints(game.def.width / 2, -520, r, 0.35, Math.PI - 0.35, 40), 0);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    this.bakeDecals(ctx, game);

    // Fine grain: deterministic, so the surface never shimmers between resizes.
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    ctx.globalAlpha = 0.05;
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * game.def.width, y = rnd() * H;
      const p = { x: 0, y: 0 };
      this.cam.project(x, y, 0, p);
      ctx.fillStyle = rnd() > 0.5 ? '#ffffff' : '#000000';
      ctx.fillRect(p.x, p.y, 1.2, 1.2);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // --- Walls ---
    for (const wall of game.table.walls) {
      const pts = wall.kind === 'arc'
        ? arcPoints(wall.c!.x, wall.c!.y, wall.r!, wall.a0!, wall.a1!)
        : wall.points!;
      const [lo, hi] = wallColors(wall.style, this.stage.theme);
      const scale = this.cam.scaleAt(pts[0].x, pts[0].y);
      const width = wall.thickness * 2 * scale;

      // Contact shadow first, then the extrusion, then a lit top edge.
      ctx.globalAlpha = 0.5;
      tracePath(ctx, this.cam, pts, 0, wall.closed);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = width * 1.5;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.stroke();
      ctx.globalAlpha = 1;

      extrudeStroke(ctx, this.cam, pts, 0, wall.height, width,
        (t) => mix(lo, hi, t * t * 0.85 + 0.05), wall.closed, 8);

      tracePath(ctx, this.cam, pts, wall.height, wall.closed);
      ctx.strokeStyle = mix(hi, '#ffffff', 0.4);
      ctx.lineWidth = Math.max(1, width * 0.24);
      ctx.stroke();
    }
  }

  /**
   * The cabinet the table sits in.
   *
   * A portrait playfield on a landscape display leaves a third of the frame
   * empty; filling it with the machine itself is both truer to the subject and
   * a place to put the piano roll.
   */
  private bakeCabinet(ctx: CanvasRenderingContext2D): void {
    const pal = this.stage.palette;
    const { minX, maxX } = this.bounds;
    const w = this.cssW, h = this.cssH;

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, mix(pal.void, '#000000', 0.35));
    bg.addColorStop(0.55, pal.void);
    bg.addColorStop(1, mix(pal.void, '#000000', 0.5));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    for (const [x0, x1, dir] of [[0, minX, 1], [maxX, w, -1]] as const) {
      const span = x1 - x0;
      if (span < 24) continue;
      const side = ctx.createLinearGradient(dir > 0 ? x0 : x1, 0, dir > 0 ? x1 : x0, 0);
      side.addColorStop(0, mix(pal.void, '#000000', 0.6));
      side.addColorStop(0.35, mix(pal.void, '#000000', 0.35));
      side.addColorStop(0.7, mix(pal.void, pal.rail, 0.28));
      side.addColorStop(0.92, mix(pal.rail, pal.railTop, 0.16));
      side.addColorStop(1, mix(pal.rail, pal.railTop, 0.3));
      ctx.fillStyle = side;
      ctx.fillRect(x0, 0, span, h);

      // Brushed metal, and a highlight along the edge nearest the playfield.
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.strokeStyle = pal.railTop;
      ctx.lineWidth = 1;
      for (let y = 0; y < h; y += 5) {
        ctx.beginPath();
        ctx.moveTo(x0, y + (dir > 0 ? 0 : 2));
        ctx.lineTo(x1, y);
        ctx.stroke();
      }
      ctx.restore();

      const edge = dir > 0 ? x1 : x0;
      const lip = ctx.createLinearGradient(edge - dir * 18, 0, edge, 0);
      lip.addColorStop(0, withAlpha(pal.railTop, 0));
      lip.addColorStop(1, withAlpha(pal.railTop, 0.3));
      ctx.fillStyle = lip;
      ctx.fillRect(Math.min(edge, edge - dir * 18), 0, 18, h);
    }
  }

  private bakeDecals(ctx: CanvasRenderingContext2D, game: Game): void {
    const p = { x: 0, y: 0 };
    const tints = this.stage.theme.decals;
    for (const d of game.table.decals) {
      // The table names the role; the theme says what it is printed in.
      const color = tints[d.tint];
      ctx.globalAlpha = d.alpha ?? 1;
      const scale = this.cam.scaleAt(d.x, d.y);
      switch (d.kind) {
        case 'glow': {
          this.cam.project(d.x, d.y, 0, p);
          const r = (d.r ?? 100) * scale;
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          g.addColorStop(0, color);
          g.addColorStop(1, withAlpha(color, 0));
          ctx.fillStyle = g;
          ctx.fillRect(p.x - r, p.y - r * 0.8, r * 2, r * 1.6);
          break;
        }
        case 'arcband': {
          tracePath(ctx, this.cam, circlePoints(d.x, d.y, d.r ?? 100, 72), 0, true);
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(1, 3 * scale);
          ctx.stroke();
          break;
        }
        case 'inset': {
          const hw = (d.w ?? 40) / 2, hh = (d.h ?? 10) / 2;
          const pts: Vec2[] = [
            { x: d.x - hw, y: d.y - hh }, { x: d.x + hw, y: d.y - hh },
            { x: d.x + hw, y: d.y + hh }, { x: d.x - hw, y: d.y + hh },
          ];
          fillPoly(ctx, this.cam, pts, 0, color);
          break;
        }
        case 'line': {
          const hw = (d.w ?? 40) / 2;
          tracePath(ctx, this.cam, [{ x: d.x - hw, y: d.y }, { x: d.x + hw, y: d.y }], 0);
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(1, (d.h ?? 2) * scale);
          ctx.stroke();
          break;
        }
        default:
          break;
      }
    }
    ctx.globalAlpha = 1;
  }

  // -------------------------------------------------------------- frame ---

  draw(game: Game, alpha: number, dt: number, hints?: DrawHints): void {
    const stage = this.stage;

    this.bake(game);
    stage.beginFrame(dt);

    const ctx = stage.ctx;
    const em = stage.emissive.ctx;

    // The beat as an envelope: a sharp swell at the top of each beat that has
    // died away by the next, the downbeat the strongest.
    const beat = hints?.beat ?? null;
    const env = beat ? Math.pow(1 - beat.phase, 4) * (beat.beat === 0 ? 1 : 0.55) : 0;

    const sorted = [...game.table.elements].sort((a, b) => b.y - a.y);
    for (const el of sorted) this.drawElement(ctx, em, game, el, env);
    this.drawPulse(em, game, env);

    drawKeys(ctx, em, stage, game.keybed, hints ? { highlight: hints.highlight } : {});
    if (hints) this.drawLandings(ctx, em, game, hints);
    this.drawBalls(ctx, em, game, alpha);
    stage.particles.draw(em, stage.cam);

    stage.composite();
    stage.drawRoll();
    this.drawPops(ctx, game);
    stage.drawGlass();
    stage.endFrame();
  }

  /**
   * Where each ball is coming down, and what to press when it does.
   *
   * The lit key is the affordance that matters; this adds the two things the
   * light alone cannot say — *where* on the keybed, and *which note*. Drawn
   * faintly and only once the landing is close enough to act on, so the table
   * does not turn into a diagram.
   */
  private drawLandings(
    ctx: CanvasRenderingContext2D,
    em: CanvasRenderingContext2D,
    game: Game,
    hints: DrawHints,
  ): void {
    const stage = this.stage;
    const pal = stage.palette;

    for (const L of hints.landings) {
      const near = clamp01((1.4 - L.t) / 1.1);
      if (near <= 0.02) continue;
      const hue = this.hue(L.note);

      // The flight path, as a hairline. Faint enough to read past.
      ctx.save();
      ctx.globalAlpha = 0.16 * near;
      ctx.strokeStyle = pitchColor(L.note);
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 9]);
      tracePath(ctx, this.cam, L.path, 8);
      ctx.stroke();
      ctx.restore();

      // The touchdown point, and the name of the key under it.
      stage.halo(em, L.x, L.y, 6, hue, 40, 0.5 * near);
      const k = game.keybed.keys[L.lane];
      if (!k) continue;
      const g = k.geom;
      stage.label(
        ctx,
        g.drawCx + g.nx * 12, g.drawCy + g.ny * 12, g.z + 18,
        noteName(g.note), pal.ink, 0.75 * near,
      );
    }
  }

  // -------------------------------------------------------------- pulse ---

  /**
   * The beat, on the table.
   *
   * Groove is worth points on every key press, and the beat it is judged
   * against was nowhere on screen. The pulse rings the bumper nest and runs
   * along the lip of the keybed, swelling on each beat and harder on the
   * downbeat. Under reduced motion nothing moves — the ring keeps its size and
   * the strip its width — and only the brightness breathes, since a glow that
   * changes is not motion.
   */
  private drawPulse(em: CanvasRenderingContext2D, game: Game, env: number): void {
    if (env <= 0.001) return;
    const still = this.quality.reducedMotion;
    const breathe = still ? 0 : env;
    const hue = this.hue(game.music.root);
    const nest = nestOf(game);
    const alpha = (0.04 + env * 0.16) * (still ? 0.5 : 1);

    em.save();
    em.globalCompositeOperation = 'lighter';
    em.strokeStyle = tone(hue, 80, 62, alpha);
    em.lineCap = 'round';
    em.lineWidth = Math.max(1, (2 + breathe * 3) * this.cam.scaleAt(nest.x, nest.y));
    tracePath(em, this.cam, circlePoints(nest.x, nest.y, 250 * (1 + breathe * 0.08)), 2, true);
    em.stroke();

    // Along the keybed, following its crown, just up the table from the lip.
    const L = game.keybed.layout;
    const pts: Vec2[] = [];
    for (let i = 0; i <= 24; i++) {
      const x = L.left + ((L.right - L.left) * i) / 24;
      pts.push({ x, y: L.baseY + crownAt(x, L) + 14 });
    }
    em.lineWidth = Math.max(1, (6 + breathe * 8) * this.cam.scaleAt(game.def.width / 2, L.baseY));
    tracePath(em, this.cam, pts, 0);
    em.stroke();
    em.restore();
  }

  // ----------------------------------------------------------- elements ---

  private drawElement(ctx: CanvasRenderingContext2D, em: CanvasRenderingContext2D, game: Game, el: Game['table']['elements'][number], env = 0): void {
    const pal = this.stage.palette;
    const mat = this.stage.theme.elements;
    const energised = el.energisedUntil > game.time;
    const hue = el.note !== null ? this.hue(el.note) : 205;
    const flash = el.flash;

    switch (el.kind) {
      case 'post': {
        this.stage.groundShadow(ctx, el.x, el.y, el.r, el.z);
        this.stage.column(ctx, el.x, el.y, el.r, 0, el.z * 0.7, mat.postLo, mat.postHi);
        this.stage.column(ctx, el.x, el.y, el.r * 1.12, el.z * 0.7, el.z, mat.sleeveLo, mat.sleeveHi);
        this.stage.fillDisc(ctx, el.x, el.y, el.r * 0.62, el.z + 1, mat.sleeveCap);
        this.stage.outlineDisc(ctx, el.x, el.y, el.r * 1.12, el.z);
        if (flash > 0) this.stage.halo(em, el.x, el.y, el.z, 330, el.r * 3, flash * 0.7);
        break;
      }

      case 'bumper': {
        const pulse = energised ? 0.55 + Math.sin(this.t * 12) * 0.2 : 0;
        const squash = 1 - flash * 0.22;
        this.stage.groundShadow(ctx, el.x, el.y, el.r, el.z);
        // Painted skirt ring on the playfield. It rides the beat as well as the
        // energising, but only in its light, so a bumper breathing with the
        // music never reads as one the player is holding the note of.
        this.stage.fillDisc(ctx, el.x, el.y, el.r * 1.5, 0.5, withAlpha(pal.neon, 0.10 + pulse * 0.25 + env * 0.12));
        this.stage.fillDisc(ctx, el.x, el.y, el.r * 1.22, 1, withAlpha(pal.void, 0.55));
        this.stage.column(ctx, el.x, el.y, el.r, 0, el.z * squash, mat.bumperLo, mix(mat.bumperHi, pitchColor(el.note ?? 60, 70, 46), 0.55));

        const p = { x: 0, y: 0 };
        this.cam.project(el.x, el.y, el.z * squash, p);
        const scale = this.cam.scaleAt(el.x, el.y, el.z);
        const rr = el.r * scale;
        const cap = ctx.createRadialGradient(p.x - rr * 0.35, p.y - rr * 0.45, rr * 0.1, p.x, p.y, rr * 1.15);
        const capHue = hue;
        cap.addColorStop(0, tone(capHue, 100, 88 - flash * 6));
        cap.addColorStop(0.45, tone(capHue, 88, 62 + pulse * 14));
        cap.addColorStop(1, tone(capHue, 70, 26));
        this.stage.fillDisc(ctx, el.x, el.y, el.r, el.z * squash, cap);
        this.stage.outlineDisc(ctx, el.x, el.y, el.r, el.z * squash);
        this.stage.fillDisc(ctx, el.x, el.y, el.r * 0.38, el.z * squash + 2, tone(capHue, 100, 96, 0.5 + pulse * 0.5));

        this.stage.halo(em, el.x, el.y, el.z, capHue, el.r * 2.6, flash * 0.9 + pulse * 0.5 + env * 0.35);
        if (this.quality.labels && el.note !== null) this.stage.label(ctx, el.x, el.y, el.z + 14, noteName(el.note), pal.ink, 0.55);
        break;
      }

      case 'sling': {
        const pts = [el.a, el.b];
        const scale = this.cam.scaleAt(el.x, el.y);
        const w = 17 * scale;
        ctx.globalAlpha = 0.45;
        tracePath(ctx, this.cam, pts, 0);
        ctx.strokeStyle = '#000'; ctx.lineWidth = w * 1.4; ctx.lineCap = 'round';
        ctx.stroke();
        ctx.globalAlpha = 1;
        extrudeStroke(ctx, this.cam, pts, 0, el.z, w,
          (t) => mix(mat.slingLo, flash > 0 ? mat.slingFlash : mat.slingHi, t * 0.9 + 0.1), false, 7);
        this.stage.halo(em, el.x, el.y, el.z, 335, 70, flash * 1.1 + (energised ? 0.35 : 0));
        break;
      }

      case 'target': {
        const scale = this.cam.scaleAt(el.x, el.y);
        const pts = [el.a, el.b];
        if (el.down) {
          tracePath(ctx, this.cam, pts, 1);
          ctx.strokeStyle = withAlpha(pal.railTop, 0.28);
          ctx.lineWidth = 9 * scale;
          ctx.lineCap = 'round';
          ctx.stroke();
          break;
        }
        this.stage.groundShadow(ctx, el.x, el.y, el.r * 0.6, el.z, 0.7);
        extrudeStroke(ctx, this.cam, pts, 0, el.z, 11 * scale,
          (t) => mix(mat.targetLo, tone(hue, 82, 52 + flash * 30), t * 0.95 + 0.05), false, 7);
        tracePath(ctx, this.cam, pts, el.z);
        ctx.strokeStyle = tone(hue, 100, 78 + flash * 20);
        ctx.lineWidth = 3.5 * scale;
        ctx.stroke();
        this.stage.halo(em, el.x, el.y, el.z, hue, 54, flash + (energised ? 0.4 : 0));
        if (this.quality.labels && el.note !== null) this.stage.label(ctx, el.x, el.y, el.z + 12, noteName(el.note), pal.ink, 0.6);
        break;
      }

      case 'rollover': {
        const lit = el.down;
        this.stage.fillDisc(ctx, el.x, el.y, el.r * 1.18, 0.4, withAlpha(pal.railTop, 0.3));
        this.stage.fillDisc(ctx, el.x, el.y, el.r, 0.8, withAlpha(pal.void, 0.75));
        this.stage.fillDisc(ctx, el.x, el.y, el.r * 0.84, 1.2,
          lit ? tone(hue, 96, 66) : tone(hue, 55, 34));
        this.stage.fillDisc(ctx, el.x, el.y, el.r * 0.46, 1.6,
          lit ? tone(hue, 100, 88) : tone(hue, 45, 44));
        this.stage.outlineDisc(ctx, el.x, el.y, el.r * 0.84, 1.2);
        this.stage.halo(em, el.x, el.y, 2, hue, el.r * 2.6, (lit ? 0.55 : 0.12) + flash);
        break;
      }

      case 'spinner': {
        const scale = this.cam.scaleAt(el.x, el.y);
        const open = Math.abs(Math.cos(el.spin));
        // Posts either side of the blade.
        for (const end of [el.a, el.b]) this.stage.column(ctx, end.x, end.y, 7, 0, el.z, mat.spinnerLo, mat.spinnerHi, 6);
        // The blade foreshortens as it spins, which is what reads as rotation.
        const z0 = el.z * (0.52 - open * 0.42), z1 = el.z * (0.52 + open * 0.46);
        for (let i = 0; i <= 6; i++) {
          const t = i / 6;
          tracePath(ctx, this.cam, [el.a, el.b], z0 + (z1 - z0) * t);
          ctx.strokeStyle = mix(mat.rolloverLo, tone(hue, 85, 58 + flash * 32), t * 0.9 + 0.1);
          ctx.lineWidth = Math.max(1, 7 * scale);
          ctx.lineCap = 'butt';
          ctx.stroke();
        }
        tracePath(ctx, this.cam, [el.a, el.b], z1);
        ctx.strokeStyle = tone(hue, 100, 80);
        ctx.lineWidth = Math.max(1, 2.2 * scale);
        ctx.stroke();
        this.stage.halo(em, el.x, el.y, el.z * 0.5, hue, 60, flash * 0.8 + Math.min(0.5, Math.abs(el.spinRate) * 0.03));
        break;
      }

      default:
        break;
    }
  }

  // -------------------------------------------------------------- balls ---

  private trails = new Map<number, { x: number; y: number }[]>();

  private drawBalls(ctx: CanvasRenderingContext2D, em: CanvasRenderingContext2D, game: Game, alpha: number): void {
    const live = new Set<number>();
    const p = { x: 0, y: 0 };

    for (const ball of game.balls) {
      live.add(ball.id);
      const x = ball.prev.x + (ball.p.x - ball.prev.x) * alpha;
      const y = ball.prev.y + (ball.p.y - ball.prev.y) * alpha;

      let trail = this.trails.get(ball.id);
      if (!trail) { trail = []; this.trails.set(ball.id, trail); }
      trail.push({ x, y });
      if (trail.length > 14) trail.shift();

      const scale = this.cam.scaleAt(x, y, ball.r);
      const r = ball.r * scale;
      const speed = Math.hypot(ball.v.x, ball.v.y);

      // Motion streak: tapered from a point behind the ball out to its full
      // width at the ball itself, so it reads as a smear rather than a stick.
      if (trail.length > 3 && speed > 260) {
        em.globalCompositeOperation = 'lighter';
        em.lineCap = 'round';
        const strength = Math.min(0.5, speed / 3400);
        const q = { x: 0, y: 0 };
        for (let i = 1; i < trail.length; i++) {
          const f = i / (trail.length - 1);
          this.cam.project(trail[i - 1].x, trail[i - 1].y, ball.r, p);
          this.cam.project(trail[i].x, trail[i].y, ball.r, q);
          em.beginPath();
          em.moveTo(p.x, p.y);
          em.lineTo(q.x, q.y);
          em.strokeStyle = withAlpha(this.stage.theme.ball.streak, strength * f * f * 0.55);
          em.lineWidth = Math.max(0.5, r * 0.95 * f);
          em.stroke();
        }
        em.globalCompositeOperation = 'source-over';
      }

      this.stage.groundShadow(ctx, x, y, ball.r, ball.r, 1);
      this.cam.project(x, y, ball.r, p);

      // Chrome: dark limb, bright lit side, a hard specular and a rim kick.
      const lx = p.x - r * 0.42, ly = p.y - r * 0.5;
      const body = ctx.createRadialGradient(lx, ly, r * 0.06, p.x, p.y, r * 1.08);
      const chrome = this.stage.theme.ball;
      const STOPS = [0, 0.2, 0.46, 0.72, 0.93, 1] as const;
      chrome.body.forEach((c, i) => body.addColorStop(STOPS[i], c));
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r, 0, 0, TAU);
      ctx.fillStyle = body;
      ctx.fill();
      // Contact occlusion: a dark ring that seats the ball on the playfield.
      // An outlined theme wants that ring opaque and even, as a drawn edge
      // rather than as shading, so it takes the outline colour and weight.
      const ring = this.stage.theme.outline;
      ctx.globalAlpha = ring ? 1 : 0.5;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r * 1.02, r * 1.02, 0, 0, TAU);
      ctx.strokeStyle = ring ? ring.color : chrome.edge;
      ctx.lineWidth = Math.max(1, ring ? ring.width : r * 0.14);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Equator band rotates with the ball so spin is readable.
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r, 0, 0, TAU);
      ctx.clip();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = chrome.seam;
      ctx.lineWidth = r * 0.3;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + r * 0.22, r * 1.15, r * 0.42, ball.angle * 0.25, 0, TAU);
      ctx.stroke();
      ctx.restore();

      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.ellipse(lx, ly, r * 0.26, r * 0.19, -0.6, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.96, 0.6, 2.4);
      ctx.strokeStyle = chrome.rim;
      ctx.lineWidth = Math.max(1, r * 0.1);
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (ball.safeFor > 0) {
        // A ring, not a blob: the save indicator must never hide the ball.
        ctx.globalAlpha = 0.5 + Math.sin(this.t * 8) * 0.22;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r * 1.55, r * 1.28, 0, 0, TAU);
        ctx.strokeStyle = chrome.save;
        ctx.lineWidth = Math.max(1, r * 0.12);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    for (const id of [...this.trails.keys()]) if (!live.has(id)) this.trails.delete(id);
  }

  private drawPops(ctx: CanvasRenderingContext2D, game: Game): void {
    const p = { x: 0, y: 0 };
    for (const pop of game.scoring.pops) {
      const age = clamp01((game.time - pop.at) / 1.2);
      if (age >= 1) continue;
      const rise = age * 70;
      this.cam.project(pop.x, pop.y, 30 + rise, p);
      const scale = this.cam.scaleAt(pop.x, pop.y);
      ctx.save();
      ctx.globalAlpha = 1 - age * age;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = tone(pop.tone * 360, 92, 78);
      ctx.font = `700 ${Math.max(11, (pop.label ? 20 : 17) * scale)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 8;
      ctx.fillText(pop.label || pop.amount.toLocaleString(), p.x, p.y);
      if (pop.label) {
        ctx.font = `600 ${Math.max(9, 13 * scale)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillText(pop.amount.toLocaleString(), p.x, p.y + 18 * scale);
      }
      ctx.restore();
    }
  }
}
