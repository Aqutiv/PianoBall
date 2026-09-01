import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { PATTERNS, STEP_CHARS, STEP_LEVELS, findPattern } from '../src/audio/patterns';
import { DRUM_SPECS, type DrumVoice } from '../src/audio/drums';
import { RhythmBox, type DrumSink } from '../src/audio/rhythmBox';
import { Groove } from '../src/audio/music';

describe('the pattern library', () => {
  it('gives every lane exactly one character per step', () => {
    for (const p of PATTERNS) {
      for (const [voice, lane] of Object.entries(p.lanes)) {
        expect(`${p.id}/${voice}: ${lane?.length}`).toBe(`${p.id}/${voice}: ${p.steps}`);
      }
    }
  });

  it('uses only the notation it documents', () => {
    for (const p of PATTERNS) {
      for (const lane of Object.values(p.lanes)) {
        for (const ch of lane ?? '') {
          expect(STEP_CHARS.includes(ch), `${p.id} has "${ch}"`).toBe(true);
          expect(STEP_LEVELS[ch]).toBeTypeOf('number');
        }
      }
    }
  });

  it('names a voice the drum bank actually has', () => {
    for (const p of PATTERNS) {
      for (const voice of Object.keys(p.lanes)) {
        expect(DRUM_SPECS[voice as DrumVoice], `${p.id}/${voice}`).toBeDefined();
      }
    }
  });

  it('divides its steps evenly into beats, and has no repeated id', () => {
    const ids = new Set<string>();
    for (const p of PATTERNS) {
      expect(ids.has(p.id), `duplicate id ${p.id}`).toBe(false);
      ids.add(p.id);
      expect(p.steps % p.beats, p.id).toBe(0);
      expect(p.lanes, p.id).not.toEqual({});
    }
  });

  it('never swings a pattern already notated in triplets', () => {
    // Delaying every other step of a triplet grid does not shuffle it, it
    // breaks it — so compound and triplet patterns opt out.
    for (const p of PATTERNS) {
      if (p.steps / p.beats !== 4) expect(p.swings, p.id).toBe(false);
    }
  });

  it('falls back to a real pattern for a stale saved preference', () => {
    expect(findPattern('no-such-pattern')).toBe(PATTERNS[0]);
    expect(findPattern('bossa').id).toBe('bossa');
  });
});

// ---------------------------------------------------------------------------

interface Hit { voice: DrumVoice; gain: number; at: number }

/** A sink with a clock we drive by hand, standing in for the audio engine. */
class FakeSink implements DrumSink {
  now = 0;
  running = true;
  hits: Hit[] = [];
  drum(voice: DrumVoice, gain: number, at: number): void {
    this.hits.push({ voice, gain, at });
  }
}

/** Wind the clock forward, letting the box's timer fire every 40 ms. */
function run(sink: FakeSink, seconds: number): void {
  for (let t = 0; t < seconds * 1000; t += 40) {
    sink.now += 0.04;
    vi.advanceTimersByTime(40);
  }
}

/**
 * The steps a voice landed on inside one whole bar.
 *
 * Always a bar after the first: whenever the box is switched on, the step the
 * clock is already standing in has gone by, so bar zero is a partial one. That
 * is the behaviour, not a rounding error — the assertions just have to look
 * somewhere the box has had a full bar to play.
 */
function barSteps(
  sink: FakeSink, voice: DrumVoice, stepSeconds: number, steps: number, bar: number,
): number[] {
  const from = bar * steps * stepSeconds;
  return sink.hits
    .filter((h) => h.voice === voice && h.at >= from && h.at < from + steps * stepSeconds)
    .map((h) => Math.round((h.at - from) / stepSeconds));
}

