import { describe, it, expect } from 'vitest';
import { sweepVsDisc, sweepVsRing, sweepVsCapsule, sweepVsArc, type SweepHit } from '../src/physics/sweep';

const out = (): SweepHit => ({ t: 0, nx: 0, ny: 0 });

describe('swept circle vs disc', () => {
  it('finds the exact entry time of a head-on approach', () => {
    const o = out();
    // Ball r=1 at x=-10 moving +x at 10/s toward a disc r=2 at origin.
    // Surfaces meet when the centres are 3 apart, i.e. at x=-3, so t=0.7.
    expect(sweepVsDisc(-10, 0, 10, 0, 1, 0, 0, 2, 1, o)).toBe(true);
    expect(o.t).toBeCloseTo(0.7, 10);
    expect(o.nx).toBeCloseTo(-1, 10);
    expect(o.ny).toBeCloseTo(0, 10);
  });

  it('misses when the closest approach stays outside the combined radius', () => {
    const o = out();
    expect(sweepVsDisc(-10, 3.01, 10, 0, 1, 0, 0, 2, 1, o)).toBe(false);
  });

  it('grazes when the closest approach is exactly tangent', () => {
    const o = out();
    // Offset exactly 3 => a single tangent root at t = 1.0.
    expect(sweepVsDisc(-10, 3, 10, 0, 1, 0, 0, 2, 1.2, o)).toBe(true);
    expect(o.t).toBeCloseTo(1.0, 6);
    expect(o.ny).toBeCloseTo(1, 6);
  });

  it('ignores an existing overlap that is already separating', () => {
    const o = out();
    expect(sweepVsDisc(2, 0, 10, 0, 1, 0, 0, 2, 1, o)).toBe(false);
  });

  it('reports t=0 for an overlap that is still closing', () => {
    const o = out();
    expect(sweepVsDisc(2.5, 0, -10, 0, 1, 0, 0, 2, 1, o)).toBe(true);
    expect(o.t).toBe(0);
    expect(o.nx).toBeCloseTo(1, 10);
  });
});

describe('swept circle vs containing ring', () => {
  it('hits the inner wall on the way out', () => {
    const o = out();
    // Ball r=1 at centre of a ring r=10 moving +x: contact when centre reaches x=9.
    expect(sweepVsRing(0, 0, 10, 0, 1, 0, 0, 10, 1, o)).toBe(true);
    expect(o.t).toBeCloseTo(0.9, 10);
    expect(o.nx).toBeCloseTo(-1, 10);
  });

  it('does nothing when the ring is smaller than the ball', () => {
    const o = out();
    expect(sweepVsRing(0, 0, 10, 0, 5, 0, 0, 4, 1, o)).toBe(false);
  });
});

describe('swept circle vs capsule', () => {
  it('hits the flat side within the axial range', () => {
    const o = out();
    // Segment along y=0 from x=-5..5 with radius 1; ball r=1 falling from y=10.
    // Contact when the centre reaches y=2, so t=0.8 at speed 10.
    expect(sweepVsCapsule(0, 10, 0, -10, 1, -5, 0, 5, 0, 1, false, 0, 0, 1, o)).toBe(true);
    expect(o.t).toBeCloseTo(0.8, 10);
    expect(o.ny).toBeCloseTo(1, 10);
  });

  it('falls back to the end cap when past the axial range', () => {
    const o = out();
    // Aimed at x=5 (the b endpoint) from above: the cylindrical test is out of
    // range there, so the rounded cap has to catch it.
    expect(sweepVsCapsule(5, 10, 0, -10, 1, -5, 0, 5, 0, 1, false, 0, 0, 1, o)).toBe(true);
    expect(o.t).toBeCloseTo(0.8, 10);
    expect(o.ny).toBeCloseTo(1, 6);
  });

  it('misses just beyond the end cap', () => {
    const o = out();
    expect(sweepVsCapsule(7.01, 10, 0, -10, 1, -5, 0, 5, 0, 1, false, 0, 0, 1, o)).toBe(false);
  });

  it('degenerates to a disc when the segment has zero length', () => {
    const o = out();
    expect(sweepVsCapsule(-10, 0, 10, 0, 1, 0, 0, 0, 0, 2, false, 0, 0, 1, o)).toBe(true);
    expect(o.t).toBeCloseTo(0.7, 10);
  });

  it('honours one-sided gates', () => {
    const o = out();
    const fn = { x: 0, y: 1 }; // front face points +y
    // From above (front side) it collides.
    expect(sweepVsCapsule(0, 10, 0, -10, 1, -5, 0, 5, 0, 1, true, fn.x, fn.y, 1, o)).toBe(true);
    // From below (back side) it passes straight through.
    expect(sweepVsCapsule(0, -10, 0, 10, 1, -5, 0, 5, 0, 1, true, fn.x, fn.y, 1, o)).toBe(false);
  });
});

describe('swept circle vs arc', () => {
  const HALF = Math.PI; // upper half circle, angles 0..PI

  it('hits the outer wall inside the angular sweep', () => {
    const o = out();
    // Arc radius 10, half-thickness 1, upper half. Ball r=1 dropping onto the top.
    // Outer surface is at 11, contact when centre reaches y=12 => t=0.8 from y=20.
    expect(sweepVsArc(0, 20, 0, -10, 1, 0, 0, 10, 0, HALF, 1, true, 1, o)).toBe(true);
    expect(o.t).toBeCloseTo(0.8, 10);
    expect(o.ny).toBeCloseTo(1, 10);
  });

  it('passes through where the arc does not exist', () => {
    const o = out();
    // Same arc, approaching from below where the sweep (0..PI) has no material,
    // and far enough from the end caps to miss them.
    expect(sweepVsArc(0, -20, 0, 10, 1, 0, 0, 10, 0, HALF, 1, true, 0.5, o)).toBe(false);
  });

  it('hits the inner wall from inside the loop', () => {
    const o = out();
    // Inner surface at radius 9; a ball r=1 at the centre contacts at 8 units out.
    expect(sweepVsArc(0, 0, 0, 10, 1, 0, 0, 10, 0, HALF, 1, true, 1, o)).toBe(true);
    expect(o.t).toBeCloseTo(0.8, 10);
    expect(o.ny).toBeCloseTo(-1, 10);
  });

  it('catches the rounded end cap of the arc', () => {
    const o = out();
    // End cap sits at (10, 0) with radius 1; ball r=1 approaching along -x from x=20.
    expect(sweepVsArc(20, 0, -10, 0, 1, 0, 0, 10, 0, HALF, 1, true, 1, o)).toBe(true);
    expect(o.t).toBeCloseTo(0.8, 6);
    expect(o.nx).toBeCloseTo(1, 6);
  });
});
