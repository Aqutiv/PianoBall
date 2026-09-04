import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game';
import { AURORA } from '../src/game/table/tables/aurora';
import { InputHub } from '../src/midi/inputHub';
import { MusicState } from '../src/audio/musicState';

/**
 * A pin in the simulation itself.
 *
 * The optimisations to the solver are all meant to be exactly equivalent --
 * skipping work that could not have changed an outcome, reusing a buffer
 * instead of making one. "Exactly" is a strong claim and the ordinary tests
 * only check it obliquely, by asserting the things a player would notice.
 *
 * `World.hash` is every ball's position and velocity, quantised. Running a
 * fixed script against a seeded game and pinning that number turns "the balls
 * still go where they went" into something a diff can fail on.
 *
 * If this breaks, the change was not equivalent. That may still be fine -- but
 * it has to be a decision, not a surprise.
 */

/** A long, busy run: multiball, keys worked, sensors crossed, walls hit. */
function run(steps: number): { hash: number; balls: number; marks: string[] } {
  const input = new InputHub();
  const music = new MusicState({ ...AURORA.music });
  const game = new Game(input, AURORA, music);
  game.active = true;
  game.newGame();

  // Off the serve, then three more so ball-to-ball is in the picture.
  const keys = game.keybed.keys;
  const first = keys[Math.floor(keys.length / 2)];
  input.dispatch({ type: 'noteon', note: first.geom.note, velocity: 100, raw: 100, time: 0, source: 'debug' });
  game.step(1 / 240);
  input.dispatch({ type: 'noteoff', note: first.geom.note, time: 0, source: 'debug' });
  game.spawnBall(320, 900, 240, -520);
  game.spawnBall(700, 840, -310, -470);
  game.spawnBall(512, 1000, 90, -610);

  const marks: string[] = [];
  const held = new Set<number>();
  for (let i = 0; i < steps; i++) {
    // A key on and off every so often, spread across the bed, so the paddle
    // path and the launch window are both exercised throughout the run.
    if (i % 37 === 0) {
      const k = keys[(i / 37) % keys.length | 0];
      input.dispatch({ type: 'noteon', note: k.geom.note, velocity: 60 + (i % 60), raw: 60 + (i % 60), time: 0, source: 'debug' });
      held.add(k.geom.note);
    }
    if (i % 37 === 18) {
      for (const n of held) input.dispatch({ type: 'noteoff', note: n, time: 0, source: 'debug' });
      held.clear();
    }
    game.step(1 / 240);
    // The ball count rides along with the hash. An empty world hashes to the
    // FNV basis whatever happened before it, so a run that quietly stopped
    // spawning would otherwise pin a constant and assert nothing.
    if (i % 500 === 499) marks.push(`${game.world.balls.length}:${game.world.hash()}`);
  }
  return { hash: game.world.hash(), balls: game.world.balls.length, marks };
}

describe('simulation determinism', () => {
  it('lands the same balls in the same places as it always has', () => {
    const { hash, balls, marks } = run(3000);
    // The run has to actually be simulating something for the pin to mean
    // anything.
    expect(balls).toBeGreaterThan(0);
    expect(marks.filter((m) => !m.startsWith('0:')).length).toBeGreaterThanOrEqual(4);
    // Recorded from b43959e, before any of the solver work. Every optimisation
    // to the physics has to reproduce these exactly.
    expect({ hash, balls, marks }).toMatchInlineSnapshot(`
      {
        "balls": 1,
        "hash": 2745184821,
        "marks": [
          "4:836054367",
          "2:2156452957",
          "0:2166136261",
          "0:2166136261",
          "1:1278740278",
          "1:2745184821",
        ],
      }
    `);
  });
});
