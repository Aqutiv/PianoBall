/**
 * What the frame looked like, and how long it lasted.
 *
 * `stepMs + drawMs` is what this code costs. `frameMs` is the wall-clock gap
 * between frames, which is the same number plus everything the browser does
 * afterwards -- compositing, style, paint, garbage collection.
 */
export interface FrameSample {
  stepMs: number;
  drawMs: number;
  frameMs: number;
  dt: number;
}

/** What the controller needs to know about the ladder it is walking. */
export interface LadderView {
  /** Where the ladder is now. */
  rung: number;
  /** True while the controller owns the rung, rather than a pinned preset. */
  auto: boolean;
  /**
   * True while nothing being measured means anything -- a panel is open, or
   * the window is not the one being played.
   */
  idle: boolean;
  /**
   * The next rung down that would actually change the picture, skipping any
   * that are inert for this theme or already off by preference.
   */
  nextEffective(from: number): number;
}

/** How long the controller looks away for after the workload changes. */
export const SETTLE = 1.5;
/** After shedding, and after climbing back. Recovery is deliberately slower. */
const SHED_HOLD = 3;
const CLIMB_HOLD = 8;
/** A frame longer than this is a stall, not a frame rate. */
const STALL_MS = 200;
/** Where the refresh estimate starts, and the fastest common panel it assumes. */
const ASSUMED_REFRESH = 16.7;
/**
 * Slowest average frame that still counts as comfortable, whatever the display.
 *
 * A 50Hz panel sits at 20ms, which is under the late threshold but was over the
 * old recovery threshold of 1.15x the estimate -- so such a display was never
 * comfortable and could never climb back out of anything it had shed. The band
 * between this and `late` is deliberately empty: a frame in it is neither good
 * enough to take something back nor bad enough to give something up, which is
 * what keeps the ladder from hunting.
 */
const COMFORTABLE_MS = 22;
/** Climbs to one rung that end in a shed back past it, before giving up on it. */
const GIVE_UP_AFTER = 2;

/**
 * When to give something up, and when to take it back.
 *
 * Split out of `Shell` so it can be driven without a canvas, a context or a
 * clock. That is not tidiness: every bug this has had -- and it has had nine --
 * was in the state machine rather than in the rendering, and none of them could
 * be reached by a test while this logic lived inside a class that needs a DOM
 * to exist. Feeding it invented frame times is the only way to find out what it
 * does over a minute of being too slow.
 *
 * Two signals, because either alone lies. Measured work misses everything the
 * browser does after the frame, so a machine falling over on GPU compositing --
 * which is exactly what old integrated graphics does -- reports a comfortable
 * number and would never shed. Wall-clock time catches that, but says nothing
 * about headroom on its own: a healthy 60Hz display sits at a flat 16.7ms
 * whether the frame took one millisecond or fifteen. So: shed when either says
 * the frame is late, and climb back only when both say it is not.
 */
export class Adaptive {
  /** EMA of the work this code does in a frame. */
  frameAvg = 8;
  /** EMA of the wall-clock gap between frames. */
  wallAvg = 16.7;
  /**
   * The display's own frame interval, as the fastest frame seen since the last
   * thing that could have changed it.
   *
   * A true minimum, and deliberately so. Allowed to creep upward it will follow
   * a machine down: one held at 30fps by its compositor drags the baseline to
   * 33ms, and the controller then measures the failure against itself, decides
   * it is comfortable, and climbs back rather than shedding. This has to
   * describe what the display can do, never what the machine is managing.
   */
  refresh = ASSUMED_REFRESH;

  private held = 0;
  private settle = 0;
  /** Rungs climbed to and then shed back past, and how often. */
  private readonly failures = new Map<number, number>();
  /** Lowest rung worth climbing back to; below this it has already failed. */
  private floor = 0;
  /** The rung the last climb started from, to notice it being undone. */
  private climbedFrom = -1;
  /**
   * Take the next measured frame as the averages rather than blending it in.
   *
   * True from the start, not only after a disturbance: the values the averages
   * are declared with are a guess at a machine nobody has measured yet, and
   * blending away from them leaves a window in which they are neither the guess
   * nor the truth. That window is long enough to act in -- a fresh controller
   * on a 40fps machine would find both averages still optimistic on its second
   * frame and offer a climb on the strength of them.
   */
  private priming = true;

