import type { Stage } from '../../render/stage';
import type { KeyDeck, KeyLit } from '../../game/keys';
import { noteNameInKey } from '../../audio/music';
import { FIELD } from '../../render/field';
import { tone } from '../../render/palette';
import { tracePath, circlePoints, fillPoly } from '../../render/geom';
import { clamp01, lerp } from '../../core/math';
import type { Judge, Target } from './judge';

/** Where an aura first appears, in table y. */
const SPAWN_Y = FIELD.far - 40;

/** Table radius of the rim a crotchet is drawn at. Everything else scales off it. */
const RIM = 26;

/** Shortest tail that still reads as a tail, in beats. */
const MIN_TAIL = 0.4;

export interface AuraView {
  target: Target;
  key: KeyLit;
  /** 0 at spawn, 1 as it lands on the key. */
  progress: number;
  y: number;
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

/**
 * Falling note auras.
 *
 * Because the camera is raked, an aura still at the top of the lane is small,
 * dim and high up the table, and one about to land is large and bright — the
 * approach reads as approach without anything having to fake a size curve.
 *
 * Length is carried by two things at once. The head's shape says which note
 * value it is, which is readable the moment it appears and survives colour-blind
 * mode where hue carries less; the tail behind it says exactly how far down the
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

  constructor(private readonly stage: Stage, private readonly deck: KeyDeck) {}

  /** Auras currently in flight, nearest last so they paint over the far ones. */
  view(judge: Judge, now: number, leadSeconds: number, beatSeconds: number): AuraView[] {
    this.laneBeats = leadSeconds / beatSeconds;
    const out: AuraView[] = [];
    for (const target of judge.approaching(now, leadSeconds)) {
      const key = this.deck.byNote.get(target.note);
      if (!key) continue;
      const progress = clamp01(1 - (target.time - now) / leadSeconds);
      out.push({
        target, key, progress,
        y: lerp(SPAWN_Y, key.geom.cy, progress),
        tailBeats: target.len,
        held: false,
      });
    }
    // A note being held stays on screen with its tail shortening, so "how much
    // longer" is a thing the player can see rather than count.
    for (const target of judge.sounding(now)) {
      const key = this.deck.byNote.get(target.note);
      if (!key) continue;
      out.push({
        target, key, progress: 1,
        y: key.geom.cy,
        tailBeats: Math.max(0, (target.end - now) / beatSeconds),
        held: true,
      });
    }
    return out.sort((a, b) => b.y - a.y);
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

  draw(em: CanvasRenderingContext2D, views: readonly AuraView[]): void {
    const cam = this.stage.cam;

    // Faint guides, only under the lanes something is actually coming down.
    const lanes = new Set(views.map((v) => v.target.note));
    em.save();
    em.globalCompositeOperation = 'lighter';
    // Additive, so guides accumulate: a melody lights two or three lanes and a
    // chord chart can light a dozen, which at a fixed alpha stops being a hint
    // about where to look and becomes a wash over the whole board.
    em.globalAlpha = lanes.size > 6 ? 0.09 * (6 / lanes.size) : 0.09;
    em.lineWidth = 1.5;
    for (const note of lanes) {
      const key = this.deck.byNote.get(note);
      if (!key) continue;
      em.strokeStyle = tone(this.stage.hue(note), 80, 60);
      tracePath(em, cam, [
        { x: key.geom.cx, y: key.geom.cy + 20 },
        { x: key.geom.cx, y: SPAWN_Y },
      ], 3);
      em.stroke();
    }
    em.restore();

    for (const v of views) {
      const g = v.key.geom;
      const hue = this.stage.hue(g.note);
      const scale = cam.scaleAt(g.cx, v.y, 12);
      // Fades in rather than popping into existence at the far end.
      const alpha = auraAlpha(v);

      this.drawTail(em, v, hue, alpha, scale);
      this.drawHead(em, v, hue, alpha, scale);
    }
  }

  /** Pitch names sit above the composited glow so bloom cannot blur them. */
  drawLabels(ctx: CanvasRenderingContext2D, views: readonly AuraView[], tonic: number): void {
    for (const v of views) {
      const g = v.key.geom;
      this.stage.label(
        ctx, g.cx, v.y, 12,
        noteNameInKey(v.target.note, tonic), this.stage.palette.ink, auraAlpha(v), 30,
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
  private drawTail(
    em: CanvasRenderingContext2D, v: AuraView,
    hue: number, alpha: number, scale: number,
  ): void {
    if (v.tailBeats <= 0) return;
    const g = v.key.geom;
    const perBeat = (SPAWN_Y - g.cy) / Math.max(1, this.laneBeats);
    const shown = v.held ? v.tailBeats : Math.max(v.tailBeats, MIN_TAIL);
    const back = Math.min(SPAWN_Y, v.y + perBeat * shown);
    if (back - v.y < 1) return;
    em.save();
    em.globalCompositeOperation = 'lighter';
    // A tail being held is the one thing on screen that is running out, so it
    // burns brighter than one that is merely on its way.
    em.globalAlpha = alpha * (v.held ? 0.42 : 0.28);
    em.strokeStyle = tone(hue, 90, v.held ? 70 : 62);
    em.lineWidth = Math.max(2, 16 * scale);
    em.lineCap = 'round';
    tracePath(em, this.stage.cam, [{ x: g.cx, y: v.y }, { x: g.cx, y: back }], 10);
    em.stroke();
    em.restore();
  }

  /**
   * The aura itself: a soft disc, and a rim whose shape is the note value.
   *
   * A quaver is a small solid dot, a crotchet the plain ring this mode has
   * always drawn, a minim gains an inner ring and a semibreve becomes a
   * hexagon. A dot alongside marks the dotted values.
   */
  private drawHead(
    em: CanvasRenderingContext2D, v: AuraView,
    hue: number, alpha: number, scale: number,
  ): void {
    const g = v.key.geom;
    const c = this.stage.cam;
    const shape = noteShape(v.target.len);
    const small = shape.kind === 'quaver';

    this.stage.halo(
      em, g.cx, v.y, 12, hue,
      (small ? 24 : 34) + v.progress * 16,
      alpha * (0.4 + v.progress * 0.5),
    );

    em.save();
    em.globalCompositeOperation = 'lighter';
    em.globalAlpha = alpha * (0.5 + v.progress * 0.5);
    const light = tone(hue, 95, 64 + v.progress * 22);
    em.strokeStyle = light;
    em.lineWidth = Math.max(1.2, 3 * scale);

    if (small) {
      // Solid rather than open: the shortest note is the one with the least
      // room to draw anything inside it.
      fillPoly(em, c, circlePoints(g.cx, v.y, RIM * 0.6, 20), 12, light);
    } else {
      const rim = shape.kind === 'semibreve'
        ? circlePoints(g.cx, v.y, RIM * 1.08, 6)
        : circlePoints(g.cx, v.y, RIM, 24);
      tracePath(em, c, rim, 12, true);
      em.stroke();
      if (shape.kind !== 'crotchet') {
        tracePath(em, c, circlePoints(g.cx, v.y, RIM * 0.58, 18), 12, true);
        em.stroke();
      }
    }

    if (shape.dotted) {
      fillPoly(em, c, circlePoints(g.cx + RIM * 1.5, v.y, 5, 10), 12, light);
    }
    em.restore();
  }

  /**
   * The line the auras are aiming for, drawn just in front of the keys.
   * Without it there is nothing to be on time *with*.
   */
  drawStrikeLine(em: CanvasRenderingContext2D, pulse: number): void {
    const c = this.stage.cam;
    const keys = this.deck.keys;
    if (!keys.length) return;
    const left = keys[0].geom;
    const right = keys[keys.length - 1].geom;
    em.save();
    em.globalCompositeOperation = 'lighter';
    em.globalAlpha = 0.18 + pulse * 0.3;
    // Chrome rather than pitch: the line is the same whatever note is landing
    // on it, so it takes the theme's primary and goes brass under Velvet.
    em.strokeStyle = this.stage.palette.neon;
    em.lineWidth = 2.5;
    em.lineCap = 'round';
    tracePath(em, c, [
      { x: left.cx - left.halfW, y: left.cy + 26 },
      { x: right.cx + right.halfW, y: right.cy + 26 },
    ], 8);
    em.stroke();
    em.restore();
  }
}
