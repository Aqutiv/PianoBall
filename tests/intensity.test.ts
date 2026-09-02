import { describe, expect, it } from 'vitest';
import { RUNGS, intensityOf } from '../src/game/intensity';

/** A ball in play and nothing yet to show for it. */
const quiet = { playing: true, combo: 0, resonance: 1, multiball: 1 };

describe('intensity', () => {
  it('is nothing while no ball is in play, whatever the scoring says', () => {
    expect(intensityOf({ playing: false, combo: 40, resonance: 4, multiball: 4 })).toBe(0);
  });

  it('is the top rung the moment a second ball is loose', () => {
    expect(intensityOf({ ...quiet, multiball: 2 })).toBe(3);
  });

  it('climbs the rungs on the combo alone', () => {
    RUNGS.forEach((rung, i) => {
      expect(intensityOf({ ...quiet, combo: rung.combo })).toBe(i + 1);
      expect(intensityOf({ ...quiet, combo: rung.combo - 1 })).toBe(i);
    });
  });

  it('climbs the same rungs on resonance alone', () => {
    RUNGS.forEach((rung, i) => {
      expect(intensityOf({ ...quiet, resonance: rung.resonance })).toBe(i + 1);
      expect(intensityOf({ ...quiet, resonance: rung.resonance - 0.05 })).toBe(i);
    });
  });

  it('never falls as the combo grows', () => {
    let last = 0;
    for (let combo = 0; combo < 40; combo++) {
      const level = intensityOf({ ...quiet, combo });
      expect(level).toBeGreaterThanOrEqual(last);
      last = level;
    }
  });
});
