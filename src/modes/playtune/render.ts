import type { Stage } from '../../render/stage';
import type { KeyDeck, KeyLit } from '../../game/keys';
import { FIELD } from '../../render/field';
import { tracePath, circlePoints } from '../../render/geom';
import { clamp01, lerp } from '../../core/math';
import type { Judge, Target } from './judge';

/** Where an aura first appears, in table y. */
const SPAWN_Y = FIELD.far - 40;

export interface AuraView {
  target: Target;
  key: KeyLit;
  /** 0 at spawn, 1 as it lands on the key. */
  progress: number;
  y: number;
}

/**
 * Falling note auras.
 *
 * Because the camera is raked, an aura that is still four beats away is small,
 * dim and high up the table, and one about to land is large and bright — the
 * approach reads as approach without anything having to fake a size curve.
 */
export class AuraStage {
  /** Beats of approach an aura gets. Set by the mode from settings. */
  leadBeats = 4;

  constructor(private readonly stage: Stage, private readonly deck: KeyDeck) {}

  /** Auras currently in flight, nearest last so they paint over the far ones. */
  view(judge: Judge, now: number, leadSeconds: number): AuraView[] {
    const out: AuraView[] = [];
    for (const target of judge.approaching(now, leadSeconds)) {
      const key = this.deck.byNote.get(target.note);
      if (!key) continue;
      const progress = clamp01(1 - (target.time - now) / leadSeconds);
      out.push({ target, key, progress, y: lerp(SPAWN_Y, key.geom.cy, progress) });
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
    em.globalAlpha = 0.09;
    em.lineWidth = 1.5;
    for (const note of lanes) {
      const key = this.deck.byNote.get(note);
      if (!key) continue;
      em.strokeStyle = `hsl(${this.stage.hue(note)} 80% 60%)`;
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
      const alpha = clamp01(v.progress * 3);

      // The tail of a held note, trailing back up the lane behind the head.
      // A note worth holding trails a tail as long as the note itself, in the
      // same units the aura is falling through: the tail is the note's length
      // made visible.
      const tailBeats = v.target.len;
      if (tailBeats > 1) {
        const perBeat = (SPAWN_Y - g.cy) / Math.max(1, this.leadBeats);
        const back = Math.min(SPAWN_Y, v.y + perBeat * tailBeats);
        em.save();
        em.globalCompositeOperation = 'lighter';
        em.globalAlpha = alpha * 0.28;
        em.strokeStyle = `hsl(${hue} 90% 62%)`;
        em.lineWidth = Math.max(2, 16 * scale);
        em.lineCap = 'round';
        tracePath(em, cam, [{ x: g.cx, y: v.y }, { x: g.cx, y: back }], 10);
        em.stroke();
        em.restore();
      }

      // The aura itself: a soft disc with a hard rim, so the exact moment it
      // meets the key is readable rather than a blur.
      this.stage.halo(em, g.cx, v.y, 12, hue, 34 + v.progress * 16, alpha * (0.4 + v.progress * 0.5));

      em.save();
      em.globalCompositeOperation = 'lighter';
      em.globalAlpha = alpha * (0.5 + v.progress * 0.5);
      em.strokeStyle = `hsl(${hue} 95% ${64 + v.progress * 22}%)`;
      em.lineWidth = Math.max(1.2, 3 * scale);
      tracePath(em, cam, circlePoints(g.cx, v.y, 26, 24), 12, true);
      em.stroke();
      em.restore();

    }
  }

  /**
   * The line the auras are aiming for, drawn just in front of the keys.
   * Without it there is nothing to be on time *with*.
   */
  drawStrikeLine(em: CanvasRenderingContext2D, pulse: number): void {
    const cam = this.stage.cam;
    const keys = this.deck.keys;
    if (!keys.length) return;
    const left = keys[0].geom;
    const right = keys[keys.length - 1].geom;
    em.save();
    em.globalCompositeOperation = 'lighter';
    em.globalAlpha = 0.18 + pulse * 0.3;
    em.strokeStyle = 'hsl(200 80% 72%)';
    em.lineWidth = 2.5;
    em.lineCap = 'round';
    tracePath(em, cam, [
      { x: left.cx - left.halfW, y: left.cy + 26 },
      { x: right.cx + right.halfW, y: right.cy + 26 },
    ], 8);
    em.stroke();
    em.restore();
  }
}
