export interface LoopStats {
  fps: number;
  frameMs: number;
  stepMs: number;
  drawMs: number;
  steps: number;
}

/**
 * Fixed-timestep simulation with an interpolated render.
 *
 * Physics runs at a constant rate regardless of display refresh, which is what
 * makes the simulation deterministic and keeps collision response identical on
 * a 60 Hz laptop and a 240 Hz monitor.
 */
export class GameLoop {
  readonly stats: LoopStats = { fps: 0, frameMs: 0, stepMs: 0, drawMs: 0, steps: 0 };

  /** Simulation rate in Hz. */
  hz: number;
  /** Multiplies simulated time. Below 1 for the slow-motion ability. */
  timeScale = 1;
  running = false;

  private readonly step: (dt: number) => void;
  private readonly draw: (alpha: number, frameDt: number) => void;
  private accumulator = 0;
  private last = 0;
  private raf = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private readonly maxStepsPerFrame: number;

  constructor(opts: {
    hz?: number;
    maxStepsPerFrame?: number;
    step: (dt: number) => void;
    draw: (alpha: number, frameDt: number) => void;
  }) {
    this.hz = opts.hz ?? 240;
    this.maxStepsPerFrame = opts.maxStepsPerFrame ?? 12;
    this.step = opts.step;
    this.draw = opts.draw;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.accumulator = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);

    // Clamp the wall-clock delta: a backgrounded tab must not produce a
    // thousand catch-up steps when it returns.
    const frameDt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    this.stats.frameMs = frameDt * 1000;

    this.fpsAccum += frameDt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.stats.fps = this.fpsFrames / this.fpsAccum;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    const dt = 1 / this.hz;
    this.accumulator += frameDt * this.timeScale;

    const t0 = performance.now();
    let steps = 0;
    while (this.accumulator >= dt && steps < this.maxStepsPerFrame) {
      this.step(dt);
      this.accumulator -= dt;
      steps++;
    }
    // Give up on any remaining backlog rather than spiralling.
    if (steps === this.maxStepsPerFrame) this.accumulator = 0;
    this.stats.steps = steps;
    this.stats.stepMs = performance.now() - t0;

    const t1 = performance.now();
    this.draw(this.accumulator / dt, frameDt);
    this.stats.drawMs = performance.now() - t1;
  };
}
