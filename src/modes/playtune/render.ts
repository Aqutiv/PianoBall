import type { Stage } from '../../render/stage';
import type { DockKey, DockLayout } from '../../game/dock';
import { noteNameInKey } from '../../audio/music';
import { tone, withAlpha } from '../../render/palette';
import { clamp, clamp01 } from '../../core/math';
import type { Judge, Target } from './judge';

/** Shortest tail that still reads as a tail, in beats. */
const MIN_TAIL = 0.4;

export interface AuraView {
  target: Target;
  /** The key the note lands on, and with it the lane it falls down. */
  lane: DockKey;
  /** 0 as it appears at the top of the lane, 1 as it lands. */
  progress: number;
  /** Screen y of the head's centre. */
  y: number;
  /** Head radius, in pixels. */
  r: number;
  /** Beats of tail still owed. Counts down while the note is held. */
  tailBeats: number;
  /** True once the note has been struck and is being held. */
  held: boolean;
}

/** Opacity shared by every part of an aura, including its pitch name. */
function auraAlpha(view: AuraView): number {
  return view.held ? 1 : clamp01(view.progress * 3);
}

/** Which note value a length in beats reads as. */
export interface NoteShape {
  kind: 'quaver' | 'crotchet' | 'minim' | 'semibreve';
  dotted: boolean;
}

/**
 * A length in beats, read as the note value a musician would write.
 *
 * The point is not notation for its own sake: a player who can see at a glance
 * that the next aura is twice as long as the last one knows to keep the key
 * down without having to watch the tail run out. Dotted values are worth
 * distinguishing because they are the ones that go wrong — the difference
 * between Ode to Joy's dotted crotchet and its crotchet is the whole phrase.
 */
export function noteShape(len: number): NoteShape {
  const dotted = isDotted(len);
  const base = dotted ? len / 1.5 : len;
  const kind = base < 0.75 ? 'quaver'
    : base < 1.75 ? 'crotchet'
      : base < 3.5 ? 'minim'
        : 'semibreve';
  return { kind, dotted };
}

/** Whether a length is one and a half of some plain note value. */
function isDotted(len: number): boolean {
  for (let v = 0.5; v <= 8; v *= 2) {
    if (Math.abs(len - v * 1.5) < v * 0.02) return true;
  }
  return false;
}

/** Where the lanes run on screen: from `top` down to the line along the keys. */
export interface LaneFrame {
  top: number;
  /** The strike line, just above the keys. */
  strike: number;
}

/** The lanes for a docked keyboard, starting at `top`. */
export function laneFrame(layout: DockLayout, top: number): LaneFrame {
  return { top, strike: layout.keysTop - 3 };
}

/**
 * Falling notes.
 *
 * Each one falls straight down the lane of the key it is due on, at a steady
 * speed, and lands on the line along the top of the keys at the moment it
 * should be played — the way PianoBallDesktop draws them, and the way a
 * keyboard player reads a falling-note score: where it is across the screen is
 * which key, how far up it is is how long until.
 *
 * Length is carried by two things at once. The head's shape says which note
 * value it is, which is readable the moment it appears and survives colour-blind
 * mode where hue carries less; the tail behind it says exactly how far up the
 * lane the note runs, and drains as the key is held.
 */
export class AuraStage {
  /**
   * How many beats of music the lane is holding right now.
   *
   * Derived in `view` from the approach it was actually handed, never set from
   * outside. The head falls on a ruler of seconds and the tail is drawn on a
   * ruler of beats, and the two describe the same lane only while
   * `leadSeconds === laneBeats * beatSeconds`. That used to be the caller's
   * job to remember; deriving it here means there is no longer a way to set
   * one and pass the other, and no way for them to part company.
   */
  private laneBeats = 4;
  private lanes: LaneFrame = { top: 0, strike: 1 };

  constructor(private readonly stage: Stage) {}

