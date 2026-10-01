import { clamp01 } from '../core/math';
import type { ScorePop } from '../game/scoring';
import type { Projector } from './project';
import { tone } from './palette';

/** How a set of pops is drawn, beyond where they were scored. */
export interface PopStyle {
  /** A colour for a pop, or null to use its tone. */
  color?: (pop: ScorePop) => string | null;
  /** How far a pop climbs over its life, in table units. Zero holds it still. */
  rise?: number;
}

/** Seconds a pop is on screen. `Scoring` drops them a moment later. */
const LIFE = 1.2;

/**
 * Score pops: the points a hit was worth, with its word above them when it has
 * one, climbing away from where it was scored and fading out.
 *
 * Lifted out of the pinball renderer so PlayTune can show its verdicts the same
 * way; the projector is what places them on the raked table or on the flat
 * music stage.
 */
export function drawPops(
  ctx: CanvasRenderingContext2D, proj: Projector, pops: readonly ScorePop[], now: number, o: PopStyle = {},
): void {
  const p = { x: 0, y: 0 };
  const climb = o.rise ?? 70;
  for (const pop of pops) {
    const age = clamp01((now - pop.at) / LIFE);
    if (age >= 1) continue;
    proj.project(pop.x, pop.y, 30 + age * climb, p);
    const scale = proj.scaleAt(pop.x, pop.y);
    ctx.save();
    ctx.globalAlpha = 1 - age * age;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = o.color?.(pop) ?? tone(pop.tone * 360, 92, 78);
    // Rounded for the same reason `Stage.label` rounds: a pop rises through a
    // continuum of scales, and these are the calls that spike hardest — there
    // can be dozens of them in a frame mid-combo.
    ctx.font = `700 ${Math.round(Math.max(11, (pop.label ? 20 : 17) * scale))}px ui-sans-serif, system-ui, sans-serif`;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 8;
    ctx.fillText(pop.label || pop.amount.toLocaleString(), p.x, p.y);
    if (pop.label) {
      ctx.font = `600 ${Math.round(Math.max(9, 13 * scale))}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillText(pop.amount.toLocaleString(), p.x, p.y + 18 * scale);
    }
    ctx.restore();
  }
}
