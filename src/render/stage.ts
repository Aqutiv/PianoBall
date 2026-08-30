import { TableCamera } from './project';
import { Particles } from './particles';
import { circlePoints, fillPoly, tracePath } from './geom';
import { mix, withAlpha, pitchHue, pitchHueSafe, tone, LIGHT } from './palette';
import { shadowSprite, glowSprite } from './sprites';
import { DEFAULT_THEME, type TablePalette, type Theme } from './theme';
import { clamp01 } from '../core/math';
import { load, save } from '../core/storage';

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

/**
 * The quality the player asked for, honouring the OS motion preference.
 *
 * Kept separate from what is actually running: the adaptive pass sheds effects
 * under load and has to know what to restore *to*, which is the preference and
 * not the hardcoded defaults.
 */
function defaultQuality(): RenderQuality {
  return {
    ...DEFAULT_QUALITY,
    reducedMotion: typeof window !== 'undefined'
      && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
  };
}

export interface Layer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

function makeLayer(w: number, h: number): Layer {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext('2d', { alpha: true })!;
  return { canvas, ctx };
}

/**
 * Everything a mode needs to draw with, and nothing about what it draws.
 *
 * The layered canvas, the raked camera, the particle pool, the bloom pass and
 * the screen shake are the same in all three modes; only the contents of the
 * frame differ. Keeping them here is what lets Freestyle and PlayTune look like
 * the same machine as the pinball table without a second renderer.
 */
export class Stage {
  readonly cam = new TableCamera();
  readonly particles = new Particles();
  readonly ctx: CanvasRenderingContext2D;
  /** What is being drawn right now, after any adaptive shedding. */
  quality: RenderQuality;
  /** The look in force. The single source of every colour on the canvas. */
  theme: Theme = DEFAULT_THEME;

  /** Shorthand for the theme's colours, which is all most drawing wants. */
  get palette(): TablePalette { return this.theme.palette; }

  /** The static layer. A mode bakes into this and it is blitted every frame. */
  baked: Layer = makeLayer(1, 1);
  /** Additive layer. Everything drawn here goes through the bloom pass. */
  emissive: Layer = makeLayer(1, 1);

  dpr = 1;
  cssW = 1;
  cssH = 1;
  /** Frame clock in seconds. Effects that need a phase read this. */
  t = 0;
  /** Projected screen bounds of the table, for laying out the margins. */
  bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

