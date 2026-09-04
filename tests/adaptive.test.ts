import { describe, expect, it } from 'vitest';
import { Adaptive, type LadderView } from '../src/app/adaptive';
import { MAX_RUNG } from '../src/render/tiers';

/**
 * The adaptive controller, driven by invented frame times.
 *
 * Every bug this has had -- and it had nine, across two rounds of review --
 * was in this state machine rather than in anything it draws, and none was
 * reachable by a test while the logic lived inside a class that needs a DOM to
 * exist. The measurable half of the performance work was verified well; this
 * half was not, which is exactly why it is where all of it went wrong.
 *
 * The behaviours below are the ones that were broken. They are written as
 * questions about what happens over a minute of being too slow, because that
 * is the timescale on which the faults appeared and the one no amount of
 * reading the code made obvious.
 */

/** A ladder with no inert rungs, which is the plain case. */
function ladder(over: Partial<LadderView> = {}): LadderView {
  return {
    rung: 0,
    auto: true,
    idle: false,
    nextEffective: (from) => Math.min(MAX_RUNG, from + 1),
    ...over,
  };
}

/**
 * Run `seconds` of frames at a given wall-clock pace, applying whatever the
 * controller asks for, and report where the ladder ended up.
 */
function run(a: Adaptive, opts: {
  seconds: number;
  /** Wall-clock milliseconds per frame -- 16.7 is 60fps, 33 is 30fps. */
  frameMs: number;
  /** Measured work per frame. Independent of the above on purpose. */
  workMs?: number;
  rung?: number;
  view?: Partial<LadderView>;
}): { rung: number; moves: number[] } {
  const frameMs = opts.frameMs;
  const workMs = opts.workMs ?? 2;
  let rung = opts.rung ?? 0;
  const moves: number[] = [];
  const frames = Math.round((opts.seconds * 1000) / frameMs);
  for (let i = 0; i < frames; i++) {
    const target = a.update(
      { stepMs: workMs * 0.3, drawMs: workMs * 0.7, frameMs, dt: frameMs / 1000 },
      ladder({ ...opts.view, rung }),
    );
    if (target !== null) { rung = target; moves.push(target); }
  }
  return { rung, moves };
}

