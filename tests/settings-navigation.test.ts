import { describe, expect, it } from 'vitest';
import { SettingsNavigation } from '../src/ui/settingsNavigation';

describe('settings navigation', () => {
  it('starts desktop settings on Sound and selects the current game without switching it', () => {
    const nav = new SettingsNavigation();
    nav.enter(false, 'freestyle');
    expect(nav.category).toBe('sound');
    expect(nav.mode).toBe('freestyle');
    expect(nav.index).toBe(false);
    expect(nav.back(false)).toBe(false);
  });

  it('consumes mobile Back once, then lets the overlay return to its origin', () => {
    const nav = new SettingsNavigation();
    nav.enter(true, 'pinball');
    expect(nav.index).toBe(true);
    nav.select('appearance');
    expect(nav.index).toBe(false);
    expect(nav.back(true)).toBe(true);
    expect(nav.focusId).toBe('settings-nav-appearance');
    expect(nav.back(true)).toBe(false);
  });

  it('reopens mobile at the list but retains the chosen category, mode and details', () => {
    const nav = new SettingsNavigation();
    nav.enter(true, 'pinball');
    nav.select('modes');
    nav.mode = 'playtune';
    nav.expanded.add('modes-timing');
    nav.scroll.set(nav.pageKey, 180);
    nav.enter(true, 'freestyle');
    expect(nav.index).toBe(true);
    expect(nav.category).toBe('modes');
    expect(nav.mode).toBe('playtune');
    expect(nav.expanded.has('modes-timing')).toBe(true);
    expect(nav.scroll.get(nav.pageKey)).toBe(180);
  });

  it('returns from calibration directly to Controls, ready to restore focus', () => {
    const nav = new SettingsNavigation();
    nav.enter(true, null);
    nav.returnFromCalibration();
    expect(nav.category).toBe('controls');
    expect(nav.index).toBe(false);
    expect(nav.focusId).toBe('cal');
    expect(nav.back(true)).toBe(true);
  });

  it('retains desktop location and keeps a separate scroll position for each game', () => {
    const nav = new SettingsNavigation();
    nav.enter(false, 'pinball');
    nav.select('modes');
    nav.mode = 'playtune';
    nav.scroll.set(nav.pageKey, 150);
    nav.mode = 'freestyle';
    expect(nav.scroll.get(nav.pageKey)).toBeUndefined();
    nav.scroll.set(nav.pageKey, 35);
    nav.enter(false, 'pinball');
    expect(nav.category).toBe('modes');
    expect(nav.scroll.get(nav.pageKey)).toBe(35);
    nav.mode = 'playtune';
    expect(nav.scroll.get(nav.pageKey)).toBe(150);
  });
});
