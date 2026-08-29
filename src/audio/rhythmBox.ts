import { clamp01 } from '../core/math';
import type { DrumVoice } from './drums';
import { STEP_LEVELS, type RhythmPattern } from './patterns';

/**
 * What the sequencer needs to make a sound. Narrow on purpose: `AudioEngine`
 * satisfies it structurally, and so does a counter in a test, which is the only
 * way to assert on timing without a browser.
 */
export interface DrumSink {
  readonly now: number;
  readonly running: boolean;
  drum(voice: DrumVoice, gain: number, at: number): void;
}

/** How often the scheduler wakes, and how far ahead it writes. As the bed. */
const TICK_MS = 40;
const LOOKAHEAD = 0.15;

/**
 * The rhythm box.
 *
 * A step sequencer built the same way as the chord bed: a timer that wakes
 * often and writes a little way ahead, so a hit lands where the audio clock
 * says it should rather than where a repainting browser got round to it.
 *
 * The one thing worth understanding here is the grid's origin. `Groove` — the
 * thing that decides whether the player landed on the beat — measures phase
 * straight off audio time zero, with no transport of its own. So this does too:
 * step `i` is at `i * stepSeconds`, counted from zero. Two consequences follow
 * for free. The drums and the on-beat judgement always agree about where a beat
 * is, and a tempo change re-phases both of them together rather than sliding
 * one against the other.
 */
export class RhythmBox {
  pattern: RhythmPattern;
  /** The player's swing trim, added to whatever the pattern is written with. */
  swing = 0;
  level = 0.8;

  private readonly sink: DrumSink;
  private readonly bpm: () => number;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Next step to write, as an absolute index from audio time zero. */
  private next = 0;
  /** The step length the current index was counted in. Zero means unanchored. */
  private anchored = 0;

  constructor(sink: DrumSink, bpm: () => number, pattern: RhythmPattern) {
    this.sink = sink;
    this.bpm = bpm;
    this.pattern = pattern;
  }

  get playing(): boolean { return this.timer !== null; }

  get stepsPerBar(): number { return this.pattern.steps; }

  /** The step under the playhead, for the HUD. -1 when nothing is running. */
  get step(): number {
    if (this.timer === null || !this.sink.running) return -1;
    const step = this.stepSeconds();
    return Math.floor(this.sink.now / step) % this.pattern.steps;
  }

  /**
   * Begin. Safe to call repeatedly; only the first one takes.
   *
   * The bare global timer rather than `window`'s, unlike the chord bed's:
   * that is the difference between a scheduler whose timing can be asserted
   * headless and one that can only be listened to.
   */
  start(): void {
    if (this.timer !== null) return;
    this.anchored = 0;
    this.timer = setInterval(() => this.schedule(), TICK_MS);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.anchored = 0;
  }

  /**
   * A different pattern. Bar lengths differ between them, so the grid has to be
   * taken again from the clock rather than counted on from the old one.
   */
  setPattern(pattern: RhythmPattern): void {
    if (pattern === this.pattern) return;
    this.pattern = pattern;
    this.anchored = 0;
  }

  private stepSeconds(): number {
    const beat = 60 / Math.max(20, this.bpm());
    return (beat * this.pattern.beats) / this.pattern.steps;
  }

  private schedule(): void {
    if (!this.sink.running) return;
    const now = this.sink.now;
    const step = this.stepSeconds();
    const bar = step * this.pattern.steps;

    // Re-take the grid whenever the index we are counting can no longer be
    // trusted: a tempo or pattern change resized the step, or a long stall —
    // a hidden tab, a slow load — left the index a bar or more in the past.
    // Counting on regardless would spray the catch-up hits out all at once.
    if (step !== this.anchored || this.next * this.anchored < now - bar) {
      this.anchored = step;
      this.next = Math.ceil(now / step);
    }

    while (this.next * step < now + LOOKAHEAD) {
      this.emit(this.next, step);
      this.next++;
    }
  }

  private emit(index: number, step: number): void {
    const p = this.pattern;
    const i = index % p.steps;
    // Swing pushes the off-steps late. Two thirds of a step is the full
    // triplet feel, which is as far as a shuffle control wants to go.
    const swing = p.swings ? clamp01(p.swing + this.swing) : 0;
    const at = index * step + (swing && i % 2 === 1 ? swing * step * 0.66 : 0);

    for (const voice of Object.keys(p.lanes) as DrumVoice[]) {
      const lane = p.lanes[voice];
      if (!lane) continue;
      const level = STEP_LEVELS[lane[i]] ?? 0;
      if (level <= 0) continue;
      this.sink.drum(voice, level * this.level, at);
    }
  }
}