describe('the adaptive controller', () => {
  it('leaves a machine that is keeping up alone', () => {
    const a = new Adaptive();
    const { rung, moves } = run(a, { seconds: 60, frameMs: 16.7, workMs: 3 });
    expect(rung).toBe(0);
    expect(moves).toEqual([]);
  });

  it('sheds when the wall clock is late even though the work looks cheap', () => {
    // The compositing case, and the whole reason there are two signals: this
    // machine spends 2ms of its own time per frame and still only manages
    // 30fps, which the work signal alone would call perfectly healthy.
    const a = new Adaptive();
    const { rung } = run(a, { seconds: 30, frameMs: 33, workMs: 2 });
    expect(rung).toBeGreaterThan(0);
  });

  it('sheds when the work is late even though the display looks fine', () => {
    // The other way round: vsync holds the gap at 16.7 whatever happens, so a
    // frame that spends 20ms of its own time has to be caught by the work.
    const a = new Adaptive();
    const { rung } = run(a, { seconds: 30, frameMs: 16.7, workMs: 20 });
    expect(rung).toBeGreaterThan(0);
  });

  it('does not let a slow machine become its own definition of fast', () => {
    // The worst bug of the nine. The refresh estimate used to creep upward, so
    // half a minute at 30fps moved the baseline to 33ms -- and the controller
    // then measured the failure against itself, decided it was comfortable,
    // and climbed back rather than shedding further.
    const a = new Adaptive();
    const before = a.refresh;
    const { rung } = run(a, { seconds: 60, frameMs: 33, workMs: 2 });
    expect(a.refresh).toBeLessThanOrEqual(before);
    // And it kept going down the ladder rather than turning around.
    expect(rung).toBeGreaterThanOrEqual(3);
  });

  it('takes two rungs at a time when the frame is nowhere near', () => {
    // Not on the very first move: the average is still climbing towards 50ms
    // when the controller first decides it is late, and at that point all it
    // knows is that things are moderately bad. Once it has settled below
    // 30fps, it stops walking.
    const a = new Adaptive();
    const { moves } = run(a, { seconds: 20, frameMs: 50, workMs: 2 });
    const steps = moves.map((m, i) => m - (i === 0 ? 0 : moves[i - 1]!));
    expect(Math.max(...steps)).toBe(2);

    // And a machine that is merely a little late still walks one at a time.
    // 30ms is 33fps: past the threshold, but not the sub-30fps that earns the
    // bigger step.
    const b = new Adaptive();
    const gentle = run(b, { seconds: 30, frameMs: 30, workMs: 2 });
    const gentleSteps = gentle.moves.map((m, i) => m - (i === 0 ? 0 : gentle.moves[i - 1]!));
    expect(gentleSteps.length).toBeGreaterThan(1);
    expect(Math.max(...gentleSteps)).toBe(1);
  });

  it('climbs back when the machine recovers, one rung at a time', () => {
    const a = new Adaptive();
    const slow = run(a, { seconds: 20, frameMs: 33, workMs: 2 });
    expect(slow.rung).toBeGreaterThan(0);

    const fast = run(a, { seconds: 60, frameMs: 16.7, workMs: 2, rung: slow.rung });
    expect(fast.rung).toBeLessThan(slow.rung);
    // Never more than one at a time on the way up.
    let last = slow.rung;
    for (const m of fast.moves) { expect(last - m).toBe(1); last = m; }
  });

  it('stops offering a rung it has been pushed off twice', () => {
    // A machine that sits exactly on the boundary would otherwise spend the
    // session flickering between two pictures.
    // Driven by the mechanism rather than by the clock: hold it at one rung,
    // wait for a climb to be offered, push it straight back, and count how
    // many times it is willing to try.
    //
    // Held at one rung on purpose. The latch is per-rung -- "can this machine
    // hold rung 3?" is a different question from "can it hold rung 4?" -- so a
    // session that drifts downward does keep earning fresh chances at each new
    // rung until it bottoms out. That is intended; what must not happen is the
    // *same* rung being offered forever.
    const a = new Adaptive();
    /** Feed frames at this pace until it asks to move, or give up. */
    const awaitMove = (frameMs: number, work: number, rung: number): number | null => {
      for (let i = 0; i < 4000; i++) {
        const t = a.update(
          { stepMs: work * 0.3, drawMs: work * 0.7, frameMs, dt: frameMs / 1000 },
          ladder({ rung }),
        );
        if (t !== null) return t;
      }
      return null;
    };

    let offered = 0;
    for (let cycle = 0; cycle < 6; cycle++) {
      const up = awaitMove(16.7, 2, 4);
      if (up === null) break;           // no longer willing to try rung 3
      expect(up).toBe(3);
      offered++;
      // Pushed straight back onto the rung it just left.
      expect(awaitMove(33, 2, up)).toBe(4);
    }
    expect(offered).toBe(2);
    // And it stays refused.
    expect(awaitMove(16.7, 2, 4)).toBeNull();
  });

  it('counts a failed recovery even when the shed jumps straight past it', () => {
    // The two-rung jump is what makes this subtle. A climb from 5 to 4 that is
    // answered by a severe slowdown lands at 6, not 5 -- and while undoing a
    // climb was recognised only by an exact landing, that cycle was never
    // counted and could repeat for the whole session.
    const a = new Adaptive();
    const awaitMove = (frameMs: number, rung: number): number | null => {
      for (let i = 0; i < 4000; i++) {
        const t = a.update(
          { stepMs: 0.6, drawMs: 1.4, frameMs, dt: frameMs / 1000 },
          ladder({ rung }),
        );
        if (t !== null) return t;
      }
      return null;
    };

    let offered = 0;
    for (let cycle = 0; cycle < 6; cycle++) {
      const up = awaitMove(16.7, 5);
      if (up === null) break;
      expect(up).toBe(4);
      offered++;
      // 50ms is under 20fps, which sheds two at a time -- so it lands on 6,
      // past the 5 it climbed out of.
      expect(awaitMove(50, up)).toBe(6);
    }
    expect(offered).toBe(2);
  });

  it('does not read continued overload as a second failed recovery', () => {
    // A climb is undone once. Everything after that is the machine carrying on
    // down under load, not another attempt -- but while the marker stood, each
    // further shed was recorded against a rung nothing had ever tried to climb
    // to, and a later genuine attempt at that rung would be refused after a
    // single real failure.
    const a = new Adaptive();
    const feed = (frameMs: number, rung: number): number | null => {
      for (let i = 0; i < 4000; i++) {
        const t = a.update(
          { stepMs: 0.6, drawMs: 1.4, frameMs, dt: frameMs / 1000 },
          ladder({ rung }),
        );
        if (t !== null) return t;
      }
      return null;
    };

    // Climb out of 5, be pushed back to it, then keep sliding under load.
    expect(feed(16.7, 5)).toBe(4);
    expect(feed(33, 4)).toBe(5);
    expect(feed(33, 5)).toBe(6);
    expect(feed(33, 6)).toBe(7);

    // Rung 5 has never been climbed to, so it is still worth two real tries.
    expect(feed(16.7, 6)).toBe(5);
    expect(feed(33, 5)).toBe(6);
    expect(feed(16.7, 6)).toBe(5);
  });

  it('does not judge a new workload by the one that just stopped', () => {
    // Cheap mode for a while, then a switch to an expensive one. Without
    // re-priming, the comfortable averages survive the settle window and the
    // controller climbs on the strength of a mode that is no longer running.
    // The new workload is vsync-capped, so the wall clock says nothing and the
    // whole question rests on the work average -- which is precisely the number
    // the old mode left sitting at 2ms. Blended in one frame at a time it stays
    // under the comfortable threshold long enough for the controller to offer a
    // climb it has no business offering.
    const a = new Adaptive();
    run(a, { seconds: 40, frameMs: 16.7, workMs: 2, rung: 3 });
    a.forget();
    const { moves } = run(a, { seconds: 4, frameMs: 16.7, workMs: 30, rung: 3 });
    expect(moves.length).toBeGreaterThan(0);
    // Downward, every time. A climb here would be a verdict on the mode that
    // just stopped.
    expect(moves.every((m) => m > 3)).toBe(true);
  });

  it('lets a fifty-hertz display take back what it gave up', () => {
    // A 50Hz panel sits at 20ms. That is comfortably under the late threshold,
    // but it used to be over the recovery threshold of 1.15x an assumed 60Hz --
    // so such a display could never be comfortable, and anything it shed once
    // it kept for the rest of the session.
    const a = new Adaptive();
    const start = 4;
    const { rung } = run(a, { seconds: 90, frameMs: 20, workMs: 2, rung: start });
    expect(rung).toBeLessThan(start);
  });

  it('still gives nothing back to a machine that is merely nearly fast enough', () => {
    // The band between comfortable and late is deliberately empty: 24ms is
    // neither good enough to take something back nor bad enough to give
    // something up, and a ladder that moved here would hunt.
    const a = new Adaptive();
    const { moves } = run(a, { seconds: 90, frameMs: 24, workMs: 2, rung: 4 });
    expect(moves).toEqual([]);
  });

  it('never measures a frame drawn behind a panel', () => {
    const a = new Adaptive();
    const work = a.frameAvg, wall = a.wallAvg;
    // Two minutes of the throttled, suspended frames a settings visit produces.
    run(a, { seconds: 120, frameMs: 33, workMs: 0, view: { idle: true } });
    expect(a.frameAvg).toBe(work);
    expect(a.wallAvg).toBe(wall);
  });

  it('looks away for a moment after a panel closes', () => {
    // Otherwise the first frames of the resumed workload -- which are the
    // expensive ones, a bake among them -- are read as the steady state.
    const a = new Adaptive();
    run(a, { seconds: 2, frameMs: 33, workMs: 0, view: { idle: true } });
    const { moves } = run(a, { seconds: 1, frameMs: 16.7, workMs: 2 });
    expect(moves).toEqual([]);
  });

  it('does not move a rung the player has pinned', () => {
    const a = new Adaptive();
    const { rung, moves } = run(a, { seconds: 60, frameMs: 50, workMs: 40, rung: 2, view: { auto: false } });
    expect(rung).toBe(2);
    expect(moves).toEqual([]);
  });

  it('stops rather than spinning when the ladder has nothing left to give', () => {
    const a = new Adaptive();
    const { moves } = run(a, {
      seconds: 40, frameMs: 50, workMs: 40, rung: MAX_RUNG,
      // Already at the bottom: nothing further is effective.
      view: { nextEffective: () => MAX_RUNG },
    });
    expect(moves).toEqual([]);
  });

  it('forgets what it learned when the workload changes', () => {
    const a = new Adaptive();
    // Earn a floor by failing to hold rung 3 twice.
    let rung = 3;
    for (let i = 0; i < 8; i++) {
      rung = run(a, { seconds: 12, frameMs: 16.7, workMs: 2, rung }).rung;
      rung = run(a, { seconds: 8, frameMs: 33, workMs: 2, rung }).rung;
    }
    a.forget();
    // A cheaper mode should be able to climb all the way back out.
    const after = run(a, { seconds: 120, frameMs: 16.7, workMs: 2, rung });
    expect(after.rung).toBe(0);
  });
});
