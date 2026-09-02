import { describe, expect, it } from 'vitest';
import { AudioEngine } from '../src/audio/engine';
import { wireGlobalControls } from '../src/audio/controls';
import { InputHub } from '../src/midi/inputHub';
import { ChordBed } from '../src/audio/bed';
import { MusicState } from '../src/audio/musicState';
import { AURORA } from '../src/game/table/tables/aurora';

function wired(): { input: InputHub; engine: AudioEngine } {
  const input = new InputHub();
  const engine = new AudioEngine();
  wireGlobalControls(input, engine);
  return { input, engine };
}

describe('cutting the pads short', () => {
  it('is safe before the graph exists', () => {
    // The shell enters a mode at boot to put something behind the home screen,
    // and that switch stops whatever the last mode left ringing — long before
    // a user gesture has unlocked any audio to stop.
    const engine = new AudioEngine();

    expect(engine.ready).toBe(false);
    expect(() => engine.stopPads()).not.toThrow();
  });
});

describe('MIDI audio controls', () => {
  it('maps channel volume CC 7 to master volume', () => {
    const { input, engine } = wired();

    input.dispatch({ type: 'cc', controller: 7, value: 0.25, time: 0, source: 'midi' });

    expect(engine.settings.master).toBe(0.25);
  });

  it('does not treat unrelated CC messages as volume', () => {
    const { input, engine } = wired();
    const initial = engine.settings.master;

    input.dispatch({ type: 'cc', controller: 10, value: 0.25, time: 0, source: 'midi' });

    expect(engine.settings.master).toBe(initial);
  });

  it('releases the subscription when told to', () => {
    const input = new InputHub();
    const engine = new AudioEngine();
    const off = wireGlobalControls(input, engine);
    off();

    input.dispatch({ type: 'cc', controller: 7, value: 0.25, time: 0, source: 'midi' });

    expect(engine.settings.master).not.toBe(0.25);
  });
});

/**
 * A bed switched on has to be heard now.
 *
 * The bar clock keeps running while the bed is silent, so re-enabling it used
 * to mean waiting for whatever bar the previous mode had left on the clock —
 * up to five seconds at the table's tempo, which reads as a button that does
 * nothing at all.
 */
describe('switching the bed on', () => {
  function harness() {
    const pads: number[][] = [];
    const audible: boolean[] = [];
    const engine = {
      running: true,
      now: 0,
      settings: { bed: true },
      pad: (notes: number[]) => { pads.push(notes); },
      setBedAudible: (on: boolean) => { audible.push(on); },
    };
    const music = new MusicState({ ...AURORA.music });
    const bed = new ChordBed(engine as never, music);
    return { pads, audible, engine, bed };
  }

  it('plays on the next tick rather than on the next bar', () => {
    const { pads, audible, engine, bed } = harness();

    // A bar goes out, leaving the clock pointing at the one after it.
    (bed as never as { schedule(): void }).schedule();
    expect(pads.length).toBe(2);

    // The player switches it off, then back on well inside that bar.
    bed.setEnabled(false);
    engine.now = 1;
    (bed as never as { schedule(): void }).schedule();
    expect(pads.length, 'silent while off').toBe(2);

    bed.setEnabled(true);
    (bed as never as { schedule(): void }).schedule();
    expect(pads.length, 'sounds as soon as it is asked for').toBe(4);
    // And the bus follows, so what was already ringing stopped on the way out.
    expect(audible).toEqual([false, true]);
  });

  it('silences what is already ringing when it stops', () => {
    const { pads, audible, bed } = harness();
    (bed as never as { schedule(): void }).schedule();
    expect(pads.length).toBe(2);

    // Those pads are already in the engine's hands and will ring for their
    // whole length — nearly four seconds of a slow swell. Dropping the queue
    // does not reach them; only the bus does.
    bed.stop();
    expect(audible).toEqual([false]);

    // And starting again brings them back, so a stop is not a one-way trip.
    bed.start();
    expect(audible).toEqual([false, true]);
    bed.stop();
  });

  it('comes back only as loud as the mode asked for', () => {
    const { audible, bed } = harness();
    // A mode that wants no bed of its own must not get one back just because
    // something stopped and started the scheduler around it.
    bed.setEnabled(false);
    bed.stop();
    bed.start();
    expect(audible).toEqual([false, false, false]);
    bed.stop();
  });

  it('does nothing when asked for a state it is already in', () => {
    const { pads, audible, engine, bed } = harness();
    (bed as never as { schedule(): void }).schedule();
    engine.now = 1;

    // Re-asserting "on" must not restart the bar clock under a playing bed.
    bed.setEnabled(true);
    (bed as never as { schedule(): void }).schedule();

    expect(pads.length).toBe(2);
    expect(audible).toEqual([]);
  });
});

