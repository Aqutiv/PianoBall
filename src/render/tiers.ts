import { DEFAULT_QUALITY, type RenderQuality } from './stage';

/**
 * The ladder the adaptive pass walks down when the frame will not fit.
 *
 * Two things were wrong with doing this as a chain of `if` branches that
 * mutated the running quality in place. Restoring meant remembering to put
 * every field back by hand, which is how the particle cap ended up being
 * restored on one rung and forgotten on the others; and "is anything shed?"
 * had to be answered by comparing what was running against what the player
 * asked for, which stops being true the moment the player turns the shed thing
 * back on themselves.
 *
 * So a rung is not an action, it is a *description*. The running quality is
 * derived from the preference and a single number, and giving everything back
 * is rung zero. Nothing can be forgotten because nothing is remembered.
 *
 * The order is cheapest-looking loss first. Everything above `renderScale` is
 * an effect coming off a picture that still has its full resolution; the last
 * two rungs are the picture itself getting smaller, which is why they are last.
 */
export interface Rung {
  /** What the player would say had changed, if they noticed. */
  readonly name: string;
  /** Applied on top of the preference. May only ever take away. */
  readonly shed: (q: RenderQuality) => void;
}

/** Live particles allowed once the ladder is off its top rung. */
export const SHED_PARTICLES = 500;

export const RUNGS: readonly Rung[] = [
  {
    // One full-frame `soft-light` fill. Advanced blend modes are the least
    // likely thing on this list to be accelerated on old integrated graphics,
    // and it is a cast over the picture rather than anything in it.
    name: 'colour grade',
    shed: (q) => { q.grade = false; },
  },
  {
    // Fill rate rather than geometry, and the last thing anyone notices going.
    name: 'floor light',
    shed: (q) => { q.pools = false; },
  },
  {
    name: 'bloom',
    shed: (q) => { q.bloom = false; q.particles = Math.min(q.particles, SHED_PARTICLES); },
  },
  {
    // Up to a few hundred additive rounded rects a frame, in the margins,
    // where the player is not looking while the table is busy.
    name: 'piano roll',
    shed: (q) => { q.roll = false; },
  },
  {
    name: 'shadows',
    shed: (q) => { q.shadows = false; },
  },
  {
    name: 'resolution',
    shed: (q) => { q.renderScale = Math.min(q.renderScale, 0.85); },
  },
  {
    name: 'resolution again',
    shed: (q) => { q.renderScale = Math.min(q.renderScale, 0.72); },
  },
];

/** The rung at which the sound starts shedding its own expensive effects. */
export const LITE_AUDIO_RUNG = 3;

export const MAX_RUNG = RUNGS.length;

export function clampRung(rung: number): number {
  if (!Number.isFinite(rung)) return 0;
  return Math.max(0, Math.min(MAX_RUNG, Math.round(rung)));
}

/**
 * What is actually drawn, given what the player asked for and how far down the
 * ladder the machine has been pushed.
 *
 * Rung zero is the preference exactly. Every rung above it only ever subtracts,
 * which is what lets a player turn something back on mid-shed and have it
 * appear the moment the ladder lets go of it -- and what stops the ladder from
 * ever handing back something the player switched off themselves.
 */
export function derive(pref: RenderQuality, rung: number): RenderQuality {
  const q: RenderQuality = { ...DEFAULT_QUALITY, ...pref };
  const n = clampRung(rung);
  for (let i = 0; i < n; i++) RUNGS[i].shed(q);
  return q;
}

/** The backing-store scale a given rung runs at. */
export function scaleAtRung(pref: RenderQuality, rung: number): number {
  return derive(pref, rung).renderScale;
}

/** A name for the rung, for the debug readout and the settings line. */
export function rungLabel(rung: number): string {
  const n = clampRung(rung);
  if (n === 0) return 'full';
  return RUNGS.slice(0, n).map((r) => r.name).join(', ');
}
