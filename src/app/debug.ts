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
     * `n` rolling balls, at a fixed speed, with no game underneath them.
     *
     * The roll is the app's only continuous sound and so the whole of the
     * reported whoosh, but measuring it through the table proved useless: the
     * level depends on ball speed, on where each ball is (which sets `depth`),
     * and on the slow-motion time scale, and all three differ every run. Three
     * repeats of the same scene came out eight times apart.
     *
     * So this drives the engine directly and holds every input still. It is the
     * only way to say whether a change to `roll` made it quieter.
     *
     * **Read `floorRms` before believing `rms`.** The floor is the same scene
     * with the rolls stopped, so it should be a few parts in a hundred
     * thousand. When it is not, something else was still sounding -- the bed
     * places pads ahead on the clock and they go on decaying for a second or
     * two after `stop`, and a run taken during that measures them too. A
     * contaminated run reads several times high; discard it and take another.
     */
    rollBench: async (n = 4, speed = 1500, seconds = 1.5, share = 1 / Math.sqrt(Math.max(1, n))) => {
      await shell.startAudio();
      // Away from the table first. Pinball's attract mode rolls balls of its
      // own, and `hush` cannot stop a roll -- rolls are not in the shot budget
      // -- so measuring here would add the table's rolls to the ones under
      // test, and leave them behind in the floor reading afterwards.
      shell.play('freestyle');
      shell.bed.stop();
      shell.audio.hush();
      // Long enough for pads already written onto the clock to decay. Three
      // hundred milliseconds was not, and the runs that caught them read five
      // times high.
      await new Promise((done) => setTimeout(done, 1600));
      const handles = Array.from({ length: n }, () => shell.audio.roll());
      // Driven for a moment first: the gain is smoothed with a 50 ms time
      // constant and would otherwise still be climbing when the window opens.
      for (let i = 0; i < 12; i++) {
        for (const h of handles) h.update(speed, share, 0, 0);
        await new Promise((done) => setTimeout(done, 25));
      }
      const on = await shell.audio.measure(seconds, { silent: true });
      for (const h of handles) h.stop();
      await new Promise((done) => setTimeout(done, 400));
      const off = await shell.audio.measure(0.5, { silent: true });
      return { n, speed, share, rms: on.rms, peak: on.peak, floorRms: off.rms };
    },
    /**
     * A fixed number of notes and table hits, with no game underneath.
     *
     * The audit's whole-mix scenes turned out to be useless for before-and-
     * after work: a live table has a different number of balls, different
     * impacts, different drum rungs and a bed at a different point of its loop
     * every run, and two runs of the same code came out four times apart. This
     * plays a written-down score instead -- `voices` notes struck together,
     * then `shots` surface hits evenly spaced -- so the only thing that differs
     * between two runs is what changed in the engine.
     *
     * `floorRms` is the validity check, as in `rollBench`: it is the same
     * scene with nothing fired, and a run where it is not near zero caught
     * something still decaying and should be discarded.
     */
    mixBench: async (voices = 8, shots = 12, seconds = 2) => {
      await shell.startAudio();
      shell.play('freestyle');
      shell.bed.stop();
      shell.audio.hush();
      await new Promise((done) => setTimeout(done, 1600));
      const floor = await shell.audio.measure(0.4, { silent: true });

      const reading = shell.audio.measure(seconds, { silent: true });
      await new Promise((done) => setTimeout(done, 40));
      // A chord wide enough to be a chord, struck at once.
      const chord = [36, 43, 48, 55, 60, 64, 67, 72, 76, 79, 84, 88];
      for (let i = 0; i < voices; i++) api.noteOn(chord[i % chord.length]! + (i >= chord.length ? 1 : 0), 110);
      // And the table over the top of it, evenly spaced so the count is the
      // only variable.
      const tags = ['metal', 'bumper', 'rubber', 'plastic'] as const;
      for (let i = 0; i < shots; i++) {
        setTimeout(() => shell.audio.hit(tags[i % tags.length]!, 900, { pan: (i % 5) / 2 - 1 }),
          40 + i * ((seconds * 1000 * 0.7) / Math.max(1, shots)));
      }
      const on = await reading;
      for (let i = 0; i < voices; i++) api.noteOff(chord[i % chord.length]! + (i >= chord.length ? 1 : 0));
      return {
        voices, shots,
        peak: on.peak, rms: on.rms,
        reductionPeak: on.reductionPeak, reductionRange: on.reductionRange,
        floorRms: floor.rms,
      };
    },
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
      // Explicitly, because `restartMode` does not: it leaves the mode's audio
      // paused and relies on the panel closing to resume it. An audit that
      // never opens a panel would otherwise measure a table with no rolls at
      // all -- which is how this line came to be written.
      shell.overlay.hide();
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
      // Pinned velocities, or this reading is not comparable with itself.
      // A roll's level is a function of ball speed, and freezing the
      // simulation freezes whatever speeds the balls happened to have — which
      // differ every run, and swamp the effect of any change being measured.
      const frozen = pinball()?.game.world.balls ?? [];
      for (const b of frozen) { b.v.x = 900; b.v.y = -1200; }
      await settle();
      out.rollBalls = frozen.length;
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