describe('RhythmBox', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const rock = findPattern('rock');

  it('places a bar of hits on the grid, once each', () => {
    const sink = new FakeSink();
    const box = new RhythmBox(sink, () => 120, rock);
    box.level = 1;
    box.start();
    // 120 bpm: a step is an eighth of a second, a bar is two seconds.
    run(sink, 4);
    box.stop();

    const step = 0.125;
    // 'X.......X.......' and '....X.......X...' over sixteen steps.
    expect(barSteps(sink, 'kick', step, 16, 1)).toEqual([0, 8]);
    expect(barSteps(sink, 'snare', step, 16, 1)).toEqual([4, 12]);
    expect(barSteps(sink, 'hat', step, 16, 1)).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);

    // Every hit is unique, and none of them was written into the past.
    const stamps = sink.hits.map((h) => `${h.voice}@${h.at}`);
    expect(new Set(stamps).size).toBe(stamps.length);
  });

  it('never schedules a hit that has already gone by', () => {
    const sink = new FakeSink();
    sink.now = 7.3;
    const box = new RhythmBox(sink, () => 96, findPattern('house'));
    box.start();
    const seen: number[] = [];
    const at = 7.3;
    run(sink, 4);
    box.stop();
    for (const h of sink.hits) seen.push(h.at);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(at);
  });

  it('carries the notation through to the gain', () => {
    const sink = new FakeSink();
    const box = new RhythmBox(sink, () => 120, findPattern('train'));
    box.level = 1;
    box.start();
    run(sink, 4);
    box.stop();

    // 'X-x-X-x-...': accents, ghosts and normals all reach the sink distinct.
    const snares = sink.hits
      .filter((h) => h.voice === 'snare' && h.at >= 2 && h.at < 4)
      .map((h) => h.gain);
    expect(snares.slice(0, 4)).toEqual([
      STEP_LEVELS.X, STEP_LEVELS['-'], STEP_LEVELS.x, STEP_LEVELS['-'],
    ]);
  });

  it('scales every hit by the level', () => {
    const sink = new FakeSink();
    const box = new RhythmBox(sink, () => 120, rock);
    box.level = 0.5;
    box.start();
    run(sink, 1);
    box.stop();
    for (const h of sink.hits) expect(h.gain).toBeLessThanOrEqual(0.5);
  });

  it('pushes only the off-steps late when swung', () => {
    const sink = new FakeSink();
    const box = new RhythmBox(sink, () => 120, findPattern('funk-16'));
    box.swing = 0.5;
    box.start();
    run(sink, 2);
    box.stop();

    const step = 0.125;
    for (const h of sink.hits) {
      const index = Math.round(h.at / step);
      const offset = h.at - index * step;
      // Even steps land dead on; odd ones are late by half of two thirds.
      if (index % 2 === 0) expect(offset).toBeCloseTo(0, 6);
      else expect(offset).toBeCloseTo(0.5 * step * 0.66, 6);
    }
  });

  it('leaves a triplet pattern alone however far the swing is pushed', () => {
    const sink = new FakeSink();
    const box = new RhythmBox(sink, () => 120, findPattern('jazz-ride'));
    box.swing = 1;
    box.start();
    run(sink, 2);
    box.stop();

    const step = 2 / 12;
    for (const h of sink.hits) {
      expect(h.at / step - Math.round(h.at / step)).toBeCloseTo(0, 6);
    }
  });

  it('re-anchors after a stall rather than firing off the catch-up', () => {
    const sink = new FakeSink();
    const box = new RhythmBox(sink, () => 120, rock);
    box.start();
    run(sink, 0.5);
    const before = sink.hits.length;

    // The tab was hidden for a minute: the interval fires once, far ahead.
    sink.now += 60;
    vi.advanceTimersByTime(40);
    box.stop();

    // A bar's worth at most, not sixty seconds' worth.
    expect(sink.hits.length - before).toBeLessThanOrEqual(4);
    for (const h of sink.hits.slice(before)) expect(h.at).toBeGreaterThan(60);
  });

  it('stays phase-locked with the beat judge across a tempo change', () => {
    const sink = new FakeSink();
    let bpm = 96;
    const box = new RhythmBox(sink, () => bpm, rock);
    const groove = new Groove(bpm);
    box.start();
    run(sink, 2);

    bpm = 148;
    groove.bpm = bpm;
    run(sink, 2);
    box.stop();

    // Both grids count from audio time zero, so every hit the box places on a
    // beat is a hit the field would light up for.
    for (const h of sink.hits.slice(-6)) {
      expect(Math.abs(groove.offsetAt(h.at))).toBeLessThanOrEqual(groove.window);
    }
  });

  it('makes no sound while the context is not running', () => {
    const sink = new FakeSink();
    sink.running = false;
    const box = new RhythmBox(sink, () => 120, rock);
    box.start();
    run(sink, 2);
    box.stop();
    expect(sink.hits).toHaveLength(0);
  });

  it('reports the step under the playhead, and -1 when stopped', () => {
    const sink = new FakeSink();
    const box = new RhythmBox(sink, () => 120, rock);
    expect(box.step).toBe(-1);
    box.start();
    sink.now = 0.5;                 // four steps in, at an eighth of a second each
    expect(box.step).toBe(4);
    sink.now = 2.25;                // a bar and two steps
    expect(box.step).toBe(2);
    box.stop();
    expect(box.step).toBe(-1);
  });
});

