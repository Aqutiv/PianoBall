/**
 * The arithmetic of a voice, kept apart from the graph that plays it.
 *
 * Everything here is a pure function of numbers, which is what lets the
 * node-only test suite reach it: the engine calls these and then builds
 * whatever nodes the answers call for.
 */

/**
 * A small deterministic random source, seeded.
 *
 * Rooms are rendered from noise, and a room that came out different on every
 * load would be a different room every time the game was opened. Anything the
 * tests need to assert on is drawn from one of these rather than from
 * `Math.random`. (mulberry32.)
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
