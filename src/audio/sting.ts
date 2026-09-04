import type { AudioEngine, Scheduled } from './engine';
import type { DrumVoice } from './drums';

/**
 * A short figure placed on the audio clock, and the one handle that takes back
 * whatever has not sounded yet.
 *
 * Written as data rather than as a sequence of calls so that what a screen says
 * musically can be decided, and tested, without an audio context. The two modes
 * that use this both build their figure from a tonic they already know; only
 * `play` needs the graph.
 *
 * The handle matters more than it looks. `mallet` sits outside the engine's
 * voice-stealing budget on purpose — a cadence should not be swallowed by
 * whatever else happens to be sounding — which also means nothing else will
 * ever stop it. A results screen dismissed a beat into its own cadence would
 * otherwise keep playing it over the next tune's count-in, in the last tune's
 * instrument. `PinballAudio` learned this about its flourish; this is that
 * lesson with somewhere to live.
 */

export interface StingNote {
  note: number;
  /** Seconds from the start of the sting. */
  at: number;
  gain: number;
  pan: number;
  /** 0..1, how open the strike is. Falls through a deflating figure. */
  bright: number;
}

export interface StingHit {
  voice: DrumVoice;
  at: number;
  gain: number;
}

export interface Sting {
  notes: readonly StingNote[];
  hits?: readonly StingHit[];
}

/** How long a sting runs for, so a handle knows when it has nothing left. */
export function stingLength(sting: Sting): number {
  let end = 0;
  for (const n of sting.notes) end = Math.max(end, n.at);
  for (const h of sting.hits ?? []) end = Math.max(end, h.at);
  return end;
}

const NOTHING: Scheduled = { cancel() {} };

/**
 * Place a sting on the clock, starting `delay` seconds from now.
 *
 * Silent when the engine is not running, which is the honest answer: an audio
 * context that never started has no clock to place anything on.
 */
export function playSting(engine: AudioEngine, sting: Sting, delay = 0): Scheduled {
  if (!engine.running) return NOTHING;
  const start = engine.now + Math.max(0, delay);
  const placed: Scheduled[] = [];
  for (const n of sting.notes) {
    placed.push(engine.mallet(n.note, n.gain, n.pan, n.bright, start + n.at));
  }
  for (const h of sting.hits ?? []) {
    placed.push(engine.drum(h.voice, h.gain, start + h.at));
  }
  return {
    cancel() {
      for (const p of placed) p.cancel();
      placed.length = 0;
    },
  };
}
