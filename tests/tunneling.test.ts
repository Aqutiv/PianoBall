import { describe, it, expect } from 'vitest';
import { World } from '../src/physics/world';
import { makeBall, resetBallIds } from '../src/physics/ball';
import { polyline, segment, MATERIALS, resetColliderIds } from '../src/physics/colliders';
import { makeRng } from '../src/core/rng';

const W = 1024, H = 1408;

function boxWorld(rand: () => number) {
  resetColliderIds();
  resetBallIds();
  const world = new World({ width: W, height: H, maxSpeed: 60000, gravity: 2450 }, rand);
  // Deliberately thin walls: 1 unit of radius is the hardest case for a solver.
  world.add(polyline(
    [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }],
    1, { closed: true, material: MATERIALS.wall },
  ));
  world.reindex();
  return world;
}

describe('no tunneling', () => {
  it('keeps 400 randomly-launched balls inside a thin-walled box', () => {
    const rand = makeRng(0xc0ffee);
    const world = boxWorld(rand);
    const dt = 1 / 240;

    for (let trial = 0; trial < 400; trial++) {
      world.balls.length = 0;
      const b = makeBall(
        60 + rand() * (W - 120),
        60 + rand() * (H - 120),
        15,
      );
      // Speeds far beyond anything the game produces, including one full
      // table-length per step, which is where naive solvers fail.
      const ang = rand() * Math.PI * 2;
      const spd = 1000 + rand() * 45000;
      b.v.x = Math.cos(ang) * spd;
      b.v.y = Math.sin(ang) * spd;
      world.addBall(b);

      for (let i = 0; i < 240; i++) {
        world.step(dt);
        if (b.p.x < -1 || b.p.x > W + 1 || b.p.y < -1 || b.p.y > H + 1) {
          throw new Error(
            `escaped on trial ${trial} step ${i} at (${b.p.x.toFixed(1)}, ${b.p.y.toFixed(1)}) ` +
            `speed ${Math.hypot(b.v.x, b.v.y).toFixed(0)}`,
          );
        }
        expect(Number.isFinite(b.p.x) && Number.isFinite(b.p.y)).toBe(true);
      }
    }
  });

  it('cannot cross a single thin plate even at one plate-width per step', () => {
    resetColliderIds();
    resetBallIds();
    const world = new World({ width: 400, height: 400, maxSpeed: 200000, gravity: 0 });
    // A 0.5-unit-thick plate: thinner than the distance travelled in a step by
    // several orders of magnitude.
    world.add(segment({ x: 0, y: 200 }, { x: 400, y: 200 }, 0.5, { material: MATERIALS.wall }));
    world.reindex();

    for (let k = 0; k < 200; k++) {
      world.balls.length = 0;
      const b = makeBall(20 + k * 1.8, 100, 15);
      b.v.x = 0;
      b.v.y = 150000; // ~625 units per 240 Hz step
      world.addBall(b);
      for (let i = 0; i < 60; i++) world.step(1 / 240);
      expect(b.p.y).toBeLessThan(200);
    }
  });
});

describe('determinism', () => {
  function run(seed: number): { hash: number; positions: number[] } {
    const rand = makeRng(seed);
    const world = boxWorld(rand);
    for (let i = 0; i < 6; i++) {
      const b = makeBall(120 + i * 130, 300 + i * 90, 15);
      b.v.x = (i % 2 ? 1 : -1) * (600 + i * 210);
      b.v.y = 900 - i * 120;
      world.addBall(b);
    }
    for (let i = 0; i < 10000; i++) world.step(1 / 240);
    return {
      hash: world.hash(),
      positions: world.balls.flatMap((b) => [b.p.x, b.p.y, b.v.x, b.v.y]),
    };
  }

  it('produces bit-identical state for the same seed', () => {
    const a = run(1234);
    const b = run(1234);
    expect(a.hash).toBe(b.hash);
    expect(a.positions).toEqual(b.positions);
  });

  it('diverges for a different seed', () => {
    expect(run(1234).hash).not.toBe(run(9999).hash);
  });
});
