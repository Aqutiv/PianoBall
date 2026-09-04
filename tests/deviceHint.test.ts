import { describe, expect, it } from 'vitest';
import { MAX_SEED_RUNG, seedRung } from '../src/render/deviceHint';

/**
 * The guess only has to be roughly right, and it has to be *safe* when it is
 * wrong: too high on a capable machine is a soft picture nobody asked for,
 * where too low on a weak one is a couple of seconds the measured controller
 * then fixes. So the interesting assertions are about the ceiling and about
 * what happens when the browser tells us nothing.
 */
describe('device hint seeding', () => {
  it('starts at the top when the browser says nothing', () => {
    expect(seedRung({})).toBe(0);
  });

  it('leaves a capable desktop where it is', () => {
    expect(seedRung({ cores: 16, memoryGB: 8, pixels: 1920 * 1080 })).toBe(0);
  });

  it('drops a thin laptop a rung or two', () => {
    // A 2017 dual-core-four-thread with a 1080p panel.
    expect(seedRung({ cores: 4, memoryGB: 8, pixels: 1920 * 1080 })).toBe(2);
    // The same machine driving a 4K panel at a ratio of two.
    expect(seedRung({ cores: 4, memoryGB: 4, pixels: 3840 * 2160 })).toBe(MAX_SEED_RUNG);
  });

  it('counts pixels, not just threads', () => {
    const modest = seedRung({ cores: 8, memoryGB: 8, pixels: 1366 * 768 });
    const huge = seedRung({ cores: 8, memoryGB: 8, pixels: 3840 * 2160 });
    expect(huge).toBeGreaterThan(modest);
  });

  it('takes the player at their word about saving data', () => {
    expect(seedRung({ cores: 16, memoryGB: 8, pixels: 1920 * 1080, saveData: true })).toBe(2);
  });

  it('never guesses past the ceiling, however bad the machine looks', () => {
    expect(seedRung({ cores: 1, memoryGB: 0.5, pixels: 7680 * 4320, saveData: true }))
      .toBe(MAX_SEED_RUNG);
  });

  it('ignores a missing or nonsensical core count rather than punishing it', () => {
    expect(seedRung({ cores: 0, memoryGB: 8, pixels: 1920 * 1080 })).toBe(0);
    expect(seedRung({ memoryGB: 8, pixels: 1920 * 1080 })).toBe(0);
  });
});
