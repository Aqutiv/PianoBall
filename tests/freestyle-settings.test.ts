import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const key = 'pianoball.freestyleSettings';
let values: Map<string, string>;
beforeEach(() => {
  vi.resetModules();
  values = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => values.set(name, value),
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('Freestyle backing preferences', () => {
  it('starts off with Auto, Major and Hold selected', async () => {
    const { freestyleSettings } = await import('../src/modes/freestyle/settings');
    expect(freestyleSettings()).toMatchObject({ bed: false, bedMode: 'auto', manualChordQuality: 'maj', holdChord: true });
  });

  it('migrates existing backing and instrument preferences without changing them', async () => {
    values.set(key, JSON.stringify({ bed: true, voiceId: 'harp', bedVoiceId: 'bed-harp' }));
    const { freestyleSettings } = await import('../src/modes/freestyle/settings');
    expect(freestyleSettings()).toEqual({
      bed: true, voiceId: 'harp', bedVoiceId: 'bed-harp',
      bedMode: 'auto', manualChordQuality: 'maj', holdChord: true,
    });
  });

  it('remembers Manual controls across a reload without storing an active chord', async () => {
    const { setFreestyleSettings } = await import('../src/modes/freestyle/settings');
    setFreestyleSettings({ bed: true, bedMode: 'manual', manualChordQuality: 'min7', holdChord: false });
    vi.resetModules();
    const { freestyleSettings } = await import('../src/modes/freestyle/settings');
    expect(freestyleSettings()).toMatchObject({
      bed: true, bedMode: 'manual', manualChordQuality: 'min7', holdChord: false,
    });
    expect(Object.keys(JSON.parse(values.get(key)!)).sort()).toEqual(
      ['bed', 'bedMode', 'manualChordQuality', 'holdChord', 'voiceId', 'bedVoiceId'].sort());
  });

  it('reset restores Auto without changing other saved settings', async () => {
    const { setFreestyleSettings, resetFreestyleSettings, freestyleSettings, DEFAULT_FREESTYLE } =
      await import('../src/modes/freestyle/settings');
    values.set('pianoball.best', '12345');
    setFreestyleSettings({ bedMode: 'manual', holdChord: false });
    resetFreestyleSettings();
    expect(freestyleSettings()).toEqual(DEFAULT_FREESTYLE);
    expect(values.get('pianoball.best')).toBe('12345');
  });
});
