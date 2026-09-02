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

/** The note everything is measured from. Middle C. */
const C4 = 60;

/** What the old linear curve reaches at full velocity, and what the decibel curve is pinned to. */
const FULL_PEAK = 0.36;

/**
 * The loudness of a strike, before the voice's own trim.
 *
 * The curve the app grew up with is a straight line from 0.06 to 0.36, which
 * is a range of sixteen decibels — a real instrument has thirty or more, and
 * the difference between the two is most of what "touch" means. A voice that
 * names a range in decibels gets an exponential curve spanning it; one that
 * does not keeps the line.
 */
export function velocityPeak(v: number, velDb?: number): number {
  if (velDb === undefined) return 0.06 + v * 0.3;
  return FULL_PEAK * Math.pow(10, (-velDb * (1 - v)) / 20);
}

/**
 * How a voice changes across the keyboard, as exponents per octave from C4.
 *
 * Every factor is `2^(exponent · octaves)`: a decay of -0.5 halves a note's
 * length two octaves up, a brightness of 0.3 opens the filter going up. Left
 * out, a factor is one — which is every voice as it was before there was
 * tracking to give it.
 */
export interface KeyTrack {
  decay?: number;
  release?: number;
  bright?: number;
  level?: number;
  noise?: number;
}

export interface KeyFactors {
  decay: number;
  release: number;
  bright: number;
  level: number;
  noise: number;
}

/** No tracking at all: the factors a voice without any gets. */
export const NO_TRACK: KeyFactors = { decay: 1, release: 1, bright: 1, level: 1, noise: 1 };

export function keyFactors(track: KeyTrack | undefined, note: number): KeyFactors {
  if (!track) return NO_TRACK;
  const octaves = (note - C4) / 12;
  const f = (exp: number | undefined) => (exp ? Math.pow(2, exp * octaves) : 1);
  return {
    decay: f(track.decay),
    release: f(track.release),
    bright: f(track.bright),
    level: f(track.level),
    noise: f(track.noise),
  };
}

/**
 * Stretch tuning, in cents: the piano's octaves are wider than pure ones,
 * sharp going up and flat going down, and by more the further out. Quadratic
 * in the distance from the middle, which is the shape of the real curve
 * near enough.
 */
export function stretchCents(stretch: number | undefined, note: number): number {
  if (!stretch) return 0;
  const d = (note - C4) / 12;
  return stretch * Math.sign(d) * d * d;
}

/**
 * The detunes of a unison, in cents, about the pitch.
 *
 * Two voices straddle it; three put one on it. Either way they sum to
 * nothing, so the note is still the note and only its width has changed.
 */
export function unisonDetunes(voices: number, cents: number): number[] {
  if (voices <= 1 || cents === 0) return [0];
  if (voices === 2) return [-cents / 2, cents / 2];
  return [-cents, 0, cents];
}

/** Below this the pedal is up; from `PEDAL_DOWN` it holds outright. Between, it is half-pedalling. */
export const PEDAL_UP = 0.25;
export const PEDAL_DOWN = 0.75;
/** Seconds a half-pedalled release stretches to at most, on top of the voice's own. */
const HALF_PEDAL_STRETCH = 2.5;

/**
 * How long a note takes to go once the key is up, for a pedal this far down.
 *
 * Up, the note has its own release. Fully down, it does not go at all —
 * infinity, which the caller reads as "hold". Between the two the dampers
 * are only brushing the strings, and the note fades slowly rather than
 * stopping: the further down, the slower.
 */
export function pedalRelease(base: number, pedal: number): number {
  if (pedal >= PEDAL_DOWN) return Infinity;
  if (pedal < PEDAL_UP) return base;
  return base + ((pedal - PEDAL_UP) / (PEDAL_DOWN - PEDAL_UP)) * HALF_PEDAL_STRETCH;
}

/** How much of the soundboard is heard for a pedal this far down: a little always, all of it at the floor. */
export function bodyMixFor(pedal: number): number {
  const p = Math.max(0, Math.min(1, pedal));
  return 0.35 + 0.65 * p;
}

/** The small ways one strike differs from the last. Multipliers, except the cents. */
export interface Humanized {
  detune: number;
  attack: number;
  level: number;
  bright: number;
}

/** No drift at all. Returned by reference, so a spec that asks for none costs nothing. */
export const EXACT: Humanized = { detune: 0, attack: 1, level: 1, bright: 1 };

/**
 * A little drift, scaled by `amount`. Nobody plays a note twice the same
 * way: the pitch, the attack and the level all move a hair, and it is the
 * absence of that which makes repeated notes sound like a machine.
 */
export function humanize(rng: () => number, amount: number): Humanized {
  if (amount <= 0) return EXACT;
  const r = () => (rng() * 2 - 1) * amount;
  return { detune: r() * 2.5, attack: 1 + r() * 0.15, level: 1 + r() * 0.06, bright: 1 + r() * 0.05 };
}
