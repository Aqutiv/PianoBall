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
    /**
     * The loudest peak to reach the master ceiling over the next `seconds`, as
     * a multiple of full scale. Play something first: this listens, it does not
     * make a sound. Over one is the soft clipper doing its job; well over one
     * is a mix that has stopped fitting.
     */
    headroom: (seconds = 1) => shell.audio.headroom(seconds),
    /** Peak, RMS and what the compressor did to get there. */
    measure: (seconds = 2, silent = true) => shell.audio.measure(seconds, { silent }),
    /**
     * The same six scenes, measured the same way, every time.
     *
     * Three audio faults were reported from play — a continuous whoosh in
     * pinball, clicks, and the mix falling apart when a lot happens at once —
     * and all three are the kind that a listener cannot pin down and a fix
     * cannot be shown to have addressed. These scenes are the ones that
     * separate them: silence says whether anything is running that should not
     * be, one note against a chord says whether polyphony is summing sanely, a
     * full multiball rally is the case that was actually complained about, and
     * the last pair brackets the rolling ball by taking it away.
     *
     * Every reading is taken silently -- speaker off the end of the chain,
     * master open behind it -- so an audit can be run while somebody is
     * working in another window without putting the table through their
     * speakers, and so a window that has lost focus still measures the mix
     * rather than measuring its own mute.
     *
     * Returns numbers rather than printing them, so a before and an after can
     * be diffed rather than remembered.
     */
    audit: async (seconds = 2) => {
      await shell.startAudio();
      const out: Record<string, unknown> = {};
      const settle = () => new Promise((done) => setTimeout(done, 350));

      // Genuine silence, which means the bed as well: it comps on a timer of
      // its own and would otherwise put a floor under the one reading whose
      // whole job is to say whether anything is running that should not be.
      shell.play('freestyle');
      shell.bed.stop();
      shell.audio.hush();
      await settle();
      out.silence = await shell.audio.measure(seconds, { silent: true });

      api.noteOn(60, 110);
      out.oneNote = await shell.audio.measure(seconds, { silent: true });
      api.noteOff(60);
      await settle();

      for (const n of [48, 55, 60, 64]) api.noteOn(n, 110);
      out.chord = await shell.audio.measure(seconds, { silent: true });
      for (const n of [48, 55, 60, 64]) api.noteOff(n);
      await settle();

      // Pinball, idling in attract behind nothing: this is the state the
      // whoosh was reported in, and it has no music over it to hide behind.
      shell.play('pinball');
      await settle();
      out.attract = await shell.audio.measure(seconds, { silent: true });

      api.newGame();
      api.multiball();
      const game = pinball()?.game;
      for (let i = 0; i < 4; i++) game?.spawnBall(300 + i * 130, 700 + i * 40, 220 - i * 90, -420);
      out.multiball = await shell.audio.measure(seconds * 2, { silent: true });

      // The rolls alone, which is the reported fault.
      //
      // Isolated by freezing the simulation first. With the physics stopped the
      // balls keep the velocities they had, so `frame` goes on driving the
      // rolls at a fixed speed — which is exactly the steady, unvarying state
      // the complaint describes — while nothing hits anything, so no one-shot
      // lands in the window. Then the balls are taken away and the same window
      // is measured again. Everything else about the two readings is identical,
      // so the difference is the roll and nothing else.
      //
      // Taking the balls away rather than pausing the audio, because `pause`
      // also stops the drums and drops the flourish, which would put two other
      // changes inside the same comparison.
      shell.bed.stop();
      shell.audio.hush();
      const wasSuspended = shell.suspended;
      shell.suspended = true;
      await settle();
      out.rollsOn = await shell.audio.measure(seconds, { silent: true });

      const world = pinball()?.game.world;
      for (const b of [...(world?.balls ?? [])]) world?.removeBall(b.id);
      // One drawn frame, so the sweep notices and stops them.
      shell.active?.draw(0, 1 / 60);
      await settle();
      out.rollsOff = await shell.audio.measure(seconds, { silent: true });
      shell.suspended = wasSuspended;

      return out;
    },
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
