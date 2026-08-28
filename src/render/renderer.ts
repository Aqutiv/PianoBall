import { TableCamera } from './project';
import { Particles } from './particles';
import { tracePath, arcPoints, circlePoints, extrudeStroke, fillPoly } from './geom';
import { mix, withAlpha, pitchColor, pitchHue, pitchHueSafe, LIGHT } from './palette';
import { shadowSprite, glowSprite } from './sprites';
import type { Game } from '../game/game';
import type { WallStyle, TablePalette } from '../game/table/schema';
import type { Vec2 } from '../physics/vec2';
import { clamp01, TAU } from '../core/math';
import { noteName } from '../midi/notes';

export interface RenderQuality {
  bloom: boolean;
  particles: number;
  shadows: boolean;
  labels: boolean;
  reducedMotion: boolean;
  colorBlind: boolean;
}

export const DEFAULT_QUALITY: RenderQuality = {
  bloom: true,
  particles: 1400,
  shadows: true,
  labels: true,
  reducedMotion: false,
  colorBlind: false,
};

function makeLayer(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext('2d', { alpha: true })!;
  return { canvas, ctx };
}

/** Bottom and top colours of each extruded wall style. */
function wallColors(style: WallStyle, pal: TablePalette): [string, string] {
  switch (style) {
    case 'metal': return ['#141a30', '#a9bbe8'];
    case 'rubber': return ['#2b0f2c', '#ff7fae'];
    case 'sling': return ['#2b0f2c', '#ff9ec0'];
    case 'neon': return [withAlpha(pal.neon, 0.15), pal.neon];
    case 'wood': return ['#20160f', '#8a6a4a'];
    default: return [pal.rail, pal.railTop];
  }
}

/**
 * Layered Canvas 2D renderer.
 *
 * The playfield is baked once into an offscreen canvas and blitted; only balls,
 * keys and effects are redrawn. Emissive work goes to its own layer so the
 * bloom pass can be a couple of cheap downscales rather than a real blur.
 */
export class Renderer {
  readonly cam = new TableCamera();
  readonly particles = new Particles();
  quality: RenderQuality = { ...DEFAULT_QUALITY };

  private ctx: CanvasRenderingContext2D;
  private baked = makeLayer(1, 1);
  private emissive = makeLayer(1, 1);
  private bloomA = makeLayer(1, 1);
  private bloomB = makeLayer(1, 1);
  private dpr = 1;
  private cssW = 1;
  private cssH = 1;
  private bakedFor = '';
  /** Projected screen bounds of the table, for laying out the cabinet. */
  private bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  /** Rolling record of what the player has played, drawn as a piano roll. */
  private roll: { note: number; at: number; end: number; force: number }[] = [];
  private rollRange = { low: 48, high: 79 };
  /** Screen shake, decaying. */
  private shake = 0;
  private shakeX = 0;
  private shakeY = 0;
  private t = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;

