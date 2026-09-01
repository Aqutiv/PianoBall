import { type Vec2, v2 } from './vec2';

export interface Ball {
  id: number;
  p: Vec2;
  v: Vec2;
  /** Position at the start of the current physics step, for render interpolation. */
  prev: Vec2;
  r: number;
  mass: number;
  /** Cosmetic roll: driven by tangential contact speed, never fed back into physics. */
  angle: number;
  spin: number;
  alive: boolean;
  /** Seconds since spawn. */
  age: number;
  /** Seconds spent below the "is it stuck?" speed threshold. */
  slowFor: number;
  /** Colliders currently overlapped, so sensors can fire enter/exit exactly once. */
  sensors: Set<number>;
  /** Cheap guard against double-resolving the same surface inside one step. */
  lastColliderId: number;
  /** Grace period after spawn/launch during which the ball cannot drain. */
  safeFor: number;
  /**
   * The note of the key that last threw it, so the table can hear the
   * interval it makes with whatever it strikes. Null until something has.
   */
  note: number | null;
}

let nextBallId = 1;
export const resetBallIds = () => { nextBallId = 1; };

export function makeBall(x: number, y: number, r = 19, vx = 0, vy = 0): Ball {
  return {
    id: nextBallId++,
    p: v2(x, y),
    v: v2(vx, vy),
    prev: v2(x, y),
    r,
    mass: 1,
    angle: 0,
    spin: 0,
    alive: true,
    age: 0,
    slowFor: 0,
    sensors: new Set<number>(),
    lastColliderId: -1,
    safeFor: 0,
    note: null,
  };
}
