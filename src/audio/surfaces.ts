/**
 * The table's own sounds: what each surface rings like, and what the machine
 * does when it moves.
 *
 * A ball hitting something used to be one slice of bandpassed noise per
 * material. A real surface rings at its modes — a rubber post has two low
 * ones and damps them at once, a steel post has several high ones and lets
 * them go on — so a surface here is a list of modes, each a ratio to the
 * lowest, a level, and how long it rings, and the engine puts a burst of
 * noise through a resonator for each. The mechanisms are the same few
 * primitives — a thump, a click, a sweep, a surface rung — put together.
 *
 * Nothing here touches Web Audio, which is what makes it testable and what
 * keeps the engine's part one routine per kind rather than one per sound.
 */
import type { SoundTag } from '../physics/colliders';

/** One mode of a surface: its ratio to the base, its level, and seconds to fall sixty decibels. */
export type Mode = readonly [ratio: number, gain: number, t60: number];

export interface Thump {
  freq: number;
  /** Multiple of `freq` the pitch starts at before falling onto it. */
  drop: number;
  decay: number;
  gain: number;
  delay?: number;
}

export interface Click {
  freq: number;
  q: number;
  decay: number;
  gain: number;
  delay?: number;
}

export interface Sweep {
  from: number;
  to: number;
  /** Seconds the pitch takes to arrive, and seconds the sound takes to go. */
  time: number;
  decay: number;
  gain: number;
}

export interface SurfaceSpec {
  /** Hz of the lowest mode at half energy. A harder hit pushes the bank up a few percent. */
  base: number;
  modes: readonly Mode[];
  /** Milliseconds of excitation at full energy. Shorter is clickier. */
  burst: number;
  /** Lowpass on the excitation at the softest hit, and at the hardest, in Hz. */
  bright: number;
  velBright: number;
  /** A low body under the ring, for the soft things. */
  thump?: Thump;
  gain: number;
  /** Whether the surface also rings at the note of the element it belongs to. */
  tuned?: boolean;
}

/** Largest Q a resonator is asked for: past this the biquad's numbers go bad. */
export const MAX_Q = 400;

/**
 * The Q of a resonator that rings for this long at this frequency. A second-
 * order resonator falls sixty decibels in about 2.2 Q / f seconds.
 */
export function modeQ(freq: number, t60: number): number {
  return Math.min(MAX_Q, (t60 * freq) / 2.2);
}

export const SURFACES: Record<SoundTag, SurfaceSpec> = {
  wood: {
    base: 210, burst: 4, bright: 1800, velBright: 5000, gain: 0.5,
    modes: [[1, 1, 0.06], [1.9, 0.6, 0.045], [3.3, 0.35, 0.03], [4.7, 0.2, 0.02]],
    thump: { freq: 70, drop: 1.8, decay: 0.06, gain: 0.5 },
  },
  rail: {
    base: 1200, burst: 3, bright: 3000, velBright: 9000, gain: 0.55, tuned: true,
    modes: [[1, 1, 0.12], [2.76, 0.5, 0.09], [5.4, 0.3, 0.06], [8.9, 0.15, 0.04]],
  },
  metal: {
    base: 2400, burst: 2.5, bright: 4000, velBright: 12000, gain: 0.5, tuned: true,
    modes: [[1, 1, 0.25], [1.58, 0.6, 0.18], [2.4, 0.4, 0.12], [3.8, 0.2, 0.08]],
  },
  rubber: {
    base: 140, burst: 6, bright: 900, velBright: 2600, gain: 0.6,
    modes: [[1, 1, 0.04], [1.6, 0.5, 0.025]],
    thump: { freq: 55, drop: 1.5, decay: 0.05, gain: 0.7 },
  },
  plastic: {
    base: 900, burst: 3, bright: 2500, velBright: 7000, gain: 0.8,
    modes: [[1, 1, 0.035], [2.3, 0.5, 0.025], [4.1, 0.3, 0.015]],
  },
  bumper: {
    base: 380, burst: 4, bright: 1600, velBright: 5000, gain: 0.6,
    modes: [[1, 1, 0.12], [2, 0.5, 0.07], [3.2, 0.3, 0.04]],
    thump: { freq: 90, drop: 2, decay: 0.09, gain: 0.6 },
  },
  key: {
    base: 480, burst: 5, bright: 1400, velBright: 4000, gain: 0.45,
    modes: [[1, 1, 0.04], [2.2, 0.4, 0.02]],
    thump: { freq: 80, drop: 1.4, decay: 0.04, gain: 0.4 },
  },
  glass: {
    base: 3200, burst: 2, bright: 5000, velBright: 14000, gain: 0.45, tuned: true,
    modes: [[1, 1, 0.4], [2.32, 0.6, 0.3], [4.25, 0.3, 0.2]],
  },
  silent: { base: 400, burst: 1, bright: 1000, velBright: 1000, gain: 0, modes: [] },
};

