import { describe, expect, it } from 'vitest';
import { Particles } from '../src/render/particles';

/** Fill the pool past whatever cap is in force. */
function flood(p: Particles, n: number): void {
  for (let i = 0; i < n; i++) p.spawn('spark', 0, 0, 0, { maxLife: 10 });
}

describe('the particle pool', () => {
  it('honours the budget it is given', () => {
    // The whole point of the field. It was assigned in five places and read in
    // none, so the adaptive pass's drop to 500 under load shed nothing at all
    // and an overloaded machine kept paying for fourteen hundred particles.
    const p = new Particles();
    p.budget = 40;
    flood(p, 200);
    expect(p.liveCount).toBe(40);
  });

  it('sheds down to a lowered budget rather than waiting the particles out', () => {
    const p = new Particles();
    flood(p, 300);
    expect(p.liveCount).toBe(300);
    p.budget = 50;
    // Nothing here is anywhere near the end of its life, so only the cap can
    // bring the count down.
    p.update(1 / 60);
    expect(p.liveCount).toBe(50);
  });

  it('takes a raised budget back up', () => {
    const p = new Particles();
    p.budget = 10;
    flood(p, 50);
    expect(p.liveCount).toBe(10);
    p.budget = 100;
    flood(p, 50);
    expect(p.liveCount).toBe(60);
  });

  it('spawns nothing at all when the budget is zero', () => {
    // A real setting, and the one that has no slot to hand out.
    const p = new Particles();
    p.budget = 0;
    flood(p, 20);
    expect(p.liveCount).toBe(0);
    expect(() => p.update(1 / 60)).not.toThrow();
  });

  it('retires particles as they expire, without disturbing the living', () => {
    const p = new Particles();
    p.spawn('spark', 1, 0, 0, { maxLife: 0.05 });
    p.spawn('spark', 2, 0, 0, { maxLife: 10 });
    p.spawn('spark', 3, 0, 0, { maxLife: 0.05 });
    p.spawn('spark', 4, 0, 0, { maxLife: 10 });
    expect(p.liveCount).toBe(4);
    // Long enough to take the two short ones and nothing else. Retiring swaps
    // the tail down over the dead slot, so the survivors have to be re-checked
    // at the same index or a live particle gets stepped over.
    p.update(0.1);
    expect(p.liveCount).toBe(2);
    p.update(0.1);
    expect(p.liveCount).toBe(2);
  });

  it('clears to empty', () => {
    const p = new Particles();
    flood(p, 100);
    p.clear();
    expect(p.liveCount).toBe(0);
    flood(p, 5);
    expect(p.liveCount).toBe(5);
  });

  it('keeps serving slots once the budget is full', () => {
    // Past the cap a spawn overwrites rather than being dropped: an effect the
    // player triggered should still show, even if something older pays for it.
    const p = new Particles();
    p.budget = 8;
    flood(p, 8);
    p.spawn('ring', 99, 0, 0, { maxLife: 10 });
    expect(p.liveCount).toBe(8);
  });
});
