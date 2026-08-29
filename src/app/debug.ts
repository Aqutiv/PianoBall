import type { Shell } from './shell';
import type { GameModeId } from './mode';
import type { PinballMode } from '../modes/pinball/pinball';

/**
 * Everything the app can be driven by, without hardware. This is how the whole
 * thing is tested in a browser that has no MIDI device attached.
 */
export function installDebugApi(shell: Shell): void {
  const pinball = () => shell.active?.id === 'pinball' ? shell.active as PinballMode : null;

  const api = {
    shell,
    get game() { return pinball()?.game ?? null; },
    input: shell.input,
    stage: shell.stage,
    loop: shell.loop,
    hud: shell.hud,
    audio: shell.audio,
    bed: shell.bed,
    music: shell.music,
    overlay: shell.overlay,

    startAudio: () => shell.startAudio(),
    mode: (id: GameModeId) => shell.play(id),
    newGame: () => shell.restartMode(),

    noteOn: (note: number, velocity = 100) => shell.input.dispatch({
      type: 'noteon', note, velocity, raw: velocity, time: performance.now(), source: 'debug',
    }),
    noteOff: (note: number) => shell.input.dispatch({
      type: 'noteoff', note, time: performance.now(), source: 'debug',
    }),
    bend: (v: number) => shell.input.dispatch({ type: 'bend', value: v, time: performance.now(), source: 'debug' }),
    cc: (controller: number, value: number) => shell.input.dispatch({
      type: 'cc', controller, value, time: performance.now(), source: 'debug',
    }),

    spawnBall: (x = 512, y = 900, vx = 0, vy = 0) => pinball()?.game.spawnBall(x, y, vx, vy) ?? null,
    multiball: () => pinball()?.game.startMultiball(),

    /** Advance the simulation without waiting on the display refresh. */
    tick: (steps = 60) => { for (let i = 0; i < steps; i++) shell.active?.step(1 / 240); },
    /** Simulate and render `frames` display frames, ignoring requestAnimationFrame. */
    frame: (frames = 1, dt = 1 / 60) => {
      for (let f = 0; f < frames; f++) {
        const steps = Math.round(dt * 240);
        for (let i = 0; i < steps; i++) shell.active?.step(1 / 240);
        shell.active?.draw(0, dt);
      }
    },
    /** Render a frame and post the PNG to the dev server so it lands on disk. */
    shot: async (name = 'frame') => {
      shell.active?.draw(0, 1 / 60);
      const data = shell.stage.canvas.toDataURL('image/png');
      const res = await fetch('/__shot', { method: 'POST', body: JSON.stringify({ name, data }) });
      return res.json();
    },
    resizeTo: (w: number, h: number, dpr = 1) => shell.stage.resize(w, h, dpr),

    state: () => {
      const game = pinball()?.game;
      return {
        mode: shell.modeId,
        screen: shell.overlay.screen,
        scale: `${shell.music.label} @ ${shell.music.root}`,
        state: game?.state ?? null,
        score: game?.scoring.score ?? 0,
        balls: game?.balls.map((b) => ({
          id: b.id, x: Math.round(b.p.x), y: Math.round(b.p.y),
          vx: Math.round(b.v.x), vy: Math.round(b.v.y),
        })) ?? [],
        ballsLeft: game?.ballsLeft ?? 0,
        fps: Math.round(shell.loop.stats.fps),
        keys: shell.input.mapping.settings.count,
        base: shell.input.mapping.settings.baseNote,
      };
    },
  };
  (window as unknown as Record<string, unknown>).__pianoball = api;
}
