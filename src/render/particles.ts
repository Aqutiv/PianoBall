import type { TableCamera } from './project';
import { glowSprite } from './sprites';
import { tone } from './palette';

export type ParticleKind = 'spark' | 'ember' | 'ring' | 'shard' | 'note';

interface Particle {
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

/** How many particles exist. `budget` rations these; the pool never resizes. */
const CAPACITY = 1400;

/** Slots looked at when the budget is full, to find one worth overwriting. */
const STEAL_SAMPLES = 4;

function clampBudget(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(CAPACITY, Math.floor(n))) : CAPACITY;
}

/**
 * Pooled particle system. Everything is drawn additively from the pre-baked
 * sprite atlas, and particles live in table space so they inherit the rake.
 *
 * The live ones are held in the prefix `pool[0..live)`, which is what makes a
 * frame cost what is on screen rather than what could be: stepping and drawing
 * used to walk all fourteen hundred slots whether two were alight or none.
 * Nothing outside the prefix is alive, so there is no `active` flag to keep in
 * step with it.
 */
export class Particles {
  private pool: Particle[] = [];
  /** Rotating start for the steal sample, so it does not favour one slot. */
  private cursor = 0;
  /** Everything in `pool[0..live)` is alive, and nothing outside it is. */
  private live = 0;
  private cap: number;

  constructor(budget = CAPACITY) {
    this.cap = clampBudget(budget);
    for (let i = 0; i < CAPACITY; i++) {
      this.pool.push({
        kind: 'spark', x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 8, hue: 200, spin: 0, angle: 0,
      });
    }
  }

  /**
   * How many particles may be alight at once.
   *
   * This was write-only for its whole life: five call sites set it and nothing
   * ever read it again, so the adaptive pass's drop to 500 under load shed
   * exactly nothing. It rations the live prefix now, and because the pool is
   * already allocated, changing it costs no memory either way.
   */
  get budget(): number { return this.cap; }
  set budget(n: number) { this.cap = clampBudget(n); }

  get liveCount(): number { return this.live; }

  /**
   * A slot to write a new particle into.
   *
   * Under budget that is simply the next free one. At budget something has to
   * give, and the least-missed particle is the one with the least life left —
   * but finding the true minimum means walking the whole live prefix on every
   * spawn, which is the cost this pool exists to avoid. Looking at a handful
   * and taking the weakest of those is O(1) and lands on a nearly-spent
   * particle almost every time.
   */
  private take(): Particle {
    if (this.live < this.cap) return this.pool[this.live++];
    let worst = this.cursor % this.live;
    for (let i = 1; i < STEAL_SAMPLES; i++) {
      const j = (this.cursor + i * 37) % this.live;
      if (this.pool[j].life < this.pool[worst].life) worst = j;
    }
    this.cursor = (this.cursor + 1) % this.live;
    return this.pool[worst];
  }

  /** Drop the live particle at `i` by swapping the last one down onto it. */
  private retire(i: number): void {
    const last = --this.live;
    if (i !== last) {
      const tmp = this.pool[i];
      this.pool[i] = this.pool[last];
      this.pool[last] = tmp;
    }
  }

  spawn(kind: ParticleKind, x: number, y: number, z: number, opts: Partial<Particle> = {}): void {
    // A budget of nothing is a real setting, and `take` has no slot to hand out.
    if (this.cap <= 0) return;
    const p = this.take();
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
    for (let i = 0; i < this.live;) {
      const p = this.pool[i];
      p.life -= dt;
      // `retire` swaps an untouched particle down into `i`, so hold the index.
      if (p.life <= 0) { this.retire(i); continue; }
      if (p.kind !== 'ring') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vz += GRAVITY * dt;
        p.vx *= 1 - 1.6 * dt;
        p.vy *= 1 - 1.6 * dt;
        p.angle += p.spin * dt;
        if (p.z < 0) { p.z = 0; p.vz *= -0.34; p.vx *= 0.6; p.vy *= 0.6; }
      }
      i++;
    }
    // A budget cut should show up now rather than waiting out the longest-lived
    // spark, which is the whole point of shedding under load.
    if (this.live > this.cap) this.live = this.cap;
  }

  /** Draws into the emissive layer, which is additively composited later. */
  draw(ctx: CanvasRenderingContext2D, cam: TableCamera): void {
    const pt = { x: 0, y: 0 };
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.live; i++) {
      const p = this.pool[i];
      const t = p.life / p.maxLife;
      cam.project(p.x, p.y, p.z, pt);
      const scale = cam.scaleAt(p.x, p.y, p.z);

      if (p.kind === 'shard') {
        // Drawn as an outline rather than a glow: a fragment should read as a
        // hard edge, which is what makes it the opposite of a bloom.
        const r = p.size * scale * (0.4 + t * 0.8);
        ctx.globalAlpha = t * t * 0.9;
        ctx.strokeStyle = tone(p.hue, 40, 45 + t * 30);
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
        ctx.fillStyle = tone(p.hue, 92, 68);
        ctx.beginPath();
        ctx.roundRect(pt.x - w / 2, pt.y - h / 2, w, h, w / 2);
        ctx.fill();
        continue;
      }

      if (p.kind === 'ring') {
        const r = p.size * (1.9 - t * 1.5) * scale;
        ctx.globalAlpha = t * t * 0.85;
        ctx.strokeStyle = tone(p.hue, 95, 72);
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

  clear(): void { this.live = 0; }
}
