import { describe, expect, it } from 'vitest';
import { AudioDirector } from '../src/audio/director';
import { Game } from '../src/game/game';
import { AURORA } from '../src/game/table/tables/aurora';
import { InputHub } from '../src/midi/inputHub';

describe('MIDI audio controls', () => {
  it('maps channel volume CC 7 to master volume', () => {
    const input = new InputHub();
    const audio = new AudioDirector(new Game(input, AURORA), input);

    input.dispatch({ type: 'cc', controller: 7, value: 0.25, time: 0, source: 'midi' });

    expect(audio.engine.settings.master).toBe(0.25);
  });

  it('does not treat unrelated CC messages as volume', () => {
    const input = new InputHub();
    const audio = new AudioDirector(new Game(input, AURORA), input);
    const initial = audio.engine.settings.master;

    input.dispatch({ type: 'cc', controller: 10, value: 0.25, time: 0, source: 'midi' });

    expect(audio.engine.settings.master).toBe(initial);
  });
});
