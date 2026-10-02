import type { Stage } from '../../render/stage';
import { tracePath, fillPoly } from '../../render/geom';
import { tone } from '../../render/palette';
import { pitchClass } from '../../midi/notes';
import { clamp, clamp01, TAU, lerp } from '../../core/math';
import type { Vec2 } from '../../physics/vec2';

/** Points along one aurora band. */
const AURORA_POINTS = 16;

/** Two onsets on the same note closer than this count as a repeat. */
const REPEAT_WINDOW = 0.55;

interface Ribbon {
  note: number;
  hue: number;
  /** Half-width in table units, from how hard the key was struck. */
  width: number;
  x: number;
  /** Lower and upper ends, in pixels above the keyboard. The lower end pins while the key is held. */
  near: number;
  far: number;
  held: boolean;
  /** Seconds since release. Only a let-go ribbon fades. */
  age: number;
  /** How many times this note had just been repeated when it started. */
  repeat: number;
}

interface Column {
  note: number;
  hue: number;
  x: number;
  velocity: number;
  /** Rises to 1 while held, falls away after. */
  level: number;
  held: boolean;
}

/**
 * Abstract visuals for Freestyle.
 *
 * Drawn on the flat stage above the docked keyboard, through the stage's flat
 * camera: x is screen x, and y is height above the keyboard, so a ribbon leaves
 * the very key that was played and climbs straight up the screen from it.
 * Three things drive it — which note, how hard, and how recently the same note
 * was played — because those are the three things a player can actually vary
 * from the keyboard.
 *
 * Sizes are still written in the table units they were tuned in; the flat
 * camera's `unit` turns them into pixels for the keys on this screen.
 */
export class Field {
  /** Chord currently sounding, if the held notes name one. */
  chordName: string | null = null;
  private chordPcs: number[] = [];
  private chordAt = -9;
  private chordFade = 0;

  private ribbons: Ribbon[] = [];
  private columns = new Map<number, Column>();
  /** Onset times per note, for spotting repetition. */
  private lastOnset = new Map<number, number>();
  private repeats = new Map<number, number>();
  /** Smoothed onsets per second, which drives how awake the background looks. */
  density = 0;

  private t = 0;
  /**
   * The aurora's points, held rather than rebuilt. Four bands of seventeen,
   * every frame, always on: sixty-eight objects a frame for a curve whose
   * shape is rewritten each time anyway.
   */
  private readonly auroraPts: Vec2[] = Array.from({ length: AURORA_POINTS + 1 }, () => ({ x: 0, y: 0 }));
  private bend = 0;
  private mod = 0;

  /** The stage above the keyboard: its size in pixels, and pixels per table unit. */
  private w = 1024;
  private h = 600;
  private unit = 1;

  constructor(private readonly stage: Stage) {}

  /** Where there is to draw, as the docked keyboard leaves it. Called every frame. */
  setFrame(width: number, height: number, unit: number): void {
    this.w = width;
    this.h = Math.max(1, height);
    this.unit = unit;
  }

  reset(): void {
    this.ribbons.length = 0;
    this.columns.clear();
    this.lastOnset.clear();
    this.repeats.clear();
    this.chordName = null;
    this.chordPcs = [];
    this.density = 0;
  }

  /** How many times the note now sounding has been struck in a row. */
  repeatOf(note: number): number { return this.repeats.get(note) ?? 0; }

  // ------------------------------------------------------------ playing ---

  /** A note was struck on the key whose lane is at screen `x`. */
  noteOn(note: number, x: number, velocity: number): void {
    const hue = this.stage.hue(note);
    const prev = this.lastOnset.get(note) ?? -99;
    const repeat = this.t - prev < REPEAT_WINDOW ? (this.repeats.get(note) ?? 0) + 1 : 0;
    this.lastOnset.set(note, this.t);
    this.repeats.set(note, Math.min(repeat, 12));
    this.density = Math.min(8, this.density + 1);

    this.ribbons.push({
      note, hue,
      width: 7 + velocity * 22,
      x,
      near: 0,
      far: 0,
      held: true,
      age: 0,
      repeat,
    });
    if (this.ribbons.length > 120) this.ribbons.shift();

    this.columns.set(note, { note, hue, x, velocity, level: 0, held: true });

    this.bloom(x, velocity, hue, repeat);
  }

  noteOff(note: number): void {
    for (const r of this.ribbons) if (r.note === note && r.held) r.held = false;
    const col = this.columns.get(note);
    if (col) col.held = false;
  }

  allOff(): void {
    for (const r of this.ribbons) r.held = false;
    for (const col of this.columns.values()) col.held = false;
  }

  /**
   * The figure is drawn from the notes themselves and only *labelled* from the
   * name, so a chord the vocabulary cannot name still draws. Tying the two
   * together meant a lush voicing made the field go quieter than a plain
   * triad, which is exactly backwards for a mode about playing freely.
   */
  setChord(name: string | null, notes: readonly number[]): void {
    const pcs = [...new Set(notes.map(pitchClass))].sort((a, b) => a - b);
    const held = pcs.length >= 3 ? pcs : [];
    const changed = held.length !== this.chordPcs.length
      || held.some((p, i) => p !== this.chordPcs[i]);
    if (changed && held.length) this.chordAt = this.t;
    this.chordName = name;
    this.chordPcs = held;
  }

