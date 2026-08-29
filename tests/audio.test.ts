import { describe, expect, it } from 'vitest';
import { AudioEngine } from '../src/audio/engine';
import { wireGlobalControls } from '../src/audio/controls';
import { InputHub } from '../src/midi/inputHub';

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