  private bloomA: Layer = makeLayer(1, 1);
  private bloomB: Layer = makeLayer(1, 1);
  private bakedFor = '';
  /** What the player asked for, which the adaptive pass restores towards. */
  private qualityPreference: RenderQuality;
  private shake = 0;
  private shakeX = 0;
  private shakeY = 0;
  /** Rolling record of what the player has played, drawn as a piano roll. */
  private roll: { note: number; at: number; end: number; force: number }[] = [];
  private rollRange = { low: 48, high: 79 };

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.qualityPreference = { ...defaultQuality(), ...load<Partial<RenderQuality>>('quality', {}) };
    this.quality = { ...this.qualityPreference };
    this.particles.budget = this.quality.particles;
    this.publishMotionPreference();
  }

  /**
   * Mirror the motion preference onto the document, so the DOM chrome obeys it
   * too.
   *
   * `prefers-reduced-motion` covers the player who set it at the OS level, but
   * the in-app toggle used to reach only the canvas shake — a player who
   * turned it on here still got every panel animation. Optional chaining
   * because the headless tests stub a document with no root element.
   */
  private publishMotionPreference(): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement as HTMLElement | undefined;
    if (!root?.dataset) return;
    if (this.quality.reducedMotion) root.dataset.reducedMotion = 'true';
    else delete root.dataset.reducedMotion;
  }

  get preferredQuality(): Readonly<RenderQuality> { return this.qualityPreference; }

  /** Change what the player asked for, and remember it. */
  setQuality(patch: Partial<RenderQuality>): void {
    this.qualityPreference = { ...this.qualityPreference, ...patch };
    this.quality = { ...this.quality, ...patch };
    if (patch.particles !== undefined) this.particles.budget = patch.particles;
    if (patch.colorBlind !== undefined || patch.labels !== undefined) this.invalidate();
    if (patch.reducedMotion !== undefined) this.publishMotionPreference();
    save('quality', this.qualityPreference);
  }

  resetSettings(): void {
    this.qualityPreference = defaultQuality();
    this.quality = { ...this.qualityPreference };
    this.particles.budget = this.quality.particles;
    this.publishMotionPreference();
    this.invalidate();
    save('quality', this.qualityPreference);
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

  /**
   * True when the static layer has to be redrawn, and claims the key if so.
   * The viewport, DPR and colour-blind setting are folded in, because all three
   * change what was painted into it.
   */
  needsBake(key: string): boolean {
    const full = `${key}|${this.cssW}x${this.cssH}|${this.dpr}|${this.quality.colorBlind}|${this.theme.id}`;
    if (this.bakedFor === full) return false;
    this.bakedFor = full;
    return true;
  }

  kick(amount: number): void {
    if (this.quality.reducedMotion) return;
    this.shake = Math.min(26, this.shake + amount);
  }

  /** Hue for a pitch, honouring the colour-blind palette setting. */
  hue(note: number): number {
    return this.quality.colorBlind ? pitchHueSafe(note) : pitchHue(note);
  }

  /** Drop every transient. Called when switching modes. */
  reset(): void {
    this.particles.clear();
    this.roll.length = 0;
    this.shake = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.invalidate();
  }

  // -------------------------------------------------------------- frame ---

  /**
   * Advance the clock, blit the static layer and clear the emissive one.
   * A mode calls this, draws, then calls `composite()` and `endFrame()`.
   */
  beginFrame(dt: number): void {
    this.t += dt;
    this.particles.update(dt);

    this.shake *= Math.max(0, 1 - 9 * dt);
    if (this.shake < 0.05) this.shake = 0;
    this.shakeX = (Math.random() - 0.5) * this.shake;
    this.shakeY = (Math.random() - 0.5) * this.shake;

    const ctx = this.ctx;
    const tx = this.shakeX * this.dpr, ty = this.shakeY * this.dpr;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, tx, ty);
    ctx.fillStyle = this.palette.void;
    ctx.fillRect(-40, -40, this.cssW + 80, this.cssH + 80);
    ctx.drawImage(this.baked.canvas, 0, 0, this.cssW, this.cssH);

    const em = this.emissive.ctx;
    em.setTransform(this.dpr, 0, 0, this.dpr, tx, ty);
    em.clearRect(-40, -40, this.cssW + 80, this.cssH + 80);
  }

  /** Additive bloom: two progressively smaller downscales, layered back on. */
  composite(): void {
    const ctx = this.ctx;
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

      ctx.globalAlpha = this.theme.bloom.alphaA;
      ctx.drawImage(a.canvas, 0, 0, em.width, em.height);
      ctx.globalAlpha = this.theme.bloom.alphaB;
      ctx.drawImage(b.canvas, 0, 0, em.width, em.height);
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(em, 0, 0);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }

  endFrame(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // --------------------------------------------------------- primitives ---

  /** Screen-space extent of a table outline, used to place the margins. */
  measureBounds(outline: readonly { x: number; y: number }[], maxZ = 50): void {
    const p = { x: 0, y: 0 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pt of outline) {
      for (const z of [0, maxZ]) {
        this.cam.project(pt.x, pt.y, z, p);
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      }
    }
    this.bounds = { minX, maxX, minY, maxY };
  }

  fillDisc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, z: number, style: string | CanvasGradient): void {
    fillPoly(ctx, this.cam, circlePoints(x, y, r, 34), z, style);
  }

  /** Stack of projected discs: reads as a solid extruded cylinder. */
  column(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, z0: number, z1: number, lo: string, hi: string, steps = 9): void {
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.fillDisc(ctx, x, y, r, z0 + (z1 - z0) * t, mix(lo, hi, t));
    }
  }

  /**
   * A hard stroke around a projected disc.
   *
   * A no-op for every theme but Toybox, which is the point: the call sites read
   * as "outline this if the look wants outlines" rather than each having to ask
   * whether it does.
   */
  outlineDisc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, z: number): void {
    const o = this.theme.outline;
    if (!o) return;
    tracePath(ctx, this.cam, circlePoints(x, y, r, 34), z, true);
    ctx.strokeStyle = o.color;
    ctx.lineWidth = Math.max(1, o.width * this.cam.scaleAt(x, y, z));
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  groundShadow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, z: number, strength = 1): void {
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

  halo(em: CanvasRenderingContext2D, x: number, y: number, z: number, hue: number, radius: number, strength: number): void {
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

  label(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, text: string, color: string, alpha: number): void {
    const p = { x: 0, y: 0 };
    this.cam.project(x, y, z, p);
    const scale = this.cam.scaleAt(x, y, z);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.font = `700 ${Math.max(10, 21 * scale)}px ${this.theme.fonts.display}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = 6;
    ctx.fillText(text, p.x, p.y);
    ctx.restore();
  }

  /** Sheen and vignette: the pane of glass the whole thing lives under. */
  drawGlass(): void {
    const ctx = this.ctx;
    const w = this.cssW, h = this.cssH;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const tint = this.theme.glass.sheen;
    const sheen = ctx.createLinearGradient(0, h * 0.1, w * 0.75, h);
    sheen.addColorStop(0, withAlpha(tint, 0));
    sheen.addColorStop(0.42, withAlpha(tint, 0.035));
    sheen.addColorStop(0.52, withAlpha(tint, 0.055));
    sheen.addColorStop(0.62, withAlpha(tint, 0.02));
    sheen.addColorStop(1, withAlpha(tint, 0));
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    const vig = ctx.createRadialGradient(w / 2, h * 0.52, Math.min(w, h) * 0.32, w / 2, h * 0.52, Math.max(w, h) * 0.78);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, withAlpha(this.palette.void, this.theme.glass.vignette));
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  // --------------------------------------------------------- piano roll ---

  /** Record a played note for the piano roll in the margins. */
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

  /**
   * A piano roll of the player's own playing, scrolling up the margins.
   * The run is a performance; this is the score of it, written as you play.
   */
  drawRoll(): void {
    const ctx = this.ctx;
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
    const pal = this.palette;

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
      guide.addColorStop(0, withAlpha(pal.railTop, 0.3));
      guide.addColorStop(0.45, withAlpha(pal.railTop, 0.09));
      guide.addColorStop(1, withAlpha(pal.railTop, 0));
      ctx.strokeStyle = guide;
      ctx.lineWidth = 1;
      ctx.font = `600 9px ${this.theme.fonts.mono}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = withAlpha(pal.railTop, 0.5);
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
        ctx.fillStyle = tone(this.hue(ev.note), 92, 64);
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
}