  /** Pixels of lane per beat of music. */
  private get perBeat(): number {
    return (this.lanes.strike - this.lanes.top) / Math.max(1e-6, this.laneBeats);
  }

  /** Auras currently in flight, highest first so the nearer ones paint over them. */
  view(
    judge: Judge, now: number, leadSeconds: number, beatSeconds: number,
    layout: DockLayout, lanes: LaneFrame,
  ): AuraView[] {
    this.laneBeats = leadSeconds / beatSeconds;
    this.lanes = lanes;
    const span = lanes.strike - lanes.top;
    const approaching = judge.approaching(now, leadSeconds);
    const sounding = judge.sounding(now);
    const radius = this.radii(layout, [...approaching, ...sounding]);

    const out: AuraView[] = [];
    for (const target of approaching) {
      const lane = layout.byNote.get(target.note);
      if (!lane) continue;
      const r = radius.get(target) ?? 12;
      const progress = clamp01(1 - (target.time - now) / leadSeconds);
      out.push({
        target, lane, progress, r,
        y: lanes.strike - r - (1 - progress) * Math.max(0, span - 2 * r),
        tailBeats: target.len,
        held: false,
      });
    }
    // A note being held settles onto its key with its tail shortening above it,
    // so "how much longer" is a thing the player can see rather than count.
    for (const target of sounding) {
      const lane = layout.byNote.get(target.note);
      if (!lane) continue;
      const r = radius.get(target) ?? 12;
      out.push({
        target, lane, progress: 1, r,
        y: lanes.strike + r * 0.9,
        tailBeats: Math.max(0, (target.end - now) / beatSeconds),
        held: true,
      });
    }
    return out.sort((a, b) => a.y - b.y);
  }

  /**
   * How big each head is.
   *
   * As wide as its key allows, up to a ceiling — but a chord puts heads on
   * neighbouring lanes at once, a semitone apart, and two heads that overlap
   * read as one. So a note landing together with another is shrunk until the
   * two have room, as the desktop app does.
   */
  private radii(layout: DockLayout, targets: readonly Target[]): Map<Target, number> {
    const out = new Map<Target, number>();
    const byOnset = new Map<number, Target[]>();
    for (const t of targets) {
      const group = byOnset.get(t.time);
      if (group) group.push(t); else byOnset.set(t.time, [t]);
    }
    for (const group of byOnset.values()) {
      for (const t of group) {
        const lane = layout.byNote.get(t.note);
        if (!lane) continue;
        const row = layout.rows[lane.row];
        let r = clamp(row.whiteW * 0.43, 10.5, 25);
        for (const other of group) {
          if (other === t) continue;
          const o = layout.byNote.get(other.note);
          if (o) r = Math.min(r, Math.max(7, 0.46 * Math.abs(o.laneX - lane.laneX)));
        }
        out.set(t, r);
      }
    }
    return out;
  }

  /** How lit a key should be from an aura heading for it, 0..1. */
  highlightFor(views: readonly AuraView[]): (note: number) => number {
    const byNote = new Map<number, number>();
    for (const v of views) {
      // Only really lights up in the last stretch, or the whole keyboard glows.
      const strength = Math.max(0, (v.progress - 0.6) / 0.4) * 0.55;
      byNote.set(v.target.note, Math.max(byNote.get(v.target.note) ?? 0, strength));
    }
    return (note) => byNote.get(note) ?? 0;
  }

  /** The notes of the next onset still to come: what to reach for. */
  nextNotes(views: readonly AuraView[]): Set<number> {
    let next = Infinity;
    for (const v of views) if (!v.held && v.target.time < next) next = v.target.time;
    const notes = new Set<number>();
    for (const v of views) if (!v.held && v.target.time === next) notes.add(v.target.note);
    return notes;
  }

