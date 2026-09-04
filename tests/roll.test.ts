import { describe, expect, it, vi } from 'vitest';
import { PinballAudio } from '../src/modes/pinball/audio';
import { Game } from '../src/game/game';
import { AURORA } from '../src/game/table/tables/aurora';
import { InputHub } from '../src/midi/inputHub';
import { MusicState } from '../src/audio/musicState';
import type { AudioEngine, RollHandle } from '../src/audio/engine';
import type { ChordBed } from '../src/audio/bed';

/**
 * The rolling ball is the only continuously-running sound in the app.
 *
 * Everything else the engine makes is a one-shot with a scheduled `stop()`, so
 * everything else stops whether or not anyone remembers to stop it. A roll runs
 * until something calls `stop()` on its handle, and `PinballAudio.stopRolls` is
 * the only thing in the app that can: a roll is not in the shot budget, so
 * `AudioEngine.hush` cannot reach it either. An orphaned one would outlive a
 * mode switch, a pause, a game over and a hush, and go on hissing until the
 * page was reloaded.
 *
 * That has happened once already — the README's "the rolling ball is the one
 * that gets away" — and there was no test. This is that test.
 */

interface FakeRoll extends RollHandle {
  stopped: boolean;
  updates: number;
}

function rig(running = true) {
  const opened: FakeRoll[] = [];
  const engine = {
    get running() { return running; },
    roll(): RollHandle {
      const h: FakeRoll = {
        stopped: false,
        updates: 0,
        update() { h.updates++; },
        stop() { h.stopped = true; },
      };
      opened.push(h);
      return h;
    },
  } as unknown as AudioEngine;

  const bed = {
    setLoopPattern: vi.fn(),
    setLoopStyle: vi.fn(),
  } as unknown as ChordBed;

  const game = new Game(new InputHub(), AURORA, new MusicState({ ...AURORA.music }));
  game.active = true;
  const audio = new PinballAudio(engine, bed, game);
  return {
    opened, game, audio,
    setRunning(v: boolean) { running = v; },
    live: () => opened.filter((h) => !h.stopped),
  };
}

describe('the rolling ball', () => {
  it('opens one roll per ball, and only one', () => {
    const r = rig();
    r.game.spawnBall(300, 700, 100, -200);
    r.game.spawnBall(500, 800, -80, -260);
    r.audio.frame();
    r.audio.frame();
    r.audio.frame();
    expect(r.opened).toHaveLength(2);
    expect(r.live()).toHaveLength(2);
  });

  it('stops the roll of a ball that has gone', () => {
    const r = rig();
    const ball = r.game.spawnBall(300, 700, 100, -200)!;
    r.game.spawnBall(500, 800, -80, -260);
    r.audio.frame();
    expect(r.live()).toHaveLength(2);

    r.game.world.removeBall(ball.id);
    r.audio.frame();
    expect(r.live()).toHaveLength(1);
  });

  it('leaves nothing rolling behind a panel', () => {
    const r = rig();
    r.game.spawnBall(300, 700, 100, -200);
    r.game.spawnBall(500, 800, -80, -260);
    r.audio.frame();
    expect(r.live()).toHaveLength(2);

    r.audio.pause();
    expect(r.live()).toHaveLength(0);
  });

  it('does not start rolling again while it is paused', () => {
    const r = rig();
    r.game.spawnBall(300, 700, 100, -200);
    r.audio.frame();
    r.audio.pause();
    const after = r.opened.length;
    r.audio.frame();
    r.audio.frame();
    expect(r.opened).toHaveLength(after);
    expect(r.live()).toHaveLength(0);
  });

  it('leaves nothing rolling when the mode is left', () => {
    const r = rig();
    r.game.spawnBall(300, 700, 100, -200);
    r.game.spawnBall(500, 800, -80, -260);
    r.audio.frame();
    r.audio.detach();
    expect(r.live()).toHaveLength(0);
  });

  it('opens no roll while the context is still locked, and one once it is not', () => {
    const r = rig(false);
    r.game.spawnBall(300, 700, 100, -200);
    r.audio.frame();
    r.audio.frame();
    expect(r.opened).toHaveLength(0);

    r.setRunning(true);
    r.audio.frame();
    expect(r.live()).toHaveLength(1);
  });

  it('does not orphan a roll when a ball goes in the same frame the context opens', () => {
    const r = rig(false);
    const ball = r.game.spawnBall(300, 700, 100, -200)!;
    r.audio.frame();
    r.setRunning(true);
    r.game.world.removeBall(ball.id);
    r.audio.frame();
    expect(r.live()).toHaveLength(0);
  });
});
