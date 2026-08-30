import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEMES, DEFAULT_THEME, NOCTURNE, findTheme, getTheme, applyTheme } from '../src/render/theme';
import { tone, pitchColor, pitchHue } from '../src/render/palette';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const WALL_STYLES = ['rail', 'wood', 'metal', 'rubber', 'neon', 'sling'] as const;

describe('themes', () => {
  it('offers a default that is one of the themes on the list', () => {
    expect(THEMES).toContain(DEFAULT_THEME);
    expect(DEFAULT_THEME).toBe(NOCTURNE);
  });

  it('gives every theme a unique id and a name to show', () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of THEMES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.blurb.length).toBeGreaterThan(0);
    }
  });

  it('lands on the default for an id that no longer exists', () => {
    // A theme can be removed between releases; a saved preference naming it
    // must not leave the app with no colours at all.
    expect(findTheme('a-theme-that-was-deleted')).toBe(DEFAULT_THEME);
    expect(findTheme(null)).toBe(DEFAULT_THEME);
    expect(findTheme(undefined)).toBe(DEFAULT_THEME);
    expect(findTheme(NOCTURNE.id)).toBe(NOCTURNE);
  });

  it('gives every theme a colour for every wall style', () => {
    // `wallColors` indexes this record directly, so a missing style would draw
    // a wall as undefined rather than falling back to something visible.
    for (const t of THEMES) {
      for (const style of WALL_STYLES) {
        expect(t.walls[style], `${t.id} is missing wall style ${style}`).toBeDefined();
        expect(t.walls[style]).toHaveLength(2);
      }
    }
  });

  it('gives every theme six ball gradient stops', () => {
    // The renderer pairs these with a fixed list of gradient offsets.
    for (const t of THEMES) expect(t.ball.body, t.id).toHaveLength(6);
  });

  it('applies a theme without a document', () => {
    // The headless tests import the render modules freely; this must not throw.
    expect(() => applyTheme(NOCTURNE)).not.toThrow();
    expect(getTheme()).toBe(NOCTURNE);
  });
});

describe('the tone curve', () => {
  beforeEach(() => applyTheme(NOCTURNE));

  /**
   * The load-bearing guarantee of the whole extraction: routing every `hsl()`
   * in the app through `tone()` was only safe because Nocturne's curve is the
   * identity. If that ever stops being true, the original look has silently
   * changed and every "unchanged" claim about the refactor is void.
   */
  it('leaves Nocturne exactly where it was', () => {
    expect(NOCTURNE.tone).toMatchObject({ hueShift: 0, satScale: 1, lightScale: 1 });
    expect(tone(210, 92, 64)).toBe('hsl(210 92% 64%)');
    expect(tone(0, 40, 45)).toBe('hsl(0 40% 45%)');
    expect(tone(330, 100, 96, 0.5)).toBe('hsl(330 100% 96% / 0.5)');
    // Computed lightness, as the bumper cap and the target lip both pass.
    expect(tone(120, 82, 52 + 0.5 * 30)).toBe('hsl(120 82% 67%)');
  });

  it('reads its defaults for pitchColor from the theme', () => {
    expect(pitchColor(60)).toBe(`hsl(${pitchHue(60)} ${NOCTURNE.tone.sat}% ${NOCTURNE.tone.light}%)`);
  });

  it('keeps saturation and lightness inside the range hsl accepts', () => {
    const loud = { ...NOCTURNE, id: 'loud', tone: { ...NOCTURNE.tone, satScale: 4, lightScale: 4 } };
    applyTheme(loud);
    expect(tone(200, 90, 80)).toBe('hsl(200 100% 100%)');
    applyTheme(NOCTURNE);
  });
});

describe('theme persistence', () => {
  beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('remembers the chosen theme and resets to the default', async () => {
    // A fresh module graph, so the settings module re-reads storage on import.
    // Compared by id rather than identity: `resetModules` hands back a second
    // copy of the theme objects, equal in every way but not the same object.
    vi.resetModules();
    const mod = await import('../src/render/themeSettings');
    expect(mod.currentTheme().id).toBe(DEFAULT_THEME.id);

    mod.setThemeId(NOCTURNE.id);
    expect(mod.themeSettings().id).toBe(NOCTURNE.id);
    expect(localStorage.getItem('pianoball.theme')).toContain(NOCTURNE.id);

    mod.resetThemeSettings();
    expect(mod.currentTheme().id).toBe(DEFAULT_THEME.id);
  });
});