    const w = this.canvas.width, h = this.canvas.height;
    this.baked = makeLayer(w, h);
    this.emissive = makeLayer(w, h);
    this.bloomA = makeLayer(Math.ceil(w / 4), Math.ceil(h / 4));
    this.bloomB = makeLayer(Math.ceil(w / 10), Math.ceil(h / 10));
    this.cam.fit(cssW, cssH);
    this.bakedFor = '';
  }

  invalidate(): void { this.bakedFor = ''; }

  /** Record a played note for the piano roll in the cabinet margins. */
  logNote(note: number, force: number, low: number, high: number): void {
    this.rollRange.low = low;
    this.rollRange.high = high;
    this.roll.push({ note, at: this.t, end: -1, force });
    if (this.roll.length > 320) this.roll.shift();
  }

  endNote(note: number): void {
    for (let i = this.roll.length - 1; i >= 0; i--) {
      if (this.roll[i].note === note && this.roll[i].end < 0) { this.roll[i].end = this.t; return; }
    }
  }

  /** Hue for a pitch, honouring the colour-blind palette setting. */
  private hue(note: number): number {
    return this.quality.colorBlind ? pitchHueSafe(note) : pitchHue(note);
  }

  kick(amount: number): void {
    if (this.quality.reducedMotion) return;
    this.shake = Math.min(26, this.shake + amount);
  }

  // ------------------------------------------------------------- baking ---

  /** Redraw the static playfield. Runs on load and on resize only. */
  private bake(game: Game): void {
    const key = `${game.def.id}|${this.cssW}x${this.cssH}|${this.dpr}|${this.quality.colorBlind}`;
    if (this.bakedFor === key) return;
    this.bakedFor = key;

    const ctx = this.baked.ctx;
    const pal = game.def.palette;
    const H = game.def.height;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);

    this.measureBounds(game);
    this.bakeCabinet(ctx, game);

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
      const [lo, hi] = wallColors(wall.style, pal);
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

  /** Screen-space extent of the playfield, used to place the cabinet. */
  private measureBounds(game: Game): void {
    const p = { x: 0, y: 0 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pt of game.def.outline) {
      for (const z of [0, 50]) {
        this.cam.project(pt.x, pt.y, z, p);
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      }
    }
    this.bounds = { minX, maxX, minY, maxY };
  }

  /**
   * The cabinet the table sits in.
   *
   * A portrait playfield on a landscape display leaves a third of the frame
   * empty; filling it with the machine itself is both truer to the subject and
   * a place to put the piano roll.
   */
  private bakeCabinet(ctx: CanvasRenderingContext2D, game: Game): void {
    const pal = game.def.palette;
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
    for (const d of game.table.decals) {
      ctx.globalAlpha = d.alpha ?? 1;
      const scale = this.cam.scaleAt(d.x, d.y);
      switch (d.kind) {
        case 'glow': {
          this.cam.project(d.x, d.y, 0, p);
          const r = (d.r ?? 100) * scale;
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          g.addColorStop(0, d.color);
          g.addColorStop(1, withAlpha(d.color, 0));
          ctx.fillStyle = g;
          ctx.fillRect(p.x - r, p.y - r * 0.8, r * 2, r * 1.6);
          break;
        }
        case 'arcband': {
          tracePath(ctx, this.cam, circlePoints(d.x, d.y, d.r ?? 100, 72), 0, true);
          ctx.strokeStyle = d.color;
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
          fillPoly(ctx, this.cam, pts, 0, d.color);
          break;
        }
        case 'line': {
          const hw = (d.w ?? 40) / 2;
          tracePath(ctx, this.cam, [{ x: d.x - hw, y: d.y }, { x: d.x + hw, y: d.y }], 0);
          ctx.strokeStyle = d.color;
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

  render(game: Game, alpha: number, dt: number): void {
    this.t += dt;
    this.bake(game);
    this.particles.update(dt);

    const ctx = this.ctx;
    const pal = game.def.palette;

    this.shake *= Math.max(0, 1 - 9 * dt);
    if (this.shake < 0.05) this.shake = 0;
    this.shakeX = (Math.random() - 0.5) * this.shake;
    this.shakeY = (Math.random() - 0.5) * this.shake;

    const tx = this.shakeX * this.dpr, ty = this.shakeY * this.dpr;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, tx, ty);
    ctx.fillStyle = pal.void;
    ctx.fillRect(-40, -40, this.cssW + 80, this.cssH + 80);
    ctx.drawImage(this.baked.canvas, 0, 0, this.cssW, this.cssH);

    const em = this.emissive.ctx;
    em.setTransform(this.dpr, 0, 0, this.dpr, tx, ty);
    em.clearRect(-40, -40, this.cssW + 80, this.cssH + 80);

    const sorted = [...game.table.elements].sort((a, b) => b.y - a.y);
    for (const el of sorted) this.drawElement(ctx, em, game, el);

    this.drawKeybed(ctx, em, game);
    this.drawBalls(ctx, em, game, alpha);
    this.particles.draw(em, this.cam);

    this.composite(ctx);
    this.drawPianoRoll(ctx, game);
    this.drawPops(ctx, game);
    this.drawGlass(ctx, game);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Additive bloom: two progressively smaller downscales, layered back on. */
  private composite(ctx: CanvasRenderingContext2D): void {
    const em = this.emissive.canvas;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, this.shakeX * this.dpr, this.shakeY * this.dpr);
    ctx.globalCompositeOperation = 'lighter';

    if (this.quality.bloom) {
      const a = this.bloomA, b = this.bloomB;
      a.ctx.setTransform(1, 0, 0, 1, 0, 0);
      a.ctx.clearRect(0, 0, a.canvas.width, a.canvas.height);
      a.ctx.imageSmoothingEnabled = true;
      a.ctx.drawImage(em, 0, 0, a.canvas.width, a.canvas.height);

      b.ctx.setTransform(1, 0, 0, 1, 0, 0);
      b.ctx.clearRect(0, 0, b.canvas.width, b.canvas.height);
      b.ctx.imageSmoothingEnabled = true;
      b.ctx.drawImage(a.canvas, 0, 0, b.canvas.width, b.canvas.height);

      ctx.globalAlpha = 0.62;
      ctx.drawImage(a.canvas, 0, 0, em.width, em.height);
      ctx.globalAlpha = 0.5;
      ctx.drawImage(b.canvas, 0, 0, em.width, em.height);
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(em, 0, 0);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Sheen and vignette: the pane of glass the whole thing lives under. */
  private drawGlass(ctx: CanvasRenderingContext2D, game: Game): void {
    const w = this.cssW, h = this.cssH;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sheen = ctx.createLinearGradient(0, h * 0.1, w * 0.75, h);
    sheen.addColorStop(0, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.42, 'rgba(190,215,255,0.035)');
    sheen.addColorStop(0.52, 'rgba(190,215,255,0.055)');
    sheen.addColorStop(0.62, 'rgba(190,215,255,0.02)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    const vig = ctx.createRadialGradient(w / 2, h * 0.52, Math.min(w, h) * 0.32, w / 2, h * 0.52, Math.max(w, h) * 0.78);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, withAlpha(game.def.palette.void, 0.82));
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  // ----------------------------------------------------------- elements ---

  private fillDisc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, z: number, style: string | CanvasGradient): void {
    fillPoly(ctx, this.cam, circlePoints(x, y, r, 34), z, style);
  }

  /** Stack of projected discs: reads as a solid extruded cylinder. */
  private column(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, z0: number, z1: number, lo: string, hi: string, steps = 9): void {
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.fillDisc(ctx, x, y, r, z0 + (z1 - z0) * t, mix(lo, hi, t));
    }
  }

  private groundShadow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, z: number, strength = 1): void {
    if (!this.quality.shadows) return;
    const p = { x: 0, y: 0 };
    const sx = x + LIGHT.x * z * 0.8, sy = y - LIGHT.y * z * 0.5;
    this.cam.project(sx, sy, 0, p);
    const scale = this.cam.scaleAt(sx, sy);
    const size = r * 2.9 * scale;
    ctx.globalAlpha = 0.55 * strength;
    ctx.drawImage(shadowSprite(), p.x - size / 2, p.y - size * 0.34, size, size * 0.68);
    ctx.globalAlpha = 1;
  }

  private halo(em: CanvasRenderingContext2D, x: number, y: number, z: number, hue: number, radius: number, strength: number): void {
    if (strength <= 0.001) return;
    const p = { x: 0, y: 0 };
    this.cam.project(x, y, z, p);
    const scale = this.cam.scaleAt(x, y, z);
    const size = radius * 2 * scale;
    em.globalCompositeOperation = 'lighter';
    em.globalAlpha = clamp01(strength);
    em.drawImage(glowSprite(hue, 96), p.x - size / 2, p.y - size / 2, size, size);
    em.globalAlpha = 1;
    em.globalCompositeOperation = 'source-over';
  }

  private drawElement(ctx: CanvasRenderingContext2D, em: CanvasRenderingContext2D, game: Game, el: Game['table']['elements'][number]): void {
    const pal = game.def.palette;
    const energised = el.energisedUntil > game.time;
    const hue = el.note !== null ? this.hue(el.note) : 205;
    const flash = el.flash;

    switch (el.kind) {
      case 'post': {
        this.groundShadow(ctx, el.x, el.y, el.r, el.z);
        this.column(ctx, el.x, el.y, el.r, 0, el.z * 0.7, '#1a1030', '#3b2a58');
        this.column(ctx, el.x, el.y, el.r * 1.12, el.z * 0.7, el.z, '#61245a', '#ff86b4');
        this.fillDisc(ctx, el.x, el.y, el.r * 0.62, el.z + 1, '#ffd0e4');
        if (flash > 0) this.halo(em, el.x, el.y, el.z, 330, el.r * 3, flash * 0.7);
        break;
      }

      case 'bumper': {
        const pulse = energised ? 0.55 + Math.sin(this.t * 12) * 0.2 : 0;
        const squash = 1 - flash * 0.22;
        this.groundShadow(ctx, el.x, el.y, el.r, el.z);
        // Painted skirt ring on the playfield.
        this.fillDisc(ctx, el.x, el.y, el.r * 1.5, 0.5, withAlpha(pal.neon, 0.10 + pulse * 0.25));
        this.fillDisc(ctx, el.x, el.y, el.r * 1.22, 1, withAlpha(pal.void, 0.55));
        this.column(ctx, el.x, el.y, el.r, 0, el.z * squash, '#171c38', mix('#39406e', pitchColor(el.note ?? 60, 70, 46), 0.55));

        const p = { x: 0, y: 0 };
        this.cam.project(el.x, el.y, el.z * squash, p);
        const scale = this.cam.scaleAt(el.x, el.y, el.z);
        const rr = el.r * scale;
        const cap = ctx.createRadialGradient(p.x - rr * 0.35, p.y - rr * 0.45, rr * 0.1, p.x, p.y, rr * 1.15);
        const capHue = hue;
        cap.addColorStop(0, `hsl(${capHue} 100% ${88 - flash * 6}%)`);
        cap.addColorStop(0.45, `hsl(${capHue} 88% ${62 + pulse * 14}%)`);
        cap.addColorStop(1, `hsl(${capHue} 70% ${26}%)`);
        this.fillDisc(ctx, el.x, el.y, el.r, el.z * squash, cap);
        this.fillDisc(ctx, el.x, el.y, el.r * 0.38, el.z * squash + 2, `hsl(${capHue} 100% 96% / ${0.5 + pulse * 0.5})`);

        this.halo(em, el.x, el.y, el.z, capHue, el.r * 2.6, flash * 0.9 + pulse * 0.5);
        if (this.quality.labels && el.note !== null) this.label(ctx, el.x, el.y, el.z + 14, noteName(el.note), pal.ink, 0.55);
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
          (t) => mix('#2b0f2c', flash > 0 ? '#ffd9e8' : '#ff7fae', t * 0.9 + 0.1), false, 7);
        this.halo(em, el.x, el.y, el.z, 335, 70, flash * 1.1 + (energised ? 0.35 : 0));
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
        this.groundShadow(ctx, el.x, el.y, el.r * 0.6, el.z, 0.7);
        extrudeStroke(ctx, this.cam, pts, 0, el.z, 11 * scale,
          (t) => mix('#101534', `hsl(${hue} 82% ${52 + flash * 30}%)`, t * 0.95 + 0.05), false, 7);
        tracePath(ctx, this.cam, pts, el.z);
        ctx.strokeStyle = `hsl(${hue} 100% ${78 + flash * 20}%)`;
        ctx.lineWidth = 3.5 * scale;
        ctx.stroke();
        this.halo(em, el.x, el.y, el.z, hue, 54, flash + (energised ? 0.4 : 0));
        if (this.quality.labels && el.note !== null) this.label(ctx, el.x, el.y, el.z + 12, noteName(el.note), pal.ink, 0.6);
        break;
      }

      case 'rollover': {
        const lit = el.down;
        this.fillDisc(ctx, el.x, el.y, el.r * 1.18, 0.4, withAlpha(pal.railTop, 0.3));
        this.fillDisc(ctx, el.x, el.y, el.r, 0.8, withAlpha(pal.void, 0.75));
        this.fillDisc(ctx, el.x, el.y, el.r * 0.84, 1.2,
          lit ? `hsl(${hue} 96% 66%)` : `hsl(${hue} 55% 34%)`);
        this.fillDisc(ctx, el.x, el.y, el.r * 0.46, 1.6,
          lit ? `hsl(${hue} 100% 88%)` : `hsl(${hue} 45% 44%)`);
        this.halo(em, el.x, el.y, 2, hue, el.r * 2.6, (lit ? 0.55 : 0.12) + flash);
        break;
      }

      case 'spinner': {
        const scale = this.cam.scaleAt(el.x, el.y);
        const open = Math.abs(Math.cos(el.spin));
        // Posts either side of the blade.
        for (const end of [el.a, el.b]) this.column(ctx, end.x, end.y, 7, 0, el.z, '#161b33', '#93a6dc', 6);
        // The blade foreshortens as it spins, which is what reads as rotation.
        const z0 = el.z * (0.52 - open * 0.42), z1 = el.z * (0.52 + open * 0.46);
        for (let i = 0; i <= 6; i++) {
          const t = i / 6;
          tracePath(ctx, this.cam, [el.a, el.b], z0 + (z1 - z0) * t);
          ctx.strokeStyle = mix('#1d2444', `hsl(${hue} 85% ${58 + flash * 32}%)`, t * 0.9 + 0.1);
          ctx.lineWidth = Math.max(1, 7 * scale);
          ctx.lineCap = 'butt';
          ctx.stroke();
        }
        tracePath(ctx, this.cam, [el.a, el.b], z1);
        ctx.strokeStyle = `hsl(${hue} 100% ${80}%)`;
        ctx.lineWidth = Math.max(1, 2.2 * scale);
        ctx.stroke();
        this.halo(em, el.x, el.y, el.z * 0.5, hue, 60, flash * 0.8 + Math.min(0.5, Math.abs(el.spinRate) * 0.03));
        break;
      }

      default:
        break;
    }
  }

  private label(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, text: string, color: string, alpha: number): void {
    const p = { x: 0, y: 0 };
    this.cam.project(x, y, z, p);
    const scale = this.cam.scaleAt(x, y, z);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.font = `700 ${Math.max(10, 21 * scale)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = 6;
    ctx.fillText(text, p.x, p.y);
    ctx.restore();
  }

  // ------------------------------------------------------------- keybed ---

  private drawKeybed(ctx: CanvasRenderingContext2D, em: CanvasRenderingContext2D, game: Game): void {
    const pal = game.def.palette;
    const keys = game.keybed.keys;
    // Whites first, then blacks: the blacks stand in front and above them.
    for (const pass of [false, true]) {
      for (const k of keys) {
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
        const glow = clamp01(1 - (game.keybed.time - k.litAt) * 2.6);
        const zTop = g.z - (k.pos / 24) * 5;
        const hue = this.hue(g.note);

        // Side walls, then the face.
        const lo = g.black ? '#05060f' : '#171d33';
        const hi = g.black
          ? mix('#1b2038', `hsl(${hue} 70% 30%)`, 0.35 + glow * 0.5)
          : mix('#cfd8f0', `hsl(${hue} 85% 74%)`, glow * 0.75 + held * 0.12);
        for (let i = 0; i <= 6; i++) {
          const t = i / 6;
          fillPoly(ctx, this.cam, quad, zTop * t, mix(lo, hi, t * t * 0.7 + 0.15));
        }

        const p0 = { x: 0, y: 0 }, p1 = { x: 0, y: 0 };
        this.cam.project(quad[0].x, quad[0].y, zTop, p0);
        this.cam.project(quad[2].x, quad[2].y, zTop, p1);
        const face = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
        if (g.black) {
          face.addColorStop(0, mix('#2a3150', `hsl(${hue} 80% 46%)`, glow * 0.85));
          face.addColorStop(1, '#0b0e1c');
        } else {
          face.addColorStop(0, mix('#f2f5ff', `hsl(${hue} 95% 82%)`, glow * 0.9));
          face.addColorStop(1, mix('#9aa6cb', `hsl(${hue} 60% 58%)`, glow * 0.5));
        }
        fillPoly(ctx, this.cam, quad, zTop, face);

        // Lit front lip: the edge the ball actually strikes.
        tracePath(ctx, this.cam, [quad[0], quad[1]], zTop);
        ctx.strokeStyle = g.black
          ? `hsl(${hue} ${40 + glow * 55}% ${28 + glow * 52}%)`
          : `hsl(${hue} ${34 + glow * 62}% ${64 + glow * 30}%)`;
        ctx.lineWidth = Math.max(1, 3 * this.cam.scaleAt(g.cx, g.cy));
        ctx.lineCap = 'round';
        ctx.stroke();

        if (glow > 0.02) this.halo(em, g.cx, fy, zTop, hue, hw * 3.4, glow * (0.5 + k.velocity * 0.7));

        if (this.quality.labels && !g.black && g.note % 12 === 0) {
          this.label(ctx, g.drawCx - g.nx * g.depth * 0.62, g.drawCy - g.ny * g.depth * 0.62, zTop + 1,
            `C${Math.floor(g.note / 12) - 1}`, pal.void, 0.5);
        }
      }
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
          em.strokeStyle = `rgba(148, 198, 255, ${strength * f * f * 0.55})`;
          em.lineWidth = Math.max(0.5, r * 0.95 * f);
          em.stroke();
        }
        em.globalCompositeOperation = 'source-over';
      }

      this.groundShadow(ctx, x, y, ball.r, ball.r, 1);
      this.cam.project(x, y, ball.r, p);

      // Chrome: dark limb, bright lit side, a hard specular and a rim kick.
      const lx = p.x - r * 0.42, ly = p.y - r * 0.5;
      const body = ctx.createRadialGradient(lx, ly, r * 0.06, p.x, p.y, r * 1.08);
      body.addColorStop(0, '#ffffff');
      body.addColorStop(0.2, '#e8efff');
      body.addColorStop(0.46, '#93a4c9');
      body.addColorStop(0.72, '#2d3450');
      body.addColorStop(0.93, '#0d1122');
      body.addColorStop(1, '#05070f');
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r, 0, 0, TAU);
      ctx.fillStyle = body;
      ctx.fill();
      // Contact occlusion: a dark ring that seats the ball on the playfield.
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r * 1.02, r * 1.02, 0, 0, TAU);
      ctx.strokeStyle = '#04060e';
      ctx.lineWidth = Math.max(1, r * 0.14);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Equator band rotates with the ball so spin is readable.
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r, 0, 0, TAU);
      ctx.clip();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#0b1020';
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
      ctx.strokeStyle = '#9fd0ff';
      ctx.lineWidth = Math.max(1, r * 0.1);
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (ball.safeFor > 0) {
        // A ring, not a blob: the save indicator must never hide the ball.
        ctx.globalAlpha = 0.5 + Math.sin(this.t * 8) * 0.22;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r * 1.55, r * 1.28, 0, 0, TAU);
        ctx.strokeStyle = '#63ffc4';
        ctx.lineWidth = Math.max(1, r * 0.12);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    for (const id of [...this.trails.keys()]) if (!live.has(id)) this.trails.delete(id);
  }

  /**
   * A piano roll of the player's own playing, scrolling up the cabinet sides.
   * The run is a performance; this is the score of it, written as you play.
   */
  private drawPianoRoll(ctx: CanvasRenderingContext2D, game: Game): void {
    const WINDOW = 7.5;
    const left = this.bounds.minX;
    const right = this.cssW - this.bounds.maxX;
    const pad = 14;
    if (Math.min(left, right) < 78) return;

    // Drop anything that has scrolled off the top.
    while (this.roll.length && this.t - this.roll[0].at > WINDOW + 1) this.roll.shift();

    const { low, high } = this.rollRange;
    const span = Math.max(1, high - low);
    const h = this.cssH;

    for (const side of [0, 1]) {
      const w = (side === 0 ? left : right) - pad * 2;
      if (w < 50) continue;
      const x0 = side === 0 ? pad : this.cssW - right + pad;

      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, 0, w, h);
      ctx.clip();

      // Octave guides, fading upward so they read as a time grid rather than
      // a seam in the cabinet.
      const guide = ctx.createLinearGradient(0, h, 0, 0);
      guide.addColorStop(0, withAlpha(game.def.palette.railTop, 0.3));
      guide.addColorStop(0.45, withAlpha(game.def.palette.railTop, 0.09));
      guide.addColorStop(1, withAlpha(game.def.palette.railTop, 0));
      ctx.strokeStyle = guide;
      ctx.lineWidth = 1;
      ctx.font = '600 9px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = withAlpha(game.def.palette.railTop, 0.5);
      for (let n = Math.ceil(low / 12) * 12; n <= high; n += 12) {
        const t = (n - low) / span;
        const x = side === 0 ? x0 + (1 - t) * w : x0 + t * w;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h - 14);
        ctx.stroke();
        ctx.fillText(`C${Math.floor(n / 12) - 1}`, x, h - 4);
      }

      ctx.globalCompositeOperation = 'lighter';
      for (const ev of this.roll) {
        const end = ev.end < 0 ? this.t : ev.end;
        const age = this.t - end;
        if (age > WINDOW) continue;
        const t = (ev.note - low) / span;
        // Low notes sit against the outer edge, so both sides read outward-in.
        const x = side === 0 ? x0 + (1 - t) * w : x0 + t * w;
        const yEnd = h - (age / WINDOW) * h;
        const yStart = h - ((this.t - ev.at) / WINDOW) * h;
        const barW = 5 + ev.force * 11;
        const fade = 1 - age / WINDOW;
        ctx.globalAlpha = Math.max(0, fade * fade) * (0.5 + ev.force * 0.5);
        ctx.fillStyle = `hsl(${this.hue(ev.note)} 92% 64%)`;
        const top = Math.min(yStart, yEnd);
        const height = Math.max(3, Math.abs(yEnd - yStart));
        ctx.beginPath();
        ctx.roundRect(x - barW / 2, top, barW, height, barW / 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.restore();
    }
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
      ctx.fillStyle = `hsl(${pop.tone * 360} 92% 78%)`;
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