export type MechName =
  | 'flipper' | 'plunger' | 'solenoid' | 'drop' | 'spinner' | 'switch'
  | 'trough' | 'kickback' | 'ballclick';

export const MECH_NAMES: readonly MechName[] =
  ['flipper', 'plunger', 'solenoid', 'drop', 'spinner', 'switch', 'trough', 'kickback', 'ballclick'];

export interface MechSpec {
  thump?: Thump;
  click?: Click;
  /** A longer, looser click: the ball rolling into a trough. */
  rattle?: Click;
  sweep?: Sweep;
  /** A surface rung as part of it, at this fraction of a full-energy hit. */
  surface?: { tag: SoundTag; energy: number };
}

export const MECHS: Record<MechName, MechSpec> = {
  /** A key throwing the ball: the solenoid's thump, its click, and the rubber on the ball. */
  flipper: {
    thump: { freq: 70, drop: 2.2, decay: 0.07, gain: 0.5 },
    click: { freq: 1500, q: 3, decay: 0.005, gain: 0.35 },
    surface: { tag: 'rubber', energy: 0.6 },
  },
  /** The coil under a bumper or a sling firing. */
  solenoid: {
    thump: { freq: 60, drop: 2.5, decay: 0.06, gain: 0.5 },
    click: { freq: 1200, q: 2, decay: 0.004, gain: 0.3 },
  },
  /** The spring letting go: a twang sliding up, and the latch. */
  plunger: {
    sweep: { from: 120, to: 420, time: 0.08, decay: 0.25, gain: 0.35 },
    click: { freq: 2200, q: 2, decay: 0.003, gain: 0.25 },
  },
  /** A drop target: the strike, and the target landing forty milliseconds later. */
  drop: {
    click: { freq: 1800, q: 2, decay: 0.006, gain: 0.35 },
    thump: { freq: 160, drop: 1.3, decay: 0.12, gain: 0.35, delay: 0.04 },
  },
  /** One tick of a spinner's blade past its switch. */
  spinner: { click: { freq: 3000, q: 4, decay: 0.008, gain: 0.3 } },
  /** A leaf switch closing under a rollover. Quiet. */
  switch: { click: { freq: 4000, q: 2, decay: 0.002, gain: 0.12 } },
  /** The ball dropping into the trough and rattling to rest. */
  trough: {
    thump: { freq: 110, drop: 1.4, decay: 0.15, gain: 0.5 },
    rattle: { freq: 600, q: 1, decay: 0.25, gain: 0.25, delay: 0.06 },
  },
  /** The ball saver: a solenoid and a spring throwing it back. */
  kickback: {
    thump: { freq: 60, drop: 2.5, decay: 0.06, gain: 0.5 },
    click: { freq: 1200, q: 2, decay: 0.004, gain: 0.3 },
    sweep: { from: 200, to: 600, time: 0.06, decay: 0.15, gain: 0.3 },
  },
  /** Two balls meeting: a click, and steel ringing. */
  ballclick: {
    click: { freq: 5000, q: 2, decay: 0.003, gain: 0.3 },
    surface: { tag: 'metal', energy: 0.5 },
  },
};

/** A one-shot the budget knows about: when it will be over, how much it matters, how to cut it. */
interface Shot {
  until: number;
  prio: number;
  cut(): void;
}

/**
 * How many of the table's one-shots may sound at once.
 *
 * A multiball against the rubbers can ask for dozens of hits a second, and
 * every one of them is a handful of resonators. Past the budget the least
 * important of what is already sounding — the lowest priority, and the
 * oldest of those — is cut short to make room, and a newcomer that matters
 * less than everything sounding is dropped instead. Element strikes are
 * music and never come here; this is for the machine.
 */
export class ShotBudget {
  private shots: Shot[] = [];

  constructor(public max: number) {}

  get size(): number { return this.shots.length; }

  /** Room for a shot of this priority, cutting something if it has to. False means play nothing. */
  admit(now: number, prio: number, until: number, cut: () => void): boolean {
    this.prune(now);
    if (this.shots.length >= this.max) {
      let victim = -1;
      for (let i = 0; i < this.shots.length; i++) {
        if (victim < 0 || this.shots[i].prio < this.shots[victim].prio) victim = i;
      }
      if (victim < 0 || this.shots[victim].prio >= prio) return false;
      this.shots[victim].cut();
      this.shots.splice(victim, 1);
    }
    this.shots.push({ until, prio, cut });
    return true;
  }

  /**
   * Cut every shot, whether it is sounding now or was placed ahead.
   *
   * A one-shot is fire-and-forget: the table hands the engine a bonus count a
   * second into the future and keeps no hold on it. This is the only way back
   * to silence for what has already been written onto the clock.
   */
  cutAll(): void {
    for (const s of this.shots) s.cut();
    this.shots.length = 0;
  }

  private prune(now: number): void {
    let keep = 0;
    for (const s of this.shots) if (s.until > now) this.shots[keep++] = s;
    this.shots.length = keep;
  }
}
