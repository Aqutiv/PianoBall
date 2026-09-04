import { describe, expect, it } from 'vitest';
import { DEFAULT_QUALITY, type RenderQuality } from '../src/render/stage';
import { MAX_RUNG, RUNGS, clampRung, derive, rungLabel } from '../src/render/tiers';

/**
 * The ladder exists to make "give everything back" a single number rather than
 * a list of fields somebody has to remember. The invariant that buys that is
 * narrow and worth pinning: a rung may only ever take away.
 */

const ON: RenderQuality = { ...DEFAULT_QUALITY };
/** A player who has already turned several things off by hand. */
const PICKY: RenderQuality = {
  ...DEFAULT_QUALITY,
  bloom: false,
  pools: false,
  particles: 300,
  labels: false,
  renderScale: 0.9,
};

describe('quality tiers', () => {
  it('is the preference exactly at rung zero', () => {
    expect(derive(ON, 0)).toEqual(ON);
    expect(derive(PICKY, 0)).toEqual(PICKY);
  });

  it('never turns on something the player turned off', () => {
    for (let r = 0; r <= MAX_RUNG; r++) {
      const q = derive(PICKY, r);
      expect(q.bloom).toBe(false);
      expect(q.pools).toBe(false);
      expect(q.labels).toBe(false);
      expect(q.particles).toBeLessThanOrEqual(PICKY.particles);
      expect(q.renderScale).toBeLessThanOrEqual(PICKY.renderScale);
    }
  });

  it('only ever subtracts as it descends', () => {
    for (let r = 1; r <= MAX_RUNG; r++) {
      const prev = derive(ON, r - 1);
      const next = derive(ON, r);
      for (const key of Object.keys(next) as (keyof RenderQuality)[]) {
        const a = prev[key], b = next[key];
        if (typeof a === 'boolean') expect(b === a || (a && !b)).toBe(true);
        // `tableSize` is a layout preference, not a cost, and is left alone.
        else if (key !== 'tableSize') expect(b as number).toBeLessThanOrEqual(a as number);
      }
    }
  });

  it('gives every rung something to actually do', () => {
    for (let r = 1; r <= MAX_RUNG; r++) {
      expect(derive(ON, r)).not.toEqual(derive(ON, r - 1));
    }
  });

  it('ends up at the leanest picture, and stays there past the end', () => {
    const last = derive(ON, MAX_RUNG);
    expect(last.bloom).toBe(false);
    expect(last.shadows).toBe(false);
    expect(last.grade).toBe(false);
    expect(last.roll).toBe(false);
    expect(last.renderScale).toBeLessThan(1);
    expect(derive(ON, MAX_RUNG + 5)).toEqual(last);
  });

  it('clamps a rung that came from a corrupted stored setting', () => {
    expect(clampRung(-3)).toBe(0);
    expect(clampRung(NaN)).toBe(0);
    expect(clampRung(1e9)).toBe(MAX_RUNG);
    expect(clampRung(2.4)).toBe(2);
  });

  it('names what it has given up', () => {
    expect(rungLabel(0)).toBe('full');
    expect(rungLabel(1)).toBe(RUNGS[0].name);
    expect(rungLabel(MAX_RUNG)).toContain(RUNGS[MAX_RUNG - 1].name);
  });
});