  /** The whole field pulses when a hit lands on the beat. */
  onBeat(): void {
    this.stage.particles.ring(this.w / 2, this.h * 0.5, 30, 190, 300, 0.65);
  }

  /**
   * The burst a key makes.
   *
   * Repetition sharpens it: the first strike is a soft ring, and a note played
   * over and over grows spokes and tightens, so a drummed figure looks
   * different from a sustained one without anything having to measure tempo.
   */
  private bloom(x: number, velocity: number, hue: number, repeat: number): void {
    const p = this.stage.particles;
    const u = this.unit;
    const sharp = clamp01(repeat / 6);
    p.ring(x, 6, 14, hue, 40 + velocity * 90, 0.5 - sharp * 0.22);
    p.burst(x, 4, 0, 1, (240 + velocity * 900) * u, hue, 8 + Math.round(velocity * 12));

    // Spokes: only once the same note has been insisted upon. Upwards only:
    // below the stage is the keyboard.
    const spokes = this.stage.quality.reducedMotion ? 0 : Math.round(sharp * 6);
    for (let i = 0; i < spokes; i++) {
      const a = (i / Math.max(1, spokes)) * TAU + this.t;
      p.spawn('spark', x, 8, 20, {
        vx: Math.cos(a) * 340 * u, vy: Math.abs(Math.sin(a)) * 210 * u, vz: 220,
        maxLife: 0.34, size: 12 + velocity * 16, hue,
      });
    }
  }

  // ------------------------------------------------------------- update ---

  update(dt: number, bend: number, mod: number): void {
    this.t += dt;
    this.bend = bend;
    this.mod = mod;
    this.density = Math.max(0, this.density - dt * 1.4);
    this.chordFade = this.chordPcs.length >= 3
      ? Math.min(1, this.chordFade + dt * 5)
      : Math.max(0, this.chordFade - dt * 3.5);

    // A ribbon takes about three seconds to cross the stage, whatever its size.
    const rise = Math.max(110, this.h * 0.32);
    for (const r of this.ribbons) {
      r.far += rise * dt;
      if (r.held) continue;
      r.near += rise * dt;
      r.age += dt;
    }
    this.ribbons = this.ribbons.filter((r) => r.near < this.h && r.age < 2.2);

    for (const col of this.columns.values()) {
      col.level = col.held
        ? Math.min(1, col.level + dt * 7)
        : col.level - dt * 2.4;
    }
    for (const [note, col] of this.columns) if (col.level <= 0) this.columns.delete(note);

    // A repeated note that is left alone stops counting as repeated.
    for (const [note, at] of this.lastOnset) {
      if (this.t - at > REPEAT_WINDOW * 3) { this.lastOnset.delete(note); this.repeats.delete(note); }
    }
  }

  // --------------------------------------------------------------- draw ---

  /**
   * Horizontal displacement at a given height.
   *
   * Bend shears the field sideways and the mod wheel waves it, so both wheels
   * are visible as well as audible — the point of the mode is that expression
   * has somewhere to land. Nothing moves at the keyboard itself, so every
   * ribbon stays rooted on its key.
   */
  private sway(x: number, y: number): number {
    const up = clamp01(y / this.h);
    return x
      + this.bend * up * this.w * 0.18
      + Math.sin(y * 0.011 + this.t * 5.5) * this.mod * 34 * this.unit * up;
  }

  draw(em: CanvasRenderingContext2D): void {
    this.drawAurora(em);
    this.drawRibbons(em);
    this.drawColumns(em);
    this.drawChord(em);
  }

  /** Slow bands drifting up the stage, so it is never simply empty. */
  private drawAurora(em: CanvasRenderingContext2D): void {
    const cam = this.stage.proj;
    // Deliberately faint: this is the room the ribbons are drawn in, not a
    // thing to look at. It brightens only when the playing gets busy.
    const lively = 0.035 + clamp01(this.density / 6) * 0.075;
    em.save();
    em.globalCompositeOperation = 'lighter';
    for (let band = 0; band < 4; band++) {
      const phase = this.t * (0.05 + band * 0.017) + band * 1.9;
      const hue = this.chordPcs.length
        ? this.stage.hue(this.chordPcs[band % this.chordPcs.length])
        : 200 + band * 22;
      const pts = this.auroraPts;
      for (let i = 0; i <= AURORA_POINTS; i++) {
        const u = i / AURORA_POINTS;
        const y = lerp(this.h * 0.06, this.h, u);
        const x = this.w / 2 + Math.sin(phase + u * 3.1) * this.w * (0.14 + band * 0.08);
        pts[i].x = this.sway(x, y);
        pts[i].y = y;
      }
      em.strokeStyle = tone(hue, 70, 62);
      em.globalAlpha = lively * (1 - band * 0.18);
      em.lineWidth = (64 - band * 9) * this.unit;
      em.lineCap = 'round';
      em.lineJoin = 'round';
      tracePath(em, cam, pts, 0);
      em.stroke();
    }
    em.restore();
  }