/**
 * The table asks the bed to play its loop differently as a rally builds. What
 * has to hold is that the bottom rung is the bed as it always was, that a
 * comped bar lands on its beats, and that a change never lands mid-bar.
 */
describe("the loop's pattern", () => {
  interface Pad { notes: number[]; seconds: number; gain: number; at: number }
  const BAR = (60 / AURORA.music.bpm) * 4;
  const BEAT = BAR / 4;

  function harness() {
    const pads: Pad[] = [];
    const engine = {
      running: true,
      now: 0,
      settings: { bed: true },
      pad: (notes: number[], seconds: number, gain: number, at: number) => {
        pads.push({ notes, seconds, gain, at });
      },
      setBedAudible: () => {},
    };
    const music = new MusicState({ ...AURORA.music });
    const bed = new ChordBed(engine as never, music);
    const tick = () => (bed as never as { schedule(): void }).schedule();
    /** Wind the clock a bar forward, a scheduler tick at a time. */
    const bar = () => { for (let t = 0; t < BAR; t += 0.04) { engine.now += 0.04; tick(); } };
    return { pads, engine, bed, tick, bar };
  }

  it('voices and colours the loop as the table asks, from the next bar', () => {
    const { pads, bed, tick, bar } = harness();
    tick();
    const plain = pads[0].notes.length;
    expect(bed.chordTones).toHaveLength(plain);
    bed.setLoopStyle({ voicing: 'spread', colour: 1 });
    bar();
    const chords = pads.filter((p) => p.notes.length > 1);
    // The bar already written keeps its voicing; the next one takes the new.
    expect(chords[0].notes).toHaveLength(plain);
    const coloured = chords[chords.length - 1].notes;
    expect(coloured.length).toBeGreaterThan(plain);
    expect(coloured.length).toBeLessThanOrEqual(5);
    expect(bed.chordTones).toEqual(coloured);
    // And back to plain, from the bar after.
    bed.setLoopStyle({});
    bar();
    expect(pads.filter((p) => p.notes.length > 1).pop()!.notes).toHaveLength(plain);
  });

  it('sounds as it always has until it is asked otherwise', () => {
    const { pads, tick } = harness();
    tick();
    // A chord and its root, both for the whole bar, both on the bar line.
    expect(pads.map((p) => p.at)).toEqual([0, 0]);
    expect(pads[0].seconds).toBeCloseTo(BAR * 1.05, 6);
    expect(pads[0].notes.length).toBeGreaterThan(1);
    expect(pads[1].notes).toHaveLength(1);
  });

  it('plays a comped bar on the beats, and only the parts it was given', () => {
    const { pads, bed, tick, bar } = harness();
    bed.setLoopPattern('pulse', ['chord', 'bass']);
    tick();
    bar();
    const first = pads.filter((p) => p.at < BAR - 1e-6);
    // Four chord stabs and one bass note; the wash was left out.
    expect(first).toHaveLength(5);
    const stabs = first.filter((p) => p.notes.length > 1).map((p) => p.at / BEAT);
    expect(stabs.map((s) => Math.round(s * 1000) / 1000)).toEqual([0, 1, 2, 3]);
  });

  it('changes on the next bar line, never in the middle of a bar', () => {
    const { pads, engine, bed, tick } = harness();
    tick();
    const before = pads.length;
    engine.now = BEAT;
    bed.setLoopPattern('pulse');
    tick();
    expect(pads.length, 'nothing new inside the bar').toBe(before);
    engine.now = BAR - 0.1;
    tick();
    const next = pads.filter((p) => p.at >= BAR - 1e-6);
    expect(next.length).toBeGreaterThan(2);
  });

  it('forgets a bar it had expanded when the key changes under it', () => {
    const { pads, bed, tick, engine } = harness();
    bed.setLoopPattern('arpeggio');
    tick();
    const written = pads.length;
    // The arpeggio's later steps are still queued for their moment; a scale
    // change must not let them play out over the new key's first bar.
    bed.reset();
    engine.now = 0.5;
    tick();
    expect(pads.length).toBeGreaterThan(written);
    for (const p of pads.slice(written)) expect(p.at).toBeCloseTo(0.5, 6);
  });
});
