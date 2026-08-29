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
    const engine = {
      running: true,
      now: 0,
      settings: { bed: true },
      pad: (notes: number[]) => { pads.push(notes); },
    };
    const music = new MusicState({ ...AURORA.music });
    const bed = new ChordBed(engine as never, music);
    return { pads, engine, bed };
  }

  it('plays on the next tick rather than on the next bar', () => {
    const { pads, engine, bed } = harness();

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
  });

  it('does nothing when asked for a state it is already in', () => {
    const { pads, engine, bed } = harness();
    (bed as never as { schedule(): void }).schedule();
    engine.now = 1;

    // Re-asserting "on" must not restart the bar clock under a playing bed.
    bed.setEnabled(true);
    (bed as never as { schedule(): void }).schedule();

    expect(pads.length).toBe(2);
  });
});
