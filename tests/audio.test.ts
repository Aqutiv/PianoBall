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
