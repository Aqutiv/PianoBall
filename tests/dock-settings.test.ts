import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

/** The settings module as a fresh page load would find it. */
async function reload() {
  vi.resetModules();
  return import('../src/render/dockSettings');
}

describe('dock settings', () => {
  beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('remembers the key size and the touch window across a reload, and resets both', async () => {
    const first = await reload();
    expect(first.dockSettings()).toEqual(first.DEFAULT_DOCK_SETTINGS);
    first.setDockSettings({ keySize: 'large', touchCenter: 72 });

    const second = await reload();
    expect(second.dockSettings()).toEqual({ keySize: 'large', touchCenter: 72 });
    second.resetDockSettings();

    const third = await reload();
    expect(third.dockSettings()).toEqual(third.DEFAULT_DOCK_SETTINGS);
  });

  it('repairs a stored value it could not lay keys out with', async () => {
    localStorage.setItem('pianoball.dock', JSON.stringify({ keySize: 'huge', touchCenter: 61.4 }));
    const s = await reload();
    expect(s.dockSettings()).toEqual({ keySize: 'comfortable', touchCenter: 60 });
    s.setDockSettings({ touchCenter: 500 });
    expect(s.dockSettings().touchCenter).toBe(96);
  });

  it('lays out for fingers only on a touch screen with no MIDI keyboard', async () => {
    const s = await reload();
    const input = (status: string, devices: number) =>
      ({ midi: { status, devices: Array.from({ length: devices }, () => ({})) } }) as never;
    // No window here, so no coarse pointer: the mapped keyboard.
    expect(s.readDockEnv(input('ready', 0)).touch).toBe(false);
    s.setDockOverride('touch');
    expect(s.readDockEnv(input('ready', 0)).touch).toBe(true);
    s.setDockOverride('mapped');
    expect(s.readDockEnv(input('ready', 0)).touch).toBe(false);
    s.setDockOverride(null);
  });
});