  /** One bar per note played, climbing the stage from its key. */
  private drawRibbons(em: CanvasRenderingContext2D): void {
    const cam = this.stage.proj;
    em.save();
    em.globalCompositeOperation = 'lighter';
    for (const r of this.ribbons) {
      const len = r.far - r.near;
      if (len < 1) continue;
      // Fades both with age and with how far up the stage it has travelled.
      const gone = clamp01(r.near / this.h);
      const fade = (r.held ? 1 : Math.max(0, 1 - r.age / 2.2)) * (1 - gone) ** 1.5;
      const steps = Math.max(2, Math.min(14, Math.round(len / 40)));
      const left: Vec2[] = [];
      const right: Vec2[] = [];
      for (let i = 0; i <= steps; i++) {
        const y = lerp(r.near, Math.min(r.far, this.h), i / steps);
        // Narrowing with height rather than along the ribbon: a short note and
        // a long one then taper at the same rate, so the whole stage thins out
        // together instead of every bar being a wedge.
        const w = r.width * this.unit * (1 - clamp01(y / this.h) * 0.45);
        const x = this.sway(r.x, y);
        left.push({ x: x - w, y });
        right.push({ x: x + w, y });
      }
      em.globalAlpha = fade * 0.5;
      em.fillStyle = tone(r.hue, 90, 58 + r.repeat * 2);
      fillPoly(em, cam, left.concat(right.reverse()), 0, em.fillStyle);
    }
    em.restore();
  }

  /** A standing beam over every key that is still down. */
  private drawColumns(em: CanvasRenderingContext2D): void {
    const reach = this.h * 0.32;
    for (const col of this.columns.values()) {
      const level = clamp01(col.level);
      if (level <= 0.01) continue;
      // Breathing, so a held chord is alive rather than static.
      const breathe = 0.85 + Math.sin(this.t * 3.1 + col.note) * 0.15;
      const strength = level * (0.25 + col.velocity * 0.4) * breathe;
      for (let i = 0; i < 4; i++) {
        const up = i / 3;
        const y = up * reach;
        this.stage.halo(
          em,
          this.sway(col.x, y),
          y,
          0,
          col.hue,
          (26 + col.velocity * 26) * (1 - up * 0.35),
          strength * (1 - up * 0.6),
        );
      }
    }
  }

  /**
   * The chord, as a shape.
   *
   * Vertices come from how many distinct pitch classes are held and the
   * rotation from where the root sits on the circle of fifths, so the same
   * chord always draws the same figure — the glyph is a fact about the
   * harmony, not a decoration.
   */
  private drawChord(em: CanvasRenderingContext2D): void {
    if (this.chordFade <= 0.01 || this.chordPcs.length < 3) return;
    const cam = this.stage.proj;
    const n = this.chordPcs.length;
    const root = this.chordPcs[0];
    const cx = this.w / 2;
    const cy = this.h * 0.55;
    const age = this.t - this.chordAt;
    // Settles rather than snaps: it flares wide and draws in.
    const R = Math.min(this.w, this.h) * 0.26 * (1 + Math.exp(-age * 4) * 0.35) * this.chordFade;
    const rot = (root / 12) * TAU + this.t * 0.22;

    const verts: Vec2[] = [];
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * TAU;
      const hueSpin = this.chordPcs[i] / 12;
      const r = R * (0.86 + 0.14 * Math.cos(hueSpin * TAU));
      const y = cy + Math.sin(a) * r;
      verts.push({ x: this.sway(cx + Math.cos(a) * r, y), y });
    }

    em.save();
    em.globalCompositeOperation = 'lighter';
    em.lineCap = 'round';
    em.lineJoin = 'round';

    // Every interval in the chord gets a chord of the polygon: a triad is a
    // triangle, a seventh a quadrilateral with its two diagonals.
    em.globalAlpha = this.chordFade * 0.5;
    em.lineWidth = 2.4;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        em.strokeStyle = tone(this.stage.hue(this.chordPcs[i]), 92, 66);
        tracePath(em, cam, [verts[i], verts[j]], 0);
        em.stroke();
      }
    }

    em.globalAlpha = this.chordFade * 0.8;
    em.lineWidth = 3.4;
    em.strokeStyle = tone(this.stage.hue(root), 95, 72);
    tracePath(em, cam, verts, 0, true);
    em.stroke();

    for (let i = 0; i < n; i++) {
      this.stage.halo(em, verts[i].x, verts[i].y, 0, this.stage.hue(this.chordPcs[i]), 44, this.chordFade * 0.7);
    }
    em.restore();

    if (this.chordName) {
      const p = { x: 0, y: 0 };
      cam.project(this.sway(cx, cy), cy, 0, p);
      const size = clamp(Math.min(this.w, this.h) * 0.06, 15, 30);
      this.stage.labelAt(this.stage.ctx, p.x, p.y, this.chordName,
        tone(this.stage.hue(root), 95, 82), this.chordFade * 0.9, size);
    }
  }
}