  /**
   * Bar lines, falling with the notes, so the lane has a meter as well as a
   * pitch. `bars` are the seconds until each bar line, already on the judging
   * clock.
   */
  drawBars(ctx: CanvasRenderingContext2D, layout: DockLayout, bars: readonly number[], leadSeconds: number): void {
    const span = this.lanes.strike - this.lanes.top;
    ctx.save();
    ctx.fillStyle = withAlpha(this.stage.palette.railTop, 0.16);
    for (const until of bars) {
      if (until < 0 || until > leadSeconds) continue;
      const y = this.lanes.strike - (until / leadSeconds) * span;
      ctx.fillRect(layout.left, Math.round(y), layout.right - layout.left, 1);
    }
    ctx.restore();
  }

  /** A brighter line up the lanes something is actually coming down. */
  drawLanes(em: CanvasRenderingContext2D, views: readonly AuraView[]): void {
    const lanes = new Map<number, DockKey>();
    for (const v of views) lanes.set(v.target.note, v.lane);
    em.save();
    em.globalCompositeOperation = 'lighter';
    // Additive, so guides accumulate: a melody lights two or three lanes and a
    // chord chart can light a dozen, which at a fixed alpha stops being a hint
    // about where to look and becomes a wash over the whole board.
    em.globalAlpha = lanes.size > 6 ? 0.14 * (6 / lanes.size) : 0.14;
    for (const [note, lane] of lanes) {
      em.fillStyle = tone(this.stage.hue(note), 80, 60);
      em.fillRect(lane.laneX - 1, this.lanes.top, 2, this.lanes.strike - this.lanes.top);
    }
    em.restore();
  }

  draw(em: CanvasRenderingContext2D, views: readonly AuraView[]): void {
    for (const v of views) {
      const hue = this.stage.hue(v.target.note);
      // Fades in rather than popping into existence at the top of the lane.
      const alpha = auraAlpha(v);
      this.drawTail(em, v, hue, alpha);
      this.drawHead(em, v, hue, alpha);
    }
  }

