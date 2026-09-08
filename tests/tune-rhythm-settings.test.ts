import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'pianoball.playtuneSettings';
beforeEach(() => {
  vi.resetModules();
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('saved tune rhythm preference', () => {
  it.each([undefined, null, 'false', 0])('defaults a missing or malformed preference to on (%s)', async value => {
    localStorage.setItem(KEY, JSON.stringify({ role: 'chords', offsetMs: 25, rhythmEnabled: value }));
    const { playTuneSettings } = await import('../src/modes/playtune/settings');
    expect(playTuneSettings()).toMatchObject({ role: 'chords', offsetMs: 25, rhythmEnabled: true });
  });

  it('persists false across module reload and role changes, and resets to true', async () => {
    const settings = await import('../src/modes/playtune/settings');
    settings.setPlayTuneSettings({ rhythmEnabled: false, role: 'chords' });
    expect(JSON.parse(localStorage.getItem(KEY)!)).toMatchObject({ rhythmEnabled: false, role: 'chords' });
    vi.resetModules();
    const reloaded = await import('../src/modes/playtune/settings');
    expect(reloaded.playTuneSettings().rhythmEnabled).toBe(false);
    reloaded.setPlayTuneSettings({ role: 'melody' });
    expect(reloaded.playTuneSettings().rhythmEnabled).toBe(false);
    reloaded.resetPlayTuneSettings();
    expect(reloaded.playTuneSettings().rhythmEnabled).toBe(true);
    expect(JSON.parse(localStorage.getItem(KEY)!).rhythmEnabled).toBe(true);
  });
});