  /**
   * Look away for a moment: the workload has changed under the measurement.
   *
   * Also throws away what the averages currently say. Skipping samples during
   * the settle window keeps the *old* workload's numbers intact, so the first
   * decision afterwards is made about a mode that is no longer running --
   * enough, going from a cheap mode to an expensive one, to climb a rung on
   * the strength of the old one and then hold that for eight seconds before
   * noticing. They are re-primed from the first frame that is actually
   * measured, rather than reset to a guess.
   */
  disturb(): void {
    this.settle = SETTLE;
    this.priming = true;
  }

  /**
   * Forget what was learned about a workload that is no longer running.
   *
   * The failure record is the part that matters. It exists to stop a machine
   * flickering between two pictures it cannot choose between, which is only
   * ever true of one workload; carried across a mode change it becomes a
   * permanent verdict on a question nobody asked again.
   */
  forget(): void {
    this.failures.clear();
    this.floor = 0;
    this.climbedFrom = -1;
    this.disturb();
  }

  /** A resize may mean a different display, and nothing else moves this. */
  resetRefresh(): void {
    this.refresh = ASSUMED_REFRESH;
  }

  /** Wait this long before moving again, after a change made from outside. */
  hold(seconds: number): void { this.held = Math.max(this.held, seconds); }

  /** Where the ladder is asked to go, or null to leave it where it is. */
  update(s: FrameSample, view: LadderView): number | null {
    // Frames measured behind a panel or in a window nobody is looking at are
    // measuring the throttle and the suspended step, not the machine. They
    // used to reach the averages, which meant a settings visit fed near-zero
    // work in while the hold quietly expired.
    if (view.idle) { this.settle = SETTLE; return null; }
    if (this.settle > 0) { this.settle -= s.dt; return null; }

    // The first frame after a disturbance replaces the averages instead of
    // being blended into them, so nothing of the previous workload survives
    // into the first decision about this one.
    const k = this.priming ? 1 : Math.min(1, s.dt * 4);
    this.frameAvg += ((s.stepMs + s.drawMs) - this.frameAvg) * k;
    if (s.frameMs < STALL_MS) {
      this.wallAvg += (s.frameMs - this.wallAvg) * k;
      this.refresh = Math.min(this.refresh, Math.max(4, s.frameMs));
      this.priming = false;
    }

    this.held -= s.dt;
    if (this.held > 0) return null;
    // A pinned preset is a decision. A setting that then drifts is not one.
    if (!view.auto) return null;

    // The wall clock needs the display's own rate to mean anything -- 2.4x
    // baseline on a 144Hz panel is still 60fps and perfectly playable -- so a
    // floor of 20ms sits under it.
    const late = this.wallAvg > Math.max(this.refresh * 1.5, 20) || this.frameAvg > 13;
    if (late) {
      // Two at a time when the frame is not close: under 30fps, walking down
      // one rung every three seconds spends half a minute unplayable.
      const jump = this.wallAvg > 33 ? 2 : 1;
      let next = view.rung;
      for (let i = 0; i < jump; i++) next = view.nextEffective(next);
      if (next === view.rung) return null;
      // At or *beyond* the rung the last climb started from counts as undoing
      // it. Requiring an exact landing missed every two-rung shed, so a cycle
      // of climbing to 4 and jumping back to 6 was never counted and could
      // repeat all session.
      //
      // Counted once, and then the marker is cleared. Leaving it standing made
      // every *subsequent* shed look like another failed recovery: carrying on
      // down from 5 to 6 under continued overload would be recorded against
      // rung 5, which nothing had ever tried to climb to -- and a later genuine
      // attempt at it would then hit the limit after a single failure and be
      // refused for the rest of the session.
      if (this.climbedFrom >= 0 && next >= this.climbedFrom) {
        this.failures.set(view.rung, (this.failures.get(view.rung) ?? 0) + 1);
        this.climbedFrom = -1;
      }
      this.held = SHED_HOLD;
      return next;
    }

    const comfortable = this.frameAvg < 7
      && this.wallAvg < Math.max(this.refresh * 1.15, COMFORTABLE_MS);
    if (!comfortable || view.rung <= this.floor) return null;

    const target = view.rung - 1;
    // Tried and lost twice already: stop offering it, or the session is spent
    // flickering between two pictures.
    if ((this.failures.get(target) ?? 0) >= GIVE_UP_AFTER) {
      this.floor = view.rung;
      return null;
    }
    this.climbedFrom = view.rung;
    this.held = CLIMB_HOLD;
    return target;
  }
}
