import type { TableCamera } from './project';
import { glowSprite } from './sprites';

export type ParticleKind = 'spark' | 'ember' | 'ring' | 'shard' | 'note';

interface Particle {
  active: boolean;
  kind: ParticleKind;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  size: number;
  hue: number;
  spin: number;
  angle: number;
}

const GRAVITY = -1400;

/**
 * Pooled particle system. Everything is drawn additively from the pre-baked
 * sprite atlas, and particles live in table space so they inherit the rake.
 */
export class Particles {
  private pool: Particle[] = [];
  private cursor = 0;
  budget: number;

  constructor(budget = 1400) {
    this.budget = budget;
    for (let i = 0; i < budget; i++) {
      this.pool.push({
        active: false, kind: 'spark', x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 8, hue: 200, spin: 0, angle: 0,
      });
    }
  }

  get liveCount(): number {
    let n = 0;
    for (const p of this.pool) if (p.active) n++;
    return n;
  }

  private take(): Particle {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % this.pool.length;
      if (!p.active) return p;
    }
    // Everything is busy: steal the one we landed on rather than dropping the effect.
    return this.pool[this.cursor];
  }

  spawn(kind: ParticleKind, x: number, y: number, z: number, opts: Partial<Particle> = {}): void {
    const p = this.take();
    p.active = true;
    p.kind = kind;
    p.x = x; p.y = y; p.z = z;
    p.vx = opts.vx ?? 0; p.vy = opts.vy ?? 0; p.vz = opts.vz ?? 0;
    p.maxLife = opts.maxLife ?? 0.5;
    p.life = p.maxLife;
    p.size = opts.size ?? 14;
    p.hue = opts.hue ?? 200;
    p.spin = opts.spin ?? 0;
    p.angle = opts.angle ?? 0;
  }

  /** Impact burst: a cone of sparks away from the surface. */
  burst(x: number, y: number, nx: number, ny: number, energy: number, hue: number, count = 10): void {
    const n = Math.min(count, Math.round(3 + energy * 0.012));
    const base = Math.atan2(ny, nx);
    for (let i = 0; i < n; i++) {
      const a = base + (Math.random() - 0.5) * 1.7;
      const sp = 90 + Math.random() * energy * 0.34;
      this.spawn('spark', x, y, 6 + Math.random() * 10, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 120 + Math.random() * 300,
        maxLife: 0.24 + Math.random() * 0.34,
        size: 10 + Math.random() * 12,
        hue: hue + (Math.random() - 0.5) * 26,
      });
    }
  }

  /**
   * Shatter: a fan of spinning fragments. A missed note in PlayTune breaks
   * this way, which is why it reads as a loss rather than just an absence.
   */
  shatter(x: number, y: number, z: number, hue: number, count = 10, spread = 260): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const sp = spread * (0.4 + Math.random() * 0.8);
      this.spawn('shard', x, y, z, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: 90 + Math.random() * 220,
        maxLife: 0.5 + Math.random() * 0.45,
        size: 9 + Math.random() * 13,
        hue,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 14,
      });
    }
  }

  /** Expanding ring, used for note hits and energised elements. */
  ring(x: number, y: number, z: number, hue: number, size = 40, life = 0.42): void {
    this.spawn('ring', x, y, z, { maxLife: life, size, hue });
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      if (p.kind === 'ring') continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vz += GRAVITY * dt;
      p.vx *= 1 - 1.6 * dt;
      p.vy *= 1 - 1.6 * dt;
      p.angle += p.spin * dt;
      if (p.z < 0) { p.z = 0; p.vz *= -0.34; p.vx *= 0.6; p.vy *= 0.6; }
    }
  }

  /** Draws into the emissive layer, which is additively composited later. */
  draw(ctx: CanvasRenderingContext2D, cam: TableCamera): void {
    const pt = { x: 0, y: 0 };
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.pool) {
      if (!p.active) continue;
      const t = p.life / p.maxLife;
      cam.project(p.x, p.y, p.z, pt);
      const scale = cam.scaleAt(p.x, p.y, p.z);

      if (p.kind === 'shard') {
        // Drawn as an outline rather than a glow: a fragment should read as a
        // hard edge, which is what makes it the opposite of a bloom.
        const r = p.size * scale * (0.4 + t * 0.8);
        ctx.globalAlpha = t * t * 0.9;
        ctx.strokeStyle = `hsl(${p.hue} 40% ${45 + t * 30}%)`;
        ctx.lineWidth = Math.max(1, 1.6 * scale);
        ctx.beginPath();
        for (let v = 0; v < 3; v++) {
          const a = p.angle + (v / 3) * Math.PI * 2;
          const px = pt.x + Math.cos(a) * r, py = pt.y + Math.sin(a) * r * 0.66;
          if (v === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        continue;
      }

      if (p.kind === 'note') {
        // A soft bar, for anything that should read as a sounding note rather
        // than as a spark.
        const w = p.size * scale * 0.5;
        const h = p.size * scale * (0.4 + t * 1.6);
        ctx.globalAlpha = t * t * 0.8;
        ctx.fillStyle = `hsl(${p.hue} 92% 68%)`;
        ctx.beginPath();
        ctx.roundRect(pt.x - w / 2, pt.y - h / 2, w, h, w / 2);
        ctx.fill();
        continue;
      }

      if (p.kind === 'ring') {
        const r = p.size * (1.9 - t * 1.5) * scale;
        ctx.globalAlpha = t * t * 0.85;
        ctx.strokeStyle = `hsl(${p.hue} 95% 72%)`;
        ctx.lineWidth = Math.max(1, 3.5 * t * scale);
        ctx.beginPath();
        ctx.ellipse(pt.x, pt.y, r, r * 0.62, 0, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }

      const size = p.size * scale * (0.5 + t * 0.9);
      const sprite = glowSprite(p.hue, 48);
      ctx.globalAlpha = Math.min(1, t * 1.4);
      ctx.drawImage(sprite, pt.x - size / 2, pt.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  clear(): void { for (const p of this.pool) p.active = false; }
}