  /** A ring around each head of the next onset: the notes to reach for now. */
  drawFocus(ctx: CanvasRenderingContext2D, views: readonly AuraView[]): void {
    const next = this.nextNotes(views);
    if (!next.size) return;
    ctx.save();
    ctx.strokeStyle = withAlpha(this.stage.palette.ink, 0.85);
    ctx.lineWidth = 2;
    for (const v of views) {
      if (v.held || !next.has(v.target.note)) continue;
      ctx.globalAlpha = auraAlpha(v);
      ctx.beginPath();
      ctx.arc(v.lane.laneX, v.y, v.r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Pitch names sit above the composited glow so bloom cannot blur them.
   *
   * Above it, but still on it: the name is centred on the head, and the head's
   * halo is a near-white core wider than the glyph is tall, so the letter is
   * not merely over a bright patch — it is entirely inside the brightest thing
   * on the board. Hence the edge. It is stroked in the theme's `void`, the
   * darkest colour each look names, which is what keeps the letterform under a
   * hue the mode is free to pick and a bloom the player is free to turn off.
   */
  drawLabels(ctx: CanvasRenderingContext2D, views: readonly AuraView[], tonic: number): void {
    for (const v of views) {
      this.stage.labelAt(
        ctx, v.lane.laneX, v.y,
        noteNameInKey(v.target.note, tonic), this.stage.palette.ink, auraAlpha(v),
        clamp(v.r * 1.05, 11, 22),
        {
          edge: this.stage.palette.void,
          minSize: 11,
          // The UI face, not the display face. Velvet's display is Cormorant
          // Garamond and `styles.css` only ships that family at 300 and 600, so
          // the 700 asked for here came back synthetically emboldened: a light
          // serif, faked bold, over bloom.
          font: this.stage.theme.fonts.ui,
        },
      );
    }
  }

  /**
   * The body of the note, trailing back up the lane behind the head.
   *
   * Drawn for every note rather than only the long ones: a quaver with no tail
   * and a semibreve with no tail were the same picture, which is exactly the
   * thing the player needed to be able to tell apart.
   */
  private drawTail(em: CanvasRenderingContext2D, v: AuraView, hue: number, alpha: number): void {
    if (v.tailBeats <= 0) return;
    const shown = v.held ? v.tailBeats : Math.max(v.tailBeats, MIN_TAIL);
    const top = Math.max(this.lanes.top, v.y - this.perBeat * shown);
    if (v.y - top < 1) return;
    em.save();
    em.globalCompositeOperation = 'lighter';
    // A tail being held is the one thing on screen that is running out, so it
    // burns brighter than one that is merely on its way.
    em.globalAlpha = alpha * (v.held ? 0.5 : 0.34);
    em.strokeStyle = tone(hue, 90, v.held ? 70 : 62);
    em.lineWidth = Math.max(3, v.r * 0.55);
    em.lineCap = 'round';
    em.beginPath();
    em.moveTo(v.lane.laneX, v.y);
    em.lineTo(v.lane.laneX, top);
    em.stroke();
    em.restore();
  }

  /**
   * The head: a glowing disc, and a rim whose shape is the note value.
   *
   * A quaver is a small solid dot, a crotchet a plain ring, a minim gains an
   * inner ring and a semibreve becomes a hexagon. A dot alongside marks the
   * dotted values.
   */
  private drawHead(em: CanvasRenderingContext2D, v: AuraView, hue: number, alpha: number): void {
    const x = v.lane.laneX;
    const shape = noteShape(v.target.len);
    const small = shape.kind === 'quaver';
    const r = small ? v.r * 0.72 : v.r;

    this.stage.glowAt(em, x, v.y, r * (3 + v.progress), hue, alpha * (0.45 + v.progress * 0.45));

    em.save();
    em.globalCompositeOperation = 'lighter';
    em.globalAlpha = alpha * (0.55 + v.progress * 0.45);
    const light = tone(hue, 95, 64 + v.progress * 18);
    em.strokeStyle = light;
    em.fillStyle = light;
    em.lineWidth = Math.max(1.5, r * 0.16);

    if (small) {
      // Solid rather than open: the shortest note is the one with the least
      // room to draw anything inside it.
      em.beginPath();
      em.arc(x, v.y, r, 0, Math.PI * 2);
      em.fill();
    } else {
      em.globalAlpha *= 0.35;
      em.beginPath();
      em.arc(x, v.y, r, 0, Math.PI * 2);
      em.fill();
      em.globalAlpha = alpha * (0.55 + v.progress * 0.45);
      em.beginPath();
      if (shape.kind === 'semibreve') {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const px = x + Math.cos(a) * r * 1.08, py = v.y + Math.sin(a) * r * 1.08;
          if (i === 0) em.moveTo(px, py); else em.lineTo(px, py);
        }
        em.closePath();
      } else {
        em.arc(x, v.y, r, 0, Math.PI * 2);
      }
      em.stroke();
      if (shape.kind !== 'crotchet') {
        em.beginPath();
        em.arc(x, v.y, r * 0.58, 0, Math.PI * 2);
        em.stroke();
      }
    }

    if (shape.dotted) {
      em.beginPath();
      em.arc(x + r * 1.45, v.y, Math.max(2.5, r * 0.18), 0, Math.PI * 2);
      em.fill();
    }
    em.restore();
  }

  /**
   * The line the notes are aiming for, along the top of the keys. Without it
   * there is nothing to be on time *with*.
   */
  drawStrikeLine(em: CanvasRenderingContext2D, layout: DockLayout, pulse: number): void {
    em.save();
    em.globalCompositeOperation = 'lighter';
    em.globalAlpha = 0.22 + pulse * 0.4;
    // Chrome rather than pitch: the line is the same whatever note is landing
    // on it, so it takes the theme's primary and goes brass under Velvet.
    em.fillStyle = this.stage.palette.neon;
    em.fillRect(layout.left, this.lanes.strike - 1, layout.right - layout.left, 2.5);
    em.restore();
  }
}