/**
 * The table fades its drums in and out with the rally rather than switching
 * them. A fade lives on the sink's clock, so a hit already in the lookahead is
 * as loud as the moment it lands.
 */
describe('fading the box', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const rock = findPattern('rock');
  /** The hat that fell on a given step of the bar starting at `bar` seconds. */
  const hatAt = (sink: FakeSink, at: number) =>
    sink.hits.find((h) => h.voice === 'hat' && Math.abs(h.at - at) < 1e-6)!;

  it('rides a ramp from where it is to where it was asked, hit by hit', () => {
    const sink = new FakeSink();
    const box = new RhythmBox(sink, () => 120, rock);
    box.level = 0.2;
    box.start();
    run(sink, 1);
    // A second in: one second up to full, so everything from the bar line at
    // 2 s on is at the top, and a hit halfway through the fade is halfway up.
    box.fadeTo(1, 1);
    run(sink, 2.7);
    box.stop();

    // The same step of the bar before and after the fade, so the accent is the
    // same and only the level differs: 0.2 against 1, then 0.6 against 1.
    expect(hatAt(sink, 2.25).gain).toBeCloseTo(hatAt(sink, 0.25).gain * 5, 5);
    expect(hatAt(sink, 1.5).gain).toBeCloseTo(hatAt(sink, 3.5).gain * 0.6, 5);
    const ramp = sink.hits.filter((h) => h.voice === 'hat' && h.at >= 1 && h.at <= 2.2);
    for (let i = 1; i < ramp.length; i++) expect(ramp[i].gain).toBeGreaterThanOrEqual(ramp[i - 1].gain);
  });

  it('stops itself once a fade-out has reached silence', () => {
    const sink = new FakeSink();
    const box = new RhythmBox(sink, () => 120, rock);
    box.start();
    run(sink, 1);
    box.fadeOut(0.5);
    expect(box.playing, 'still fading').toBe(true);
    run(sink, 1);
    expect(box.playing).toBe(false);
    // Nothing audible was written past the end of the fade.
    for (const h of sink.hits) if (h.at > 1.5 + 1e-6) expect(h.gain).toBe(0);
  });

  it('lets a plain assignment cancel a fade', () => {
    const sink = new FakeSink();
    const box = new RhythmBox(sink, () => 120, rock);
    box.start();
    box.fadeOut(4);
    box.level = 0.9;
    expect(box.level).toBe(0.9);
    run(sink, 5);
    expect(box.playing, 'the stop that came with the fade went with it').toBe(true);
    box.stop();
  });

  it('has nothing to fade out when it is not playing', () => {
    const sink = new FakeSink();
    const box = new RhythmBox(sink, () => 120, rock);
    box.fadeOut(0.3);
    expect(box.playing).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(sink.hits).toHaveLength(0);
  });
});
