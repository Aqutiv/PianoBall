import { clamp, clamp01 } from '../core/math';
import { buildKeyLayout, DEFAULT_KEYBED, type KeyGeom, type KeybedLayout } from './keyLayout';

/** How a key moves under the finger. Shared by every mode that draws a piano. */
export interface KeyTravel {
  /** Extension of the key at the softest and hardest usable press. */
  minTravel: number;
  maxTravel: number;
  /** Time for a key to reach full extension. Short: this is the whole feel. */
  attack: number;
  release: number;
}

export const DEFAULT_TRAVEL: KeyTravel = {
  minTravel: 7,
  maxTravel: 23,
  attack: 0.024,
  release: 0.085,
};

/** A key of the on-screen piano, and what it is currently doing. */
export interface KeyLit {
  geom: KeyGeom;
  /** Current extension towards the playfield, in table units. */
  pos: number;
  /** Extension rate, table units/s. */
  rate: number;
  /** Extension the current press is heading for. */
  peak: number;
  down: boolean;
  /** Normalised velocity of the press that is currently sounding, 0..1. */
  velocity: number;
  /** Seconds since the last note-on. */
  since: number;
  /** Deck time of the last note-on; drives the glow. */
  litAt: number;
}

/** A key in its resting state. Subclasses build their own on top of this. */
function baseKey(geom: KeyGeom): KeyLit {
  return { geom, pos: 0, rate: 0, peak: 0, down: false, velocity: 0, since: 99, litAt: -99 };
}

/**
 * The on-screen piano: geometry, press envelope and hit-testing.
 *
 * This is everything about the keys that has nothing to do with pinball, so
 * that a mode with no physics at all still gets a real keyboard. The pinball
 * `Keybed` extends it and adds the paddle each key drives.
 *
 * Construction is two steps — `new` then `build()` — because a subclass has to
 * be able to set up its own state (a physics world, say) before the first key
 * is made, and JavaScript will not let it assign fields before `super()` runs.
 */
export class KeyDeck<K extends KeyLit = KeyLit> {
  readonly keys: K[] = [];
  readonly byNote = new Map<number, K>();
  layout: KeybedLayout = { ...DEFAULT_KEYBED };
  travel: KeyTravel;
  /** Local clock in seconds, advanced by `update`. */
  time = 0;

  constructor(travel: Partial<KeyTravel> = {}) {
    this.travel = { ...DEFAULT_TRAVEL, ...travel };
  }

  /** Lay out a contiguous run of MIDI notes. Safe to call again to rebuild. */
  build(baseNote: number, count: number, layout: Partial<KeybedLayout> = this.layout): void {
    for (const k of this.keys) this.onRemove(k);
    this.keys.length = 0;
    this.byNote.clear();
    const built = buildKeyLayout(baseNote, count, layout);
    this.layout = built.layout;
    for (const geom of built.keys) {
      const k = this.makeKey(geom);
      this.keys.push(k);
      this.byNote.set(geom.note, k);
      this.place(k);
    }
  }

  /** Rebuild for a different controller range, keeping the current layout. */
  remap(baseNote: number, count: number): void {
    this.build(baseNote, count, this.layout);
  }

  // ------------------------------------------------------------- hooks ---

  protected makeKey(geom: KeyGeom): K {
    return baseKey(geom) as K;
  }

  /** A key is about to be discarded by a rebuild. */
  protected onRemove(_k: K): void { /* nothing to release by default */ }

  /** The key's extension changed; anything tracking it should follow. */
  protected place(_k: K): void { /* geometry alone needs no placement */ }

  /** A fresh press landed on this key. */
  protected onPress(_k: K): void { /* nothing to reset by default */ }

  // ------------------------------------------------------------ playing ---

  noteOn(note: number, velocity01: number): K | null {
    const k = this.byNote.get(note);
    if (!k) return null;
    k.down = true;
    k.velocity = clamp01(velocity01);
    k.since = 0;
    k.litAt = this.time;
    const t = this.travel;
    k.peak = t.minTravel + (t.maxTravel - t.minTravel) * k.velocity;
    this.onPress(k);
    return k;
  }

  noteOff(note: number): void {
    const k = this.byNote.get(note);
    if (k) k.down = false;
  }

  allOff(): void {
    for (const k of this.keys) { k.down = false; k.peak = 0; }
  }

  /** Advance the key envelopes. */
  update(dt: number): void {
    this.time += dt;
    const t = this.travel;
    for (const k of this.keys) {
      k.since = Math.min(k.since + dt, 99);
      let next: number;
      if (k.down) {
        if (k.since < t.attack) {
          // Ease-out: fastest at the very start, which is what throws the ball.
          const u = k.since / t.attack;
          next = k.peak * (1 - (1 - u) * (1 - u));
        } else {
          next = k.peak;
        }
      } else {
        next = k.pos * Math.max(0, 1 - dt / t.release);
        if (next < 0.01) next = 0;
      }
      k.rate = dt > 0 ? (next - k.pos) / dt : 0;
      k.pos = next;
      this.place(k);
    }
  }

  // ------------------------------------------------------------ picking ---

  /** Which key, if any, sits under a table-space point. For touch input. */
  pick(x: number, y: number): K | null {
    let best: K | null = null;
    let bestD = Infinity;
    // Black keys first: they sit in front and should win ties.
    for (const pass of [true, false]) {
      for (const k of this.keys) {
        if (k.geom.black !== pass) continue;
        const g = k.geom;
        const dx = x - g.cx, dy = y - g.cy;
        const along = dx * Math.cos(g.tilt) + dy * Math.sin(g.tilt);
        const out = dx * g.nx + dy * g.ny;
        if (Math.abs(along) > g.drawHalfW + 2) continue;
        if (out > 16 || out < -g.depth) continue;
        const d = Math.abs(along);
        if (d < bestD) { bestD = d; best = k; }
      }
      if (best) return best;
    }
    return null;
  }

  /** Fraction across a key's face for a table-space point, -1..1. */
  offsetOn(k: K, x: number, y: number): number {
    const g = k.geom;
    const along = (x - g.cx) * Math.cos(g.tilt) + (y - g.cy) * Math.sin(g.tilt);
    return clamp(along / g.halfW, -1, 1);
  }

  /** Highest and lowest notes currently mapped. */
  get range(): { low: number; high: number } {
    return {
      low: this.keys.length ? this.keys[0].geom.note : 0,
      high: this.keys.length ? this.keys[this.keys.length - 1].geom.note : 0,
    };
  }
}
