/**
 * Deterministic capture + bench rig for the graphics pass.
 *
 * Loaded into a dev page by hand, never by the app. Three things have to be
 * pinned or no two runs agree:
 *
 *  - `Math.random`, which drives every particle and the screen shake;
 *  - `AudioContext.currentTime`, which the beat pulse is clocked by and which
 *    is wall-clock, so an unpinned run lands on a different point of the bar;
 *  - the game loop itself, because `shot` awaits a fetch and every yield lets
 *    requestAnimationFrame step the simulation behind the capture's back;
 *  - and the musical key, which is drawn at random by default. Every colour on
 *    the table is derived from pitch, so a differently-drawn key repaints the
 *    whole board and two runs have nothing to say to each other.
 *
 * The third is the one that hurts: a single-shot run looks perfectly
 * reproducible because its only yield comes after the pixels are read, so the
 * rig appears sound right up until a multi-shot run disagrees with itself.
 *
 * PROTOCOL: run `__cap` once per fresh page load, as the first thing you do.
 * Modes are built once and cached on the shell for the life of the page, and
 * several of their clocks — `Field.t` most visibly — are never reset by
 * `reset()` or `newGame()`. So a second run in the same page starts warm and
 * will not match the first. Two runs that each follow a reload match exactly;
 * that pairing is what a before/after diff has to be built from.
 */
export async function install() {
  const themeMod = await import('/src/render/theme.ts');
  const api = window.__pianoball;

  /** Run `fn` with the clocks, the RNG and the loop all held still. */
  async function pinned(fn) {
    const real = Math.random;
    let seed = 12345;
    const reseed = () => { seed = 12345; };
    Math.random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    Object.defineProperty(api.audio, 'now', { get: () => 0, configurable: true });
    const wasRunning = api.loop.running;
    api.loop.stop();
    // A fixed key, so the pitch hues are the same board every run. Restored
    // afterwards, since it is a persisted player setting and not ours to keep.
    //
    // Guarded, because this rig is pointed at older checkouts to A/B against —
    // and `setKey` only exists since the key became drawable. Without the
    // guard the whole capture throws there rather than falling back to
    // whatever key that build picks for itself.
    const canPin = typeof api.music.setKey === 'function';
    const wasMode = api.music.choice, wasKey = api.music.keyChoice;
    if (canPin) { api.music.setChoice('aeolian'); api.music.setKey(2); }
    // `await`, not a bare return: `fn` is async, and a synchronous try/finally
    // around it puts everything back before the first capture has happened.
    try { return await fn(reseed); } finally {
      Math.random = real;
      delete api.audio.now;
      if (canPin) { api.music.setChoice(wasMode); api.music.setKey(wasKey); }
      if (wasRunning) api.loop.start();
    }
  }

  function setup(mode, theme, w, h, dpr) {
    api.overlay.hide();
    api.mode(mode);
    api.shell.setTheme(themeMod.findTheme(theme));
    api.resizeTo(w, h, dpr);
    api.newGame();
    api.stage.reset();
    api.stage.t = 0;
  }

  window.__cap = (prefix, opts = {}) => {
    const { w = 1280, h = 800, dpr = 2, frames = 90,
            modes = ['pinball', 'freestyle', 'playtune'],
            themes = ['nocturne', 'rush', 'velvet', 'toybox'] } = opts;
    return pinned(async (reseed) => {
      let n = 0;
      for (const mode of modes) {
        for (const theme of themes) {
          reseed();
          setup(mode, theme, w, h, dpr);
          reseed();
          api.frame(frames, 1 / 60);
          await api.shot(`${prefix}-${mode}-${theme}`);
          n++;
        }
      }
      return n;
    });
  };

  /**
   * A frame with the table actually working: balls in flight, a loaded
   * particle pool, and a hard kick so the screen shake is at full throw.
   *
   * The quiet captures `__cap` takes have neither shake nor particles, so they
   * prove nothing about either. This is the frame that shows whether the glow
   * sits on the objects it belongs to.
   */
  window.__capBusy = (prefix, opts = {}) => {
    const { w = 1280, h = 800, dpr = 2,
            themes = ['nocturne', 'rush', 'velvet', 'toybox'] } = opts;
    return pinned(async (reseed) => {
      let n = 0;
      for (const theme of themes) {
        reseed();
        setup('pinball', theme, w, h, dpr);
        reseed();
        for (let i = 0; i < 4; i++) api.spawnBall(300 + i * 130, 700 + i * 40, 220 - i * 90, -420);
        api.frame(24, 1 / 60);
        for (let i = 0; i < 30; i++) api.stage.particles.burst(420 + i * 12, 780, 0, 1, 1400, 40 + i * 7, 14);
        api.stage.kick(22);
        api.frame(1, 1 / 60);
        await api.shot(`${prefix}-busy-${theme}`);
        n++;
      }
      return n;
    });
  };

  window.__bench = (opts = {}) => {
    const { w = 1280, h = 800, dpr = 2, mode = 'pinball', theme = 'nocturne',
            warm = 60, iters = 300, balls = 4, parts = 40 } = opts;
    return pinned(async (reseed) => {
      reseed();
      setup(mode, theme, w, h, dpr);
      reseed();
      if (mode === 'pinball') {
        for (let i = 0; i < balls; i++) api.spawnBall(300 + i * 130, 700 + i * 40, 220 - i * 90, -420);
        for (let i = 0; i < parts; i++) api.stage.particles.burst(400 + i * 8, 800, 0, 1, 900, 200, 12);
      }
      api.frame(warm, 1 / 60);
      const t = [];
      for (let i = 0; i < iters; i++) {
        for (let s = 0; s < 4; s++) api.shell.active.step(1 / 240);
        const t0 = performance.now();
        api.shell.active.draw(0, 1 / 60);
        t.push(performance.now() - t0);
      }
      t.sort((a, b) => a - b);
      const at = (p) => +t[Math.min(t.length - 1, Math.floor(p * t.length))].toFixed(3);
      // The median is the only stable number on a shared machine; p25 says how
      // fast a clean frame is when nothing else is competing for the CPU.
      return { mode, theme, dpr, parts, live: api.stage.particles.liveCount,
               p25: at(0.25), median: at(0.5), p90: at(0.9) };
    });
  };

  return 'installed';
}
