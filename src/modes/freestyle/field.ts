import type { Stage } from '../../render/stage';
import type { KeyGeom } from '../../game/keyLayout';
import { tracePath, fillPoly } from '../../render/geom';
import { tone } from '../../render/palette';
import { pitchClass } from '../../midi/notes';
import { clamp01, TAU, lerp } from '../../core/math';
import { FIELD } from '../../render/field';
import type { Vec2 } from '../../physics/vec2';

/** Ribbons rise at this many table units a second. */
const RISE = 300;
/** Two onsets on the same note closer than this count as a repeat. */
const REPEAT_WINDOW = 0.55;

interface Ribbon {
  note: number;
  hue: number;
  /** Width in table units, from how hard the key was struck. */
  width: number;
  x: number;
  /** Near and far ends, in table y. The near end pins while the key is held. */
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
  y: number;
  velocity: number;
  /** Rises to 1 while held, falls away after. */
  level: number;
  held: boolean;
}

/**
 * Abstract visuals for Freestyle.
 *
 * Everything lives in table space, so it inherits the same raked camera as the
 * pinball table: a ribbon leaving the keyboard genuinely recedes rather than
 * merely shrinking. Three things drive it — which note, how hard, and how
 * recently the same note was played — because those are the three things a
 * player can actually vary from the keyboard.
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
  private bend = 0;
  private mod = 0;

  constructor(private readonly stage: Stage) {}

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

  noteOn(geom: KeyGeom, velocity: number): void {
    const hue = this.stage.hue(geom.note);
    const prev = this.lastOnset.get(geom.note) ?? -99;
    const repeat = this.t - prev < REPEAT_WINDOW ? (this.repeats.get(geom.note) ?? 0) + 1 : 0;
    this.lastOnset.set(geom.note, this.t);
    this.repeats.set(geom.note, Math.min(repeat, 12));
    this.density = Math.min(8, this.density + 1);

    this.ribbons.push({
      note: geom.note, hue,
      width: 7 + velocity * 22,
      x: geom.cx,
      near: FIELD.near,
      far: FIELD.near,
      held: true,
      age: 0,
      repeat,
    });
    if (this.ribbons.length > 120) this.ribbons.shift();

    this.columns.set(geom.note, {
      note: geom.note, hue, x: geom.cx, y: geom.cy,
      velocity, level: 0, held: true,
    });

    this.bloom(geom, velocity, hue, repeat);
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
    this.stage.particles.ring(FIELD.width / 2, 820, 30, 190, 300, 0.65);
  }

  /**
   * The burst a key makes.
   *
   * Repetition sharpens it: the first strike is a soft ring, and a note played
   * over and over grows spokes and tightens, so a drummed figure looks
   * different from a sustained one without anything having to measure tempo.
   */
  private bloom(geom: KeyGeom, velocity: number, hue: number, repeat: number): void {
    const p = this.stage.particles;
    const sharp = clamp01(repeat / 6);
    p.ring(geom.cx, geom.cy + 18, 14, hue, 40 + velocity * 90, 0.5 - sharp * 0.22);
    p.burst(geom.cx, geom.cy + 10, 0, 1, 240 + velocity * 900, hue, 8 + Math.round(velocity * 12));

    // Spokes: only once the same note has been insisted upon.
    const spokes = Math.round(sharp * 6);
    for (let i = 0; i < spokes; i++) {
      const a = (i / Math.max(1, spokes)) * TAU + this.t;
      p.spawn('spark', geom.cx, geom.cy + 16, 20, {
        vx: Math.cos(a) * 340, vy: Math.sin(a) * 210, vz: 220,
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

    for (const r of this.ribbons) {
      r.far += RISE * dt;
      if (r.held) continue;
      r.near += RISE * dt;
      r.age += dt;
    }
    this.ribbons = this.ribbons.filter((r) => r.near < FIELD.far && r.age < 2.2);

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
   * Horizontal displacement at a given depth.
   *
   * Bend shears the field sideways and the mod wheel waves it, so both wheels
   * are visible as well as audible — the point of the mode is that expression
   * has somewhere to land.
   */
  private sway(x: number, y: number): number {
    const depth = (y - FIELD.near) / (FIELD.far - FIELD.near);
    return x
      + this.bend * depth * 190
      + Math.sin(y * 0.011 + this.t * 5.5) * this.mod * 34 * depth;
  }

  draw(em: CanvasRenderingContext2D): void {
    this.drawAurora(em);
    this.drawRibbons(em);
    this.drawColumns(em);
    this.drawChord(em);
  }

  /** Slow bands drifting up the field, so it is never simply empty. */
  private drawAurora(em: CanvasRenderingContext2D): void {
    const cam = this.stage.cam;
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
      const pts: Vec2[] = [];
      for (let i = 0; i <= 16; i++) {
        const u = i / 16;
        const y = lerp(FIELD.near + 60, FIELD.far, u);
        const x = FIELD.width / 2 + Math.sin(phase + u * 3.1) * (150 + band * 90);
        pts.push({ x: this.sway(x, y), y });
      }
      em.strokeStyle = tone(hue, 70, 62);
      em.globalAlpha = lively * (1 - band * 0.18);
      em.lineWidth = 64 - band * 9;
      em.lineCap = 'round';
      em.lineJoin = 'round';
      tracePath(em, cam, pts, 4);
      em.stroke();
    }
    em.restore();
  }

  /** One bar per note played, receding up the table. */
  private drawRibbons(em: CanvasRenderingContext2D): void {
    const cam = this.stage.cam;
    em.save();
    em.globalCompositeOperation = 'lighter';
    for (const r of this.ribbons) {
      const len = r.far - r.near;
      if (len < 1) continue;
      // Fades both with age and with how far up the field it has travelled.
      const gone = clamp01((r.near - FIELD.near) / (FIELD.far - FIELD.near));
      const fade = (r.held ? 1 : Math.max(0, 1 - r.age / 2.2)) * (1 - gone) ** 1.5;
      const steps = Math.max(2, Math.min(14, Math.round(len / 90)));
      const left: Vec2[] = [];
      const right: Vec2[] = [];
      for (let i = 0; i <= steps; i++) {
        const y = lerp(r.near, r.far, i / steps);
        // Narrowing by depth in the field rather than by position along the
        // ribbon: a short note and a long one then taper at the same rate, so
        // the whole field recedes together instead of every bar being a wedge.
        const depth = clamp01((y - FIELD.near) / (FIELD.far - FIELD.near));
        const w = r.width * (1 - depth * 0.62);
        const x = this.sway(r.x, y);
        left.push({ x: x - w, y });
        right.push({ x: x + w, y });
      }
      em.globalAlpha = fade * 0.5;
      em.fillStyle = tone(r.hue, 90, 58 + r.repeat * 2);
      fillPoly(em, cam, left.concat(right.reverse()), 5, em.fillStyle);
    }
    em.restore();
  }

  /** A standing beam over every key that is still down. */
  private drawColumns(em: CanvasRenderingContext2D): void {
    for (const col of this.columns.values()) {
      const level = clamp01(col.level);
      if (level <= 0.01) continue;
      // Breathing, so a held chord is alive rather than static.
      const breathe = 0.85 + Math.sin(this.t * 3.1 + col.note) * 0.15;
      const strength = level * (0.25 + col.velocity * 0.4) * breathe;
      for (let i = 0; i < 4; i++) {
        const up = i / 3;
        this.stage.halo(
          em,
          this.sway(col.x, col.y + up * 210),
          col.y + up * 210,
          18 + up * 90,
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
    const cam = this.stage.cam;
    const n = this.chordPcs.length;
    const root = this.chordPcs[0];
    const cx = FIELD.width / 2;
    const cy = 880;
    const age = this.t - this.chordAt;
    // Settles rather than snaps: it flares wide and draws in.
    const R = 210 * (1 + Math.exp(-age * 4) * 0.35) * this.chordFade;
    const rot = (root / 12) * TAU + this.t * 0.22;

    const verts: Vec2[] = [];
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * TAU;
      const hueSpin = this.chordPcs[i] / 12;
      const r = R * (0.86 + 0.14 * Math.cos(hueSpin * TAU));
      verts.push({ x: this.sway(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8), y: cy + Math.sin(a) * r * 0.8 });
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
        tracePath(em, cam, [verts[i], verts[j]], 26);
        em.stroke();
      }
    }

    em.globalAlpha = this.chordFade * 0.8;
    em.lineWidth = 3.4;
    em.strokeStyle = tone(this.stage.hue(root), 95, 72);
    tracePath(em, cam, verts, 26, true);
    em.stroke();

    for (let i = 0; i < n; i++) {
      this.stage.halo(em, verts[i].x, verts[i].y, 26, this.stage.hue(this.chordPcs[i]), 44, this.chordFade * 0.7);
    }
    em.restore();

    if (this.chordName) {
      this.stage.label(this.stage.ctx, this.sway(cx, cy), cy, 26,
        this.chordName, tone(this.stage.hue(root), 95, 82), this.chordFade * 0.9);
    }
  }

}
