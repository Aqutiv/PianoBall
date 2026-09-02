import { describe, expect, it } from 'vitest';
import {
  MAX_Q, MECHS, MECH_NAMES, SURFACES, ShotBudget, modeQ, type MechSpec,
} from '../src/audio/surfaces';
import { SOUND_TAGS } from '../src/physics/colliders';
import { STRIKES } from '../src/modes/pinball/strikes';

describe('the surfaces', () => {
  it('give every material the physics can name a sound, and only silent is silent', () => {
    for (const tag of SOUND_TAGS) {
      const s = SURFACES[tag];
      expect(s, tag).toBeDefined();
      if (tag === 'silent') {
        expect(s.gain).toBe(0);
        continue;
      }
      expect(s.gain, tag).toBeGreaterThan(0);
      expect(s.modes.length, tag).toBeGreaterThan(0);
      expect(s.modes.length, `${tag} has too many modes`).toBeLessThanOrEqual(5);
    }
  });

  it('keeps every mode where a resonator can ring it', () => {
    for (const tag of SOUND_TAGS) {
      const s = SURFACES[tag];
      let last = 0;
      for (const [ratio, gain, t60] of s.modes) {
        expect(ratio, `${tag} ratio`).toBeGreaterThan(last);
        last = ratio;
        expect(gain, `${tag} gain`).toBeGreaterThan(0);
        expect(gain, `${tag} gain`).toBeLessThanOrEqual(1);
        expect(t60, `${tag} t60`).toBeGreaterThanOrEqual(0.005);
        expect(t60, `${tag} t60`).toBeLessThanOrEqual(1);
        expect(modeQ(s.base * ratio, t60), `${tag} q`).toBeLessThanOrEqual(MAX_Q);
      }
      expect(s.velBright, tag).toBeGreaterThanOrEqual(s.bright);
      expect(s.burst, tag).toBeGreaterThan(0);
      expect(s.burst, `${tag} burst is in milliseconds`).toBeLessThan(20);
      if (s.thump) {
        expect(s.thump.drop, tag).toBeGreaterThanOrEqual(1);
        expect(s.thump.decay, tag).toBeLessThanOrEqual(0.3);
      }
    }
  });

  it('derives a resonator Q that rings for the time asked, up to a cap', () => {
    // A second-order resonator falls sixty decibels in about 2.2 Q / f.
    expect(modeQ(1000, 0.22)).toBeCloseTo(100, 6);
    expect(modeQ(140, 0.04)).toBeCloseTo(2.545, 3);
    expect(modeQ(3200, 4)).toBe(MAX_Q);
  });
});

describe('the mechanisms', () => {
  it('are all named, made of something, and over quickly', () => {
    const longest = (m: MechSpec) => Math.max(
      (m.thump?.delay ?? 0) + (m.thump?.decay ?? 0),
      (m.click?.delay ?? 0) + (m.click?.decay ?? 0),
      (m.rattle?.delay ?? 0) + (m.rattle?.decay ?? 0),
      m.sweep?.decay ?? 0,
    );
    for (const name of MECH_NAMES) {
      const m = MECHS[name];
      expect(m, name).toBeDefined();
      expect(Boolean(m.thump || m.click || m.rattle || m.sweep || m.surface), `${name} is empty`).toBe(true);
      expect(longest(m), `${name} outstays its welcome`).toBeLessThanOrEqual(0.5);
      if (m.surface) expect(SURFACES[m.surface.tag], name).toBeDefined();
    }
    expect(Object.keys(MECHS).sort()).toEqual([...MECH_NAMES].sort());
  });

  it('are the only mechanisms the table asks for', () => {
    for (const [family, s] of Object.entries(STRIKES)) {
      if (s.mech) expect(MECHS[s.mech.name], `${family}/${s.mech.name}`).toBeDefined();
      if (s.roll) expect(MECHS[s.roll.mech], `${family}/${s.roll.mech}`).toBeDefined();
    }
  });
});

describe('the one-shot budget', () => {
  function shot() {
    let cuts = 0;
    return { cut: () => { cuts++; }, get cuts() { return cuts; } };
  }

  it('lets everything through until it is full', () => {
    const budget = new ShotBudget(3);
    const a = shot(), b = shot(), c = shot();
    expect(budget.admit(0, 1, 1, a.cut)).toBe(true);
    expect(budget.admit(0, 1, 1, b.cut)).toBe(true);
    expect(budget.admit(0, 1, 1, c.cut)).toBe(true);
    expect(budget.size).toBe(3);
    expect(a.cuts + b.cuts + c.cuts).toBe(0);
  });

  it('cuts the least important, oldest sound to make room for a bigger one', () => {
    const budget = new ShotBudget(3);
    const wall = shot(), scrape = shot(), scrape2 = shot();
    budget.admit(0, 1, 1, wall.cut);
    budget.admit(0, 0, 1, scrape.cut);
    budget.admit(0, 0, 1, scrape2.cut);
    expect(budget.admit(0, 3, 1, shot().cut)).toBe(true);
    expect(scrape.cuts).toBe(1);
    expect(scrape2.cuts).toBe(0);
    expect(wall.cuts).toBe(0);
    expect(budget.size).toBe(3);
  });

  it('refuses a newcomer that matters less than everything already sounding', () => {
    const budget = new ShotBudget(2);
    const a = shot(), b = shot();
    budget.admit(0, 3, 1, a.cut);
    budget.admit(0, 3, 1, b.cut);
    expect(budget.admit(0, 1, 1, shot().cut)).toBe(false);
    // Equal weight is not more weight: the older one stays.
    expect(budget.admit(0, 3, 1, shot().cut)).toBe(false);
    expect(a.cuts + b.cuts).toBe(0);
  });

  it('forgets what has already finished', () => {
    const budget = new ShotBudget(2);
    budget.admit(0, 1, 0.5, shot().cut);
    budget.admit(0, 1, 0.5, shot().cut);
    expect(budget.admit(0.4, 1, 1, shot().cut)).toBe(false);
    expect(budget.admit(0.6, 1, 1, shot().cut)).toBe(true);
    expect(budget.size).toBe(1);
  });

  it('can be made smaller on the fly', () => {
    const budget = new ShotBudget(3);
    budget.admit(0, 1, 1, shot().cut);
    budget.admit(0, 1, 1, shot().cut);
    budget.max = 2;
    expect(budget.admit(0, 1, 1, shot().cut)).toBe(false);
    expect(budget.admit(0, 2, 1, shot().cut)).toBe(true);
    expect(budget.size).toBe(2);
  });
});
